/**
 * t62_live_cache_boundary — T6-2 축 ① 후반 «캐시 만료 경계» (검증 좌석 · 29대).
 *
 * 계약 v0.1.12 179행은 `/live/status.online` 을 **「게이트웨이 `GET /health` 실제 프로브 결과 ·
 * 짧은 타임아웃 · 수 초 캐시」** 라고 정한다. 「OFF 하면 false 가 된다」만 보면 그 문장의 **절반**
 * 밖에 못 잰다 — 캐시가 정말 있는지, 있다면 몇 초인지는 **전환의 «순간»** 에만 보인다.
 *
 * 🔴 그래서 OFF «직전»부터 촘촘히 찍는다. 마지막 `true` 와 첫 `false` 사이가 캐시 창의 상한이다.
 *    간격이 0에 가까우면 「캐시가 없다(매 요청 프로브)」, 수 초면 계약대로다. 어느 쪽이든 실측이다.
 *
 * 🔴 이 계측기는 **구독을 쓰지 않는다** — `/live/status` 는 합성 경로가 아니다.
 *
 *     FKT_API_BASE  **필수 · 기본값 없음**(O-23) — 지정 안 하면 즉시 죽는다
 *     --seconds     총 관측 시간(기본 60)
 *     --interval    샘플 간격 ms(기본 500)
 */
/* 🔴 **기본값을 두지 않는다**(O-23 · D-74·O-22 와 같은 계보 · 선례 = `d21c_polling_probe.mjs`).
   앞판은 `?? "http://127.0.0.1:8010"` 이었다 — 그 자리는 **배포 대역(상시 라이브)** 이고,
   지정 없이 돌린 사람은 **배포 서버를 재고** 그 값을 자기 무대의 판정으로 적게 된다.
   실측으로 확인했다: 처방 전 미지정 실행은 `:8010` 으로 나가 **rc 0 으로 성공**했다.
   — 실패하지 않는 오지정이라 아무도 알아채지 못한다. */
const API_RAW = process.env.FKT_API_BASE;
if (!API_RAW) {
  /* 🔴 node 는 문면에 이모지가 있어도 죽지 않는다(콘솔에서 깨져 보일 뿐). 파이썬은
     다르다 — `stdout` 이 cp949 에서 `UnicodeEncodeError` 로 죽어 «문면 1줄» 이 통째로
     사라진다(O-22 실측). 같은 문면을 파이썬으로 옮길 때는 그 점을 기억하라. */
  console.log("🔴 측정 불가 — `FKT_API_BASE` 를 명시하라(기본값 없음 · O-23 · 무접촉 대역 `:8010` 을 기본으로 잡지 않는다).");
  process.exit(2);
}
const API = API_RAW.replace(/\/$/, "");
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const SECONDS = arg("seconds", 60);
const INTERVAL = arg("interval", 500);

const t0 = Date.now();
const samples = [];
process.stdout.write(`== /live/status 연속 관측 · ${API} · ${SECONDS}s · ${INTERVAL}ms 간격\n`);
process.stdout.write(`   시작 ${new Date().toISOString()}\n`);

while (Date.now() - t0 < SECONDS * 1000) {
  const at = Date.now();
  let online = null;
  let checkedAt = null;
  try {
    const res = await fetch(`${API}/api/live/status`, { signal: AbortSignal.timeout(4000) });
    const j = await res.json();
    online = j.online;
    checkedAt = j.checkedAt;
  } catch (e) {
    online = `ERR:${e.name}`;
  }
  const prev = samples[samples.length - 1];
  samples.push({ ms: at - t0, online, checkedAt });
  // 값이 바뀐 순간만 찍는다 — 같은 값 수백 줄은 판정에 쓸 것이 없다.
  if (!prev || prev.online !== online) {
    process.stdout.write(`   ${((at - t0) / 1000).toFixed(1)}s · online=${online} · checkedAt=${checkedAt}\n`);
  }
  await new Promise((r) => setTimeout(r, INTERVAL));
}

const trues = samples.filter((s) => s.online === true);
const falses = samples.filter((s) => s.online === false);
const lastTrue = trues.length ? trues[trues.length - 1] : null;
const firstFalseAfter = lastTrue ? falses.find((s) => s.ms > lastTrue.ms) : falses[0] ?? null;

process.stdout.write(`\n   샘플 ${samples.length}개 · true ${trues.length} · false ${falses.length}\n`);
if (lastTrue && firstFalseAfter) {
  process.stdout.write(
    `   🔴 전환: 마지막 true ${(lastTrue.ms / 1000).toFixed(1)}s → 첫 false ${(firstFalseAfter.ms / 1000).toFixed(1)}s ` +
      `· 간격 **${((firstFalseAfter.ms - lastTrue.ms) / 1000).toFixed(1)}s**\n`,
  );
  process.stdout.write(`   마지막 true 의 checkedAt = ${lastTrue.checkedAt}\n`);
  process.stdout.write(`   첫 false 의 checkedAt   = ${firstFalseAfter.checkedAt}\n`);
} else {
  process.stdout.write(`   ⚪ 전환을 못 봤다 — 이 창에 자극(OFF)이 없었거나 창이 짧다. 어느 색도 아니다.\n`);
}
