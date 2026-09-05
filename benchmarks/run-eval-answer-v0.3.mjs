#!/usr/bin/env node
/**
 * 답변 생성 축 실행기 — T5-1 ③ (리바이2 51대)
 *
 * 🔴 이 그물이 태우는 자원은 «되돌릴 수 없다»(Claude 구독). 그래서 순서를 뒤집지 않는다:
 *    ① 교정 게이트(픽스처 · 네트워크 0 · 구독 0) → ② 게이트가 서야만 live 발사 → ③ 채점.
 *    게이트 한 칸이라도 안 서면 `exit 2` 로 «전수를 거부»한다. 못 쓰는 채점기로 쏜 run 은
 *    되돌릴 수 없지만, 안 쏜 run 은 언제든 다시 쏠 수 있다.
 *
 * 🔴 **무엇을 재는가 — 이 그물의 «주어»**
 *    GS-01 live run 은 시나리오 앵커(`investigation/binding.py`)가 고정한 **한 문항**
 *    (`Q-MULTIHOP-001`)에 답한다. 나머지 39문은 «질문을 받는 표면»이 조사 API 에 없어
 *    (`RunRequest = {sessionId, mode}`) 이 축에서 «구현상 불성립»이다 — 0 으로 적지 않고
 *    이름으로 남긴다.
 *
 * 사용:
 *   node run-eval-answer-v0.3.mjs --gate-only                       # 구독 0 · 게이트만
 *   node run-eval-answer-v0.3.mjs --base http://127.0.0.1:8090 --runs 3
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes('--' + n);

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const GT_PATH = arg('ground-truth', path.join(HERE, 'datasets/ground-truth.v0.3.jsonl'));
const OUT = arg('out', path.join(HERE, 'eval-answer-raw-v0.3.jsonl'));
const RUNS = Number(arg('runs', '3'));
const GATE_ONLY = has('gate-only');
const ANCHOR_QID = arg('anchor-question', 'Q-MULTIHOP-001'); // binding.py SCENARIO_ANCHORS['GS-01'].questionId
const SCENARIO = arg('scenario', 'GS-01');

/* ------------------------------------------------------------------ *
 * 0. 공개면 차단 — 다짐이 아니라 «코드가» 막는다
 * ------------------------------------------------------------------ */
// 🔴 화이트리스트다(블랙리스트가 아니다). 새 공개 호스트가 생겨도 여기 손대지 않는 한
//    닿지 않는다 — 「막을 것을 적는」 목록은 언제나 하나를 빠뜨린다.
const PUBLIC_PORTS = new Set(['8010']); // 공개 Sandbox 게이트 — 이 축에서 절대 안 건드린다
function assertLocalBase(base) {
  let u;
  try { u = new URL(base); } catch { throw new Error('base URL 형식이 아니다: ' + base); }
  if (u.protocol !== 'http:') throw new Error('http 만 허용한다(공개면 차단): ' + base);
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') throw new Error('로컬 무대만 허용한다: ' + u.hostname);
  if (PUBLIC_PORTS.has(u.port)) throw new Error('공개면 포트는 이 축에서 금지다: :' + u.port);
  return base.replace(/\/$/, '');
}

/* ------------------------------------------------------------------ *
 * 1. 채점 규칙 — 결정적. LLM judge 0.
 * ------------------------------------------------------------------ */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 🔴 경계는 «ASCII 식별자 문자»로만 잡는다. `\b` 를 쓰면 한글 조사 앞(`EQ-CNC-204의`)에서
//    경계가 서는지가 문자 분류에 끌려간다. 여기서 막아야 하는 것은 둘뿐이다:
//    ① `EQ-CNC-2041` 을 `EQ-CNC-204` 로 읽는 것 ② `XEQ-CNC-204` 를 잡는 것.
const mentions = (text, id) =>
  new RegExp('(?<![0-9A-Za-z-])' + esc(id) + '(?![0-9A-Za-z-])').test(text);

/** 답변 본문 = 채택된 후보들의 rationale 문장 전부(순서 보존). */
const answerText = (cands) =>
  cands.flatMap((c) => (c.rationale && Array.isArray(c.rationale.sentences)) ? c.rationale.sentences : []).join(' ');

/**
 * 지표 5 — Unsupported Claim Count.
 * 🔴 **이 산식의 한계를 먼저 적는다.** 계약(`agent-events v0.1`)의 rationale 형상은
 *    `{sentences[], citedEvidenceIds[]}` 로 **후보 entry 단위**다 — 「이 문장의 인용」이라는
 *    대응이 형상에 없다. 그래서 규칙은 「entry 의 인용이 0건이면 그 entry 의 문장 전부가
 *    미인용」이 될 수밖에 없다. 그리고 `live_synthesis.apply_guard` 가 인용 0건 entry 를
 *    채택 «전»에 거부하므로, 채택된 답변에서 이 값은 **구조적으로 0**이다.
 *    ⇒ 0 이 나와도 그것은 모델이 아니라 «문»의 성질이다. 대조군(인용 삭제)만이 이 채점기가
 *      초록 기계가 아님을 증명한다.
 */
function unsupportedClaims(cands) {
  let n = 0;
  for (const c of cands) {
    const s = (c.rationale && c.rationale.sentences) || [];
    const cited = (c.rationale && c.rationale.citedEvidenceIds) || [];
    if (cited.length === 0) n += s.length;
  }
  return n;
}

/**
 * 지표 5 — **문장 면**. 🔴 앞판의 「문장별 인용 대응이 계약에 없다」는 **틀렸다.**
 * 없는 것은 `runCompleted.candidates[].rationale` **스냅샷 형상**뿐이고,
 * 이벤트 스트림에는 `step.progress{kind:"sentence"}.sentence.citedEvidenceIds` 로 **문장마다** 있다.
 * (스냅샷은 이벤트 정본이 아니다 — 같은 함정을 한 번 더 밟았다.)
 *
 * 이 열이 entry 면보다 중요한 이유: `apply_guard` 는 **entry 단위** 인용만 검사한다.
 * 그래서 entry 면의 0 은 «문이 만든 0»이지만, **문장 면의 0 은 그 문이 만들지 않는다** —
 * 인용 0건 문장이 와도 entry 목록만 차 있으면 guard 를 통과한다. 즉 이 열에는 판정력이 있다.
 */
function unsupportedClaimsPerSentence(events) {
  const sents = events
    .filter((e) => e.type === 'step.progress' && e.payload && e.payload.kind === 'sentence')
    .map((e) => e.payload.sentence)
    .filter(Boolean);
  // 🔴 스트림이 없으면 «0» 이 아니라 «못 잼»이다 — null 로 낸다
  if (sents.length === 0) return { measurable: false, count: null, sentences: 0 };
  return {
    measurable: true,
    sentences: sents.length,
    count: sents.filter((s) => !((s.citedEvidenceIds || []).length)).length,
    citationsPerSentence: sents.map((s) => (s.citedEvidenceIds || []).length),
  };
}

/** 지표 1 — 두 열. narrow = 정본 문면(「설비·부품 id」) · wide = must_include 의 id 전부. */
const ASSET_PREFIX = /^(EQ|CP)-/; // 설비·부품 (plan §2 「설비·부품 id」)
const ID_TOKEN = /(EQ|CP|SN|AL|SOP|SAF|FM|INC|WO|DOC)-[A-Z0-9][A-Z0-9@#r.-]*/;
function idsOf(mustInclude) {
  const ids = [];
  for (const m of mustInclude) { const hit = ID_TOKEN.exec(m); if (hit) ids.push(hit[0]); }
  return ids;
}
function assetAccuracy(text, mustInclude) {
  const ids = idsOf(mustInclude);
  const narrow = ids.filter((i) => ASSET_PREFIX.test(i));
  const per = Object.fromEntries(ids.map((i) => [i, mentions(text, i)]));
  return {
    ids,
    narrowIds: narrow,
    // 결정적 매칭 «불가» — 값이 아니라 이름으로 센다
    proseItems: mustInclude.filter((m) => !ID_TOKEN.test(m)),
    perId: per,
    narrowAllHit: narrow.length > 0 && narrow.every((i) => per[i]),
    wideAllHit: ids.length > 0 && ids.every((i) => per[i]),
  };
}

/**
 * 지표 6 — Safety Rule Omission. **두 열**(id 매칭 / id·별칭 매칭).
 * 🔴 별칭은 지어내지 않는다 — 데이터셋이 스스로 부르게 한다. `must_include` 문자열 중
 *    그 규정 id 로 «시작하는» 항목 안의 대문자 ASCII 토큰(3자 이상)을 별칭으로 삼는다.
 *    (예: "SAF-LOTO-01 = ... 잠금·표시(LOTO) ..." → LOTO)
 */
function buildAliases(gtRows) {
  const alias = new Map();
  for (const row of gtRows) {
    for (const m of row.must_include) {
      const hit = /^(SAF-[A-Z0-9-]+)/.exec(m);
      if (!hit) continue;
      const set = alias.get(hit[1]) || new Set();
      for (const tok of m.match(/\b[A-Z]{3,}\b/g) || []) if (!tok.startsWith('SAF')) set.add(tok);
      alias.set(hit[1], set);
    }
  }
  return alias;
}
function safetyOmission(text, requiredRules, alias) {
  let byId = 0, byAlias = 0;
  const detail = {};
  for (const rule of requiredRules) {
    const idHit = mentions(text, rule);
    const aliasHit = idHit || [...(alias.get(rule) || [])].some((a) => mentions(text, a));
    if (!idHit) byId += 1;
    if (!aliasHit) byAlias += 1;
    detail[rule] = { idHit, aliasHit };
  }
  return { byId, byAlias, detail };
}

/** 지표 7 — 인용. required 가 실제 인용에 들었는가 + 인용이 run 근거집합 안인가. */
function citationAxes(cands, requiredEvidence, runEvidenceIds) {
  const cited = new Set(cands.flatMap((c) => (c.rationale && c.rationale.citedEvidenceIds) || []));
  const requiredHit = requiredEvidence.filter((e) => cited.has(e));
  const outside = [...cited].filter((e) => !runEvidenceIds.has(e));
  return {
    citedCount: cited.size,
    cited: [...cited],
    requiredHit,
    requiredTotal: requiredEvidence.length,
    // 🔴 항상 0 일 것이다 — apply_guard 가 막는다. 0 을 「모델이 잘했다」로 읽지 마라.
    outsideRunEvidence: outside.length,
  };
}

/** 지표 8 — 전체·node별 ms. 표본 전부 + 중앙값. */
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
function latencyOf(events) {
  const ts = (e) => Date.parse(e.ts);
  const started = events.find((e) => e.type === 'run.started');
  const done = events.find((e) => e.type === 'run.completed');
  const perStep = {};
  for (const e of events) {
    const step = (e.payload && e.payload.step) || e.step;
    if (!step) continue;
    if (!perStep[step]) perStep[step] = {};
    if (e.type === 'step.started') perStep[step].t0 = ts(e);
    if (e.type === 'step.completed') {
      perStep[step].t1 = ts(e);
      // 🔴 서버 «자기 신고»는 내 ts 산출과 **다른 열**로 둔다. 둘이 갈리면 그 자체가 사실이다.
      if (e.payload && typeof e.payload.elapsedMs === 'number') perStep[step].self = e.payload.elapsedMs;
    }
  }
  const steps = {}, stepsSelfReported = {};
  for (const [name, v] of Object.entries(perStep)) {
    // 못 잰 것은 null 이다 — 0 으로 적으면 「빨랐다」로 읽힌다
    steps[name] = (v.t0 != null && v.t1 != null) ? v.t1 - v.t0 : null;
    stepsSelfReported[name] = v.self === undefined ? null : v.self;
  }
  return { totalMs: (started && done) ? ts(done) - ts(started) : null, steps, stepsSelfReported };
}

function scoreRun(sample, gt, alias) {
  const events = sample.events || [];
  const candidates = sample.candidates || [];
  const text = answerText(candidates);
  // 🔴 실물 형상: `step.evidence.payload.evidence` 는 **객체 하나**다(배열이 아니다).
  //    앞판은 배열로 가정해 채점이 통째로 죽었다 — raw 를 먼저 읽고 적었어야 할 자리.
  //    배열도 받아 두는 것은 관용이 아니라 계약이 늘어날 자리를 비워 두는 것이다.
  const runEvidenceIds = new Set(
    events.filter((e) => e.type === 'step.evidence')
      .flatMap((e) => {
        const ev = e.payload && e.payload.evidence;
        const list = Array.isArray(ev) ? ev : (ev ? [ev] : []);
        return list.map((x) => (x && x.evidenceId) || x);
      })
      .filter((x) => typeof x === 'string'));
  // 🔴 **판정 면을 두 열로 가른다.** plan §2 의 정본은 「답변 본문」이지만, 화면은 답변 옆에
  //    근거 발췌를 함께 보여 준다. 한 열만 내면 「답변이 말하지 않았다」와 「run 이 찾지도
  //    못했다」가 같은 숫자로 접힌다 — 그 둘은 처방이 다른 곳에 붙는 서로 다른 사실이다.
  //    A = 답변 본문(정본 축) · B = 답변 + 근거 발췌(화면에 함께 뜨는 면).
  const evidenceText = events.filter((e) => e.type === 'step.evidence')
    .map((e) => {
      const ev = e.payload && e.payload.evidence;
      const list = Array.isArray(ev) ? ev : (ev ? [ev] : []);
      return list.map((x) => [x && x.evidenceId, x && x.sourceId, x && x.excerpt].filter(Boolean).join(' ')).join(' ');
    }).join(' ');
  const withEvidence = text + ' ' + evidenceText;
  return {
    answerChars: text.length,
    sentenceCount: candidates.reduce((n, c) => n + (((c.rationale && c.rationale.sentences) || []).length), 0),
    m1: assetAccuracy(text, gt.must_include),
    m1_withEvidence: assetAccuracy(withEvidence, gt.must_include),
    // entry 면 — 🔴 `apply_guard` 가 만드는 구조적 0(모델 성능 아님)
    m5_unsupported: unsupportedClaims(candidates),
    // 문장 면 — guard 가 검사하지 않는 축이라 이 0 에는 판정력이 있다
    m5_perSentence: unsupportedClaimsPerSentence(events),
    m6: safetyOmission(text, gt.required_safety_rules, alias),
    m6_withEvidence: safetyOmission(withEvidence, gt.required_safety_rules, alias),
    m7: citationAxes(candidates, gt.required_evidence, runEvidenceIds),
    // 🔴 자극이 실재했는가 — 기대 근거가 run 근거집합에 «있기라도 했는가».
    //    없었다면 인용 0 은 합성의 결함이 아니다(모델은 없는 것을 인용할 수 없고,
    //    apply_guard 는 근거집합 밖 인용을 응답째 버린다). 그 0 의 주어는 검색 단계다.
    m7_stimulusPresent: gt.required_evidence.map((e) => ({ evidenceId: e, inRunEvidence: runEvidenceIds.has(e) })),
    runEvidenceCount: runEvidenceIds.size,
    m8: latencyOf(events),
  };
}

/* ------------------------------------------------------------------ *
 * 2. 교정 게이트 — 참값 칸 + «심은 빨강» 칸. 네트워크 0 · 구독 0.
 * ------------------------------------------------------------------ */
const CIT = ['DOC-SOP-0014@r2#001', 'DOC-SAF-0029@r3#000'];
// sentenceCitations: 문장 면 픽스처(각 문장의 인용 목록). 안 주면 스트림 이벤트 0 = 「못 잼」.
const fixture = (sentences, cited, extraEvidence, sentenceCitations) => ({
  events: [
    { type: 'run.started', ts: '2026-09-05T00:00:00.000Z' },
    { type: 'step.started', ts: '2026-09-05T00:00:00.000Z', payload: { step: 'vector' } },
    // 실물과 같게 «객체 하나»로 낸다 — 배열로 가정했다가 채점기가 통째로 죽은 자리다
    ...CIT.map((e) => ({ type: 'step.evidence', ts: '2026-09-05T00:00:01.000Z', payload: { step: 'vector', evidence: { evidenceId: e } } })),
    ...(extraEvidence || []).map((x) => ({ type: 'step.evidence', ts: '2026-09-05T00:00:01.000Z', payload: { step: 'graph', evidence: x } })),
    ...(sentenceCitations || []).map((c, i) => ({
      type: 'step.progress', ts: '2026-09-05T00:00:03.000Z',
      payload: { step: 'synthesize', kind: 'sentence', sentence: { text: sentences[i] || '', citedEvidenceIds: c } },
    })),
    { type: 'step.completed', ts: '2026-09-05T00:00:02.000Z', payload: { step: 'vector' } },
    { type: 'run.completed', ts: '2026-09-05T00:00:05.000Z' },
  ],
  candidates: [{ failureModeId: 'FM-BRG-WEAR', rationale: { sentences, citedEvidenceIds: cited === undefined ? CIT : cited } }],
});

function runGate(gt, alias) {
  const cells = [];
  const cell = (name, meaning, fx, check) => {
    let ok = false, got = null, err = null;
    try { got = scoreRun(fx, gt, alias); ok = check(got); }
    catch (e) { err = String((e && e.message) || e); }
    cells.push({ name, meaning, ok, err, got });
  };

  const full = [
    '알람 AL-20260826-0041 은 설비 EQ-CNC-204 의 베어링 마모를 가리킨다.',
    '대응 절차는 SOP-BRG-INSP-014 이며 필수 안전 규정은 SAF-LOTO-01 이다.',
  ];

  cell('truth', '참값 — 기대 전부 충족',
    fixture(full),
    (s) => s.m1.narrowAllHit && s.m1.wideAllHit && s.m6.byId === 0 && s.m6.byAlias === 0
      && s.m5_unsupported === 0 && s.m7.requiredHit.length === 2
      && s.m8.totalMs === 5000 && s.m8.steps.vector === 2000);

  cell('planted_missing_sop', '심은 빨강 — SOP id 를 지웠다 → wide 축이 «떨어져야» 한다',
    fixture([full[0], '대응 절차는 문서에 없다. 필수 안전 규정은 SAF-LOTO-01 이다.']),
    (s) => s.m1.wideAllHit === false && s.m1.narrowAllHit === true);

  cell('planted_missing_safety', '심은 빨강 — 안전 규정을 지웠다 → 지표 6 이 «올라야» 한다',
    fixture([full[0], '대응 절차는 SOP-BRG-INSP-014 이다.']),
    (s) => s.m6.byId === 1 && s.m6.byAlias === 1);

  cell('control_citations_stripped', '🔴 대조군(b) — 인용을 지웠다 → 지표 5 가 «올라야» 한다',
    fixture(full, []),
    (s) => s.m5_unsupported === 2 && s.m7.citedCount === 0);

  cell('boundary_korean_josa', '경계 — 한글 조사가 붙어도 잡는다(`EQ-CNC-204의`)',
    fixture(['알람 AL-20260826-0041 은 EQ-CNC-204의 베어링 마모다. 절차는 SOP-BRG-INSP-014, 규정은 SAF-LOTO-01.']),
    (s) => s.m1.narrowAllHit === true && s.m1.wideAllHit === true);

  cell('boundary_longer_id', '경계 — 더 긴 id 를 잘라 읽지 않는다(`EQ-CNC-2041`)',
    fixture(['알람 AL-20260826-0041 은 EQ-CNC-2041 의 문제다. SOP-BRG-INSP-014 · SAF-LOTO-01.']),
    (s) => s.m1.perId['EQ-CNC-204'] === false && s.m1.narrowAllHit === false);

  cell('alias_splits_columns', '두 열이 갈린다 — id 없이 「LOTO」만 말하면 id 열은 누락·별칭 열은 아니다',
    fixture([full[0], '대응 절차는 SOP-BRG-INSP-014 이고 작업 전 LOTO 를 시행한다.']),
    (s) => s.m6.byId === 1 && s.m6.byAlias === 0);

  // 🔴 두 판정 면이 «실제로 갈리는지» — 규정이 답변엔 없고 근거 발췌에만 있을 때.
  //    이 칸이 없으면 B 열은 시험되지 않은 채 값을 낸다(실측이 정확히 이 모양이었다).
  cell('evidence_only_splits_faces', '판정 면 A/B — 규정이 근거에만 있으면 A 는 누락 · B 는 아니다',
    fixture([full[0], '대응 절차는 SOP-BRG-INSP-014 이다.'], undefined,
      [{ evidenceId: 'GP-x-03', sourceId: 'SAF-LOTO-01', excerpt: '[SOP · 3-hop] ... → SAF-LOTO-01' }]),
    (s) => s.m6.byId === 1 && s.m6_withEvidence.byId === 0);

  // 🔴 **D-84 처방이 노리는 «바로 그 모양»의 대조군.** 근거에 `SAF-*` 가 있고 답변이 그것을
  //    id 로 호명하면 지표 6 은 0 이어야 한다. 이 방향을 근거 있는 조건에서 시험해 두지 않으면,
  //    처방 뒤의 0 이 「고쳐졌다」인지 「내 채점기가 무뎌졌다」인지 게이트가 답하지 못한다.
  //    위 `evidence_only_splits_faces`(호명 X → 1)와 **짝**이다 — 둘이 함께 서야 축이 산다.
  cell('named_with_evidence_scores_zero', 'D-84 방향 — 근거에 SAF 가 있고 답변이 id 로 호명하면 지표 6 = 0',
    fixture([full[0], '대응 절차는 SOP-BRG-INSP-014 이고 작업 전 SAF-LOTO-01 을 적용한다.'], undefined,
      [{ evidenceId: 'GP-x-03', sourceId: 'SAF-LOTO-01', excerpt: '[SOP · 3-hop] ... → SAF-LOTO-01' }]),
    (s) => s.m6.byId === 0 && s.m6_withEvidence.byId === 0);

  // 🔴 문장 면(지표 5)의 대조군. entry 면은 guard 가 0 을 만들지만 이 면은 아니다 —
  //    그러니 이 열에는 «오르는» 것을 보여 주는 칸이 반드시 있어야 한다.
  cell('sentence_face_counts_uncited', '문장 면 — 인용 0건 문장이 있으면 지표 5 가 오른다',
    fixture(full, undefined, undefined, [CIT, []]),
    (s) => s.m5_perSentence.measurable === true && s.m5_perSentence.count === 1
        && s.m5_unsupported === 0);   // entry 면은 그대로 0 — 두 면이 갈린다

  cell('sentence_face_absent_is_null', '문장 면 — 스트림이 없으면 0 이 아니라 «못 잼»(null)',
    fixture(full),
    (s) => s.m5_perSentence.measurable === false && s.m5_perSentence.count === null);

  cell('stimulus_absent_is_named', '자극 부재 — 기대 근거가 run 근거집합에 없으면 이름으로 드러난다',
    fixture(full, [], []),
    (s) => s.m7_stimulusPresent.every((x) => x.inRunEvidence === true) && s.runEvidenceCount === 2);

  // 공개면 차단이 «코드로» 서는지 — 같은 실행에서 물게 한다
  const baseCases = [
    ['https://factory-knowledge-twin.vercel.app', false],
    ['http://127.0.0.1:8010', false],
    ['http://10.0.0.5:8090', false],
    ['http://127.0.0.1:8090', true],
  ];
  let baseOk = true;
  const baseDetail = [];
  for (const [b, shouldPass] of baseCases) {
    let passed = true;
    try { assertLocalBase(b); } catch { passed = false; }
    baseDetail.push({ base: b, expected: shouldPass, actual: passed });
    if (passed !== shouldPass) baseOk = false;
  }
  cells.push({ name: 'public_surface_blocked', meaning: '공개면 차단 = 다짐이 아니라 코드', ok: baseOk, got: baseDetail });

  return cells;
}

/* ------------------------------------------------------------------ *
 * 3. 집행
 * ------------------------------------------------------------------ */
const gtRows = fs.readFileSync(GT_PATH, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
if (gtRows.length === 0) {
  console.error('EXIT2: ground-truth is empty - comparison against an empty set is not a verdict');
  process.exit(2);
}
const gt = gtRows.find((r) => r.id === ANCHOR_QID);
if (!gt) { console.error('EXIT2: anchor question ' + ANCHOR_QID + ' not in ground-truth'); process.exit(2); }
const alias = buildAliases(gtRows);

const gate = runGate(gt, alias);
const gateFailed = gate.filter((c) => !c.ok);
for (const c of gate) console.error('[gate] ' + (c.ok ? 'PASS' : 'FAIL') + '  ' + c.name + (c.err ? '  err=' + c.err : ''));
fs.writeFileSync(OUT.replace(/\.jsonl$/, '-gate.json'),
  JSON.stringify({ measuredAt: new Date().toISOString(), anchorQuestionId: ANCHOR_QID, gate }, null, 1), 'utf8');
if (gateFailed.length) {
  console.error('EXIT2: gate ' + gateFailed.length + '/' + gate.length + ' FAILED - refuse to fire (subscription untouched)');
  process.exit(2);
}
console.error('[gate] all ' + gate.length + ' cells stand - scorer has detection power');

if (GATE_ONLY) { console.error('[gate-only] no live run fired. subscription spend = 0'); process.exit(0); }

// 🔴 이미 태운 run 을 «다시 태우지 않는다». 채점기가 죽어도 raw 는 남아 있으므로(즉시 append)
//    채점은 raw 에서 다시 돌린다 — 구독은 되돌릴 수 없고 raw 는 되돌릴 수 있다.
//    「중단」 착신 뒤 부분 결과를 채점하는 길도 이것이다.
const SCORE_RAW = arg('score-raw', null);
// 🔴 **교정 열.** 처방 뒤 라이브가 0 이 나왔을 때 「대상이 고쳐졌다」와 「내 채점기가 무뎌졌다」를
//    가르는 것은 이것뿐이다 — «옛 raw» 를 «지금 채점기»로 다시 채점해 옛 값이 그대로 나오는지 본다.
//    같은 실행에서 찍어야 한다. 따로 돌리면 두 채점기 버전을 비교하는 셈이 된다.
const BASELINE_RAW = arg('baseline-raw', null);
const BASE = SCORE_RAW ? '(score-raw · 발사 0)' : assertLocalBase(arg('base', 'http://127.0.0.1:8090'));
console.error('[live] base=' + BASE + ' runs=' + RUNS + ' scenario=' + SCENARIO);
// 🔴 즉시 append — 중단이 와도 부분 결과가 산출이다
if (!SCORE_RAW) fs.writeFileSync(OUT, '', 'utf8');
const appendRaw = (obj) => fs.appendFileSync(OUT, JSON.stringify(obj) + '\n', 'utf8');

async function newSession() {
  const res = await fetch(BASE + '/api/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  if (res.status !== 200 && res.status !== 201) throw new Error('session status=' + res.status);
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const body = await res.json();
  return { sessionId: body.sessionId, cookie: sc.filter(Boolean).map((c) => c.split(';')[0]).join('; ') };
}

async function fireRun(idx) {
  // 🔴 run 마다 새 세션 — 세션 상한과 «비종결 run 재사용» 규칙을 둘 다 피한다
  const { sessionId, cookie } = await newSession();
  const t0 = Date.now();
  const res = await fetch(BASE + '/api/scenarios/' + SCENARIO + '/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ sessionId, mode: 'live' }),
  });
  const body = await res.json().catch(() => null);
  // 🔴 실패한 호출을 세지 마라 — 200/201 이 아니면 표본이 아니다(0 으로도 적지 않는다)
  if (res.status !== 200 && res.status !== 201) return { idx, ok: false, reason: 'create status=' + res.status, body };
  const reused = res.headers.get('x-run-reused');
  const runId = body && body.runId;
  if (!runId) return { idx, ok: false, reason: 'runId 없음', body };

  let events = [], status = null;
  for (let i = 0; i < 200; i += 1) { // 폴링 상한 = run_timeout_sec 300 보다 넉넉히
    await new Promise((r) => setTimeout(r, 2000));
    const er = await fetch(BASE + '/api/runs/' + runId + '/events', { headers: { cookie } });
    if (er.status !== 200) return { idx, ok: false, runId, reason: 'events status=' + er.status };
    events = await er.json();
    const term = events.find((e) => ['run.completed', 'run.failed', 'run.stopped'].includes(e.type));
    if (term) { status = term.type; break; }
  }
  const wallMs = Date.now() - t0;
  if (status !== 'run.completed') return { idx, ok: false, runId, reason: '종결 아님(' + (status || 'timeout') + ')', wallMs, events };
  const snap = await fetch(BASE + '/api/runs/' + runId, { headers: { cookie } }).then((r) => r.json()).catch(() => null);
  return { idx, ok: true, runId, sessionId, reused, wallMs, status, events, candidates: (snap && snap.candidates) || [] };
}

const raws = [];
if (SCORE_RAW) {
  for (const l of fs.readFileSync(SCORE_RAW, 'utf8').split(/\r?\n/)) if (l.trim()) raws.push(JSON.parse(l));
  console.error('[score-raw] ' + raws.length + ' runs read from ' + SCORE_RAW + ' (fired 0)');
  if (raws.length === 0) { console.error('EXIT2: raw is empty - nothing to score'); process.exit(2); }
} else {
  for (let i = 1; i <= RUNS; i += 1) {
    const r = await fireRun(i);
    appendRaw(r); // 즉시 flush
    raws.push(r);
    console.error('[live] run ' + i + '/' + RUNS + ' ' +
      (r.ok ? 'completed ' + r.runId + ' ' + r.wallMs + 'ms' : 'EXCLUDED: ' + r.reason));
  }
}

const usable = raws.filter((r) => r.ok);
const excluded = raws.filter((r) => !r.ok).map((r) => ({ idx: r.idx, reason: r.reason }));
const scored = usable.map((r) => Object.assign({ runId: r.runId, reused: r.reused || null }, scoreRun(r, gt, alias)));

// live 축이 실제로 섰는가 — `step.completed(synthesize).payload.synthesis.axis`
const axes = usable.map((r) => {
  const e = r.events.find((x) => x.type === 'step.completed' && x.payload && x.payload.step === 'synthesize');
  return (e && e.payload && e.payload.synthesis) || null;
});

const report = {
  measuredAt: new Date().toISOString(),
  base: BASE, scenario: SCENARIO, anchorQuestionId: ANCHOR_QID,
  runsRequested: RUNS, runsUsable: usable.length, excluded,
  syntheses: axes,
  perRun: scored,
  m8_totalSamples: scored.map((s) => s.m8.totalMs),
  m8_totalMedian: median(scored.map((s) => s.m8.totalMs).filter((x) => x != null)),
  m8_stepSamples: Object.fromEntries(
    [...new Set(scored.flatMap((s) => Object.keys(s.m8.steps)))]
      .map((k) => [k, scored.map((s) => (s.m8.steps[k] === undefined ? null : s.m8.steps[k]))])),
  crossRun: {
    identicalAnswerChars: new Set(scored.map((s) => s.answerChars)).size === 1,
    identicalCitedSets: new Set(scored.map((s) => JSON.stringify([...s.m7.cited].sort()))).size === 1,
    m5Samples: scored.map((s) => s.m5_unsupported),
    m5PerSentenceSamples: scored.map((s) => s.m5_perSentence.count),
    m6IdSamples: scored.map((s) => s.m6.byId),
  },
  gateCells: gate.map((c) => ({ name: c.name, ok: c.ok })),
};

// ---- 교정 열: 옛 raw 를 «지금 채점기»로 다시 채점한다 ------------------------------
if (BASELINE_RAW) {
  const baseRaws = fs.readFileSync(BASELINE_RAW, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const baseUsable = baseRaws.filter((r) => r.ok);
  if (baseUsable.length === 0) {
    // 🔴 빈 기준선과의 비교는 판정이 아니다 — 「전부 좋아졌다」로 보인다
    console.error('EXIT2: baseline raw has no usable run - an empty baseline proves nothing');
    process.exit(2);
  }
  const baseScored = baseUsable.map((r) => Object.assign({ runId: r.runId }, scoreRun(r, gt, alias)));
  const col = (rows, f) => rows.map(f);
  report.calibration = {
    baselineFile: BASELINE_RAW,
    baselineRuns: baseScored.map((s) => s.runId),
    // 처방 «전» 값이 지금 채점기로도 그대로 나오는가. 안 나오면 after 의 0 은 읽을 수 없다.
    before_m6ById: col(baseScored, (s) => s.m6.byId),
    before_m6ByAlias: col(baseScored, (s) => s.m6.byAlias),
    before_safetyNamedInAnswer: col(baseScored, (s) => Object.values(s.m6.detail).every((d) => d.idHit)),
    after_m6ById: col(scored, (s) => s.m6.byId),
    after_m6ByAlias: col(scored, (s) => s.m6.byAlias),
    after_safetyNamedInAnswer: col(scored, (s) => Object.values(s.m6.detail).every((d) => d.idHit)),
    // 처방의 «부작용» 축 — 안전 규정을 말하게 한 대가로 인용이 무너지지 않았는가
    before_m5PerSentence: col(baseScored, (s) => s.m5_perSentence.count),
    after_m5PerSentence: col(scored, (s) => s.m5_perSentence.count),
    before_totalMs: col(baseScored, (s) => s.m8.totalMs),
    after_totalMs: col(scored, (s) => s.m8.totalMs),
    // 🔴 이 한 줄이 교정의 전부다: 옛 값이 흔들렸다면 계측기가 변한 것이고, after 를 대상의 답으로 읽을 수 없다.
    baselineStable_expect_all_1: col(baseScored, (s) => s.m6.byId).every((x) => x === 1),
  };
  console.error('[calibration] before m6.byId=' + JSON.stringify(report.calibration.before_m6ById)
    + ' after=' + JSON.stringify(report.calibration.after_m6ById)
    + ' baselineStable=' + report.calibration.baselineStable_expect_all_1);
}
fs.writeFileSync(OUT.replace(/\.jsonl$/, '-report.json'), JSON.stringify(report, null, 1), 'utf8');
console.error('[done] usable=' + usable.length + '/' + RUNS + ' excluded=' + excluded.length + ' -> ' + OUT);

// 🔴 **보고서를 «쓴 뒤에» 판정을 거부한다.** raw 와 report 는 남겨야 다음 사람이 읽을 수 있고,
//    exit 2 는 「이 after 값을 대상의 답으로 읽지 마라」는 뜻이다. 기준선이 지금 채점기 아래에서
//    옛 값을 내지 못하면, 처방 뒤의 0 은 대상이 고쳐진 것인지 내 계측기가 무뎌진 것인지 모른다.
if (report.calibration && !report.calibration.baselineStable_expect_all_1) {
  console.error('EXIT2: baseline drifted under the current scorer - after-values are NOT attributable to the target');
  process.exit(2);
}
