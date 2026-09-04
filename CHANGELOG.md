# CHANGELOG — factory-knowledge-twin

> append 전용 · 끝난 것만.

## 2026-08-28

- Public repository opened at github.com/sinelym-creator/factory-knowledge-twin after public-boundary audit and history rebuild (`05b60ae`).
- CI hygiene gate on GitHub-hosted runners; first runs green on main/develop.
- 7-day work plan to deployment adopted (operator directive); operating cycle (plan→ticket→ledger→board) bound into project-plan §5 (`f0c1005`).
- Phase 0 dispatched: decision D-001, nine tickets, drafts landed for brief/scenario/architecture/contracts (T0-1/4/5/7) plus team drafts for ontology (T0-6) and eval questions (T0-8).
- Process: adopted per-seat git worktrees with lane branches after a shared-index commit collision (`4f638c7` carries mixed content under a stale message; history kept as-is, no loss). Do not cite `4f638c7`'s commit message as evidence — its contents are T0-8 eval questions (levi2) plus an ontology-spec size_limit line (senku2), swept in by an amend on a then-shared index.
- Process: integration standard adopted per re-education — PR-based merge commits (one ticket per PR), no direct develop pushes for any seat, pre-boot team checklist (6 axes) codified in plan §5.
- Phase 0 gate closed: nine artifacts PASS through independent verification (three rounds, v1.1-v1.3), four blockers found and fixed, contracts v0.1 and ontology v0.1 frozen. General-audience README promoted to main (PR #12, operator-approved). Phase 1 decomposed into nine tickets (denominator 15→24).

## 2026-08-29 (rotated from PROGRESS done)

- Phase 1 completed (ledger 25/25), every ticket through independent verification: PG schema/migrations (T1-1), synthetic seed with preserved imperfections (T1-2), document set (T1-3), ingestion/chunk/embedding/pgvector indexing with chunk policy v1 frozen (T1-4), Neo4j projection 309 nodes/448 relations (T1-5), contract harness promotion (T1-6), seed-to-index reproducibility (T1-7), FastAPI async skeleton (T1-8), Next.js shell (T1-9). PR #29~#96.
- Queue items Q-1~Q-4 closed with implement+verify round trips; freshness/ontology STALE axes landed (migrations 004~008); errata E-4~E-7 recorded.
- 08-28 groundwork rotated together: repo+baseline+SSOT skeleton, three-seat team boot, T1-0/T1-1 verification, resume-document delivery to operator (non-repo artifact).

## 2026-08-30 (rotated from PROGRESS done)

- T2-1 completed (26/31): three retrieval strategies plus a defect lineage of seven items (V-1~V-5) corrected and re-verified PASS; E-8 recorded; three tests/api drills landed; T2-2 implementation report landed pending verification. PR #98~#108.

## 2026-08-31 (rotated from PROGRESS done)

- T2-2 completed (27/31): document and evidence read routes (3), V-6/V-7 corrections (locate_cited single wall, dependency_guard convergence), STALE surface reached (Q-20 closed), 30 security-axis checks, tests/api 8 drills / 172 rows. PR#107, #112-#114 (08-30).
- T2-3 completed (28/31): LangGraph 5-stage GS-01 full run (0 defects, 176 verdict rows), runs surface 5 + graph/paths + live/status, egress guard, Q-9 closed (rule A), contracts v0.1.2-3. PR#118-121 (08-30).
- T2-4 completed (29/31): replay fixtures 32 events (unprocessed recording, 2-field substitution, dependency-free replay proven), V-8/V-9 corrections (self-confirming control, Korean word-boundary miss — third V-1 recurrence), recheck-matrix reproducer. PR#124-129 (08-30).
- T2-5 completed (30/31): WO draft CRUD/approval/R12 server enforcement (impl PR#134) + independent verification PASS (axes ⓪-⑦, new wo_shape_drill, 5 net-defect self-reports — 0 defects in the landed change). PR#134, #137 (08-30).

## 2026-09-01
- (rotated from PROGRESS) ✅ **D-15 종결(16대)** — Public 리포 슬래시형 개인 경로 1줄 마스킹 + CI/드릴 정규식 사정거리 보강(#332 `cf38c9c`) (rotated from PROGRESS done)

- D-10 closed (public shell cold-entry 2s cap -> pending session; fix promoted, external PASS) and Q-65 closed (CI strict-coverage + validator type-array gap).
- Q-30 closed: CI 20+ consecutive red had two layers (secret false-positive hiding a real personal path); both removed.
- T2-6 completed = Phase 2 complete (31/31): GS-01 integrated 13 rows with zero broken links; §21 evidence set.
- T3-1 completed: session materialization (guards, ownership 404 hiding, reset) + browser V-1.
- T3-2 completed: Overview/Incident screens + five read routes (contract v0.1.7 line).
- T3-3 completed: Evidence/Documents screens + deep links (read-only); D-3 marker lineage.
- T3-4 completed: investigation run / strategy compare screens (minimal shape, early feature freeze).
- T3-5 completed: work-order draft edit/approve screen (minimal shape); implementation PR#208 -> independent verification.
- T4-1 completed: public shape skeleton (compose ai-api, deploy build, Q-37 FKT_API_BASE).
- T4-2a completed: static replay path — shell completes GS-01 alone with the laptop (ai-api) OFF.
- T4-2b completed: live protections, fallback and queue (server semaphore + run.queued contract v0.1.9).
- D-13 closed (2026-09-01): deploy DB bind volumes deleted by a worktree cleanup order; neo4j rescued via logical dump (309/448) and reloaded, postgres regenerated (seed fixed); volumes moved outside worktrees; rule codified (mounts check before worktree removal).
- D-12e promoted (main 20f7f6c): server fetch registration moved to a globalThis slot; install axis partially PASS (20/20 boots), rescue axis undecided (no contaminated window); 5-row verdict table adopted.
- D-14 registered and mitigated: Vercel daily deployment cap (100) exhausted by lane preview builds; lane/* preview disabled (#331); push batching and <=4 promotions/day adopted.

## 2026-09-01 (rotated from PROGRESS on 2026-09-02)

- D-14 mitigation landed: `lane/*` preview deployments disabled in `apps/web-console/vercel.json` (#331).
- T4-4 Tunnel OFF row measured externally (conditional PASS: screen shows disconnected, health/live 500, immediate recovery); Q-70 slow `/enter` failure filed (#333).
- T5-4 complete: deployment runbook `docs/deployment/runbook.md` (restart policy, Funnel OFF/ON measurements, Gate 6 rows, clean-env steps) (#335).
- D-12e promoted to main `20f7f6c`: install axis partial PASS (boot 20/20, install 40, failures 0); rescue axis no verdict; verdict table 5 rows (#327, #329).
- D-13 closed: deployment stack reconstructed 6/6 (seed 28/28, neo4j reload 309/448 content diff 0), volumes moved outside worktrees, `infra/neo4j-restore.ps1` (#323, #325).
- Reboot recovery and Q-63 verdict: t15 DB pair restarted once (restart=no kept), ai-api health ok, cold-start 2,863→220 ms attributed to the elapsed-time axis (mechanism unknown).
- T5-3 minimal: `security.yml` CodeQL job (JS/TS + Python, build-mode none) landed (#337); six deferred items remain.
- T4-4 complete (conditional on Q-69/Q-70): FastAPI OFF row PASS (#339), Gate 6 external item closed; Phase 4 = 5/5.
- D-16 Golden regression recovered (P0): deployed `document_chunk` was 0 rows after the D-13 rebuild skipped the derived index; rebuilt 59/59 in ~4 min, external GS-01 2/2 (#342), runbook step 4 + health-check retrieval row (#343).
- Q-69 wording fix landed (#345 `efc0eee`): banner "disconnected → Replay" replaced with "no Live AI gate · deterministic aggregation", the 1006 "session expired" claim removed; screen-axis E1 deferred to post-promotion.
- Extensions 2·3 (operator "94% · proceed"): scope-cut draft #347 (A~G approved 21:21), T5-5 gate evidence map draft #348, Q-70 fix #349 (blackhole 25.2→8.0s; external recheck #351 undecidable before promotion), dependency audit #350 (D-17 raised); nine stale worktrees removed (9,314MB).

## 2026-09-02 (rotated from PROGRESS done)

- D-14 recurrence prevention 2 (operator "preview 0"): develop merges were also producing previews (18 the day before); `vercel.json` now blocks develop plus 11 conventional branch patterns (#354 `a76bee8`), zero deployments after merge confirmed.
- P6 license axis: `NOTICE`, `THIRD_PARTY_NOTICES.md` generated from the measured dependency inventory (JS 341 / Python 80, unknown 0, copyleft-in-prod 1), `LICENSE` holder set per operator approval (#360 `fd52979`).
- T5-5 clean environment run (#361 `c515544`): README-only reproduction stops at step zero (§35.6 unmet, confirmed); the documented 5-step bypass completes GS-01 (13 rows); skipping the projection step yields an "empty green" caught by the P-GRA net; 5+1+1 documentation defects → D-18.
- baseline v0.3 scope-cut amendments applied (#356 `e0c6958`): operator-approved items 1-A~1-G written into the baseline body (file name kept at v0.2), Gate 6 evidence now cites both files.
- T5-5 gate verdict landed (#357 `d63498d`, local axes): 14 nets re-run, verdict "Release candidate — reduced scope (v0.3)", 9 unmet §35.7 items listed; Q-71 raised.
- D-17 repository fix (#355 `ee2bbf9`): fastapi 0.133.0 + starlette 1.3.1 pins, pip-audit 9→0, Python audit promoted to a gate.
- Q-71 surface_scan false positives (#363 `c73028e`): four rules, 10→0 with the 53-file population unchanged and detection proven by injected violations.
- P6 README run section (#365 `6e1487d`): points to runbook §4 as the single source (no command duplication), measured prerequisite table, "publish after deploy" self-claim removed, KPI cells left empty until measured; README-only reproduction (§35.6) stays unmet by design.
- D-18 migrate.ps1 compose-project fix + runbook 5-step (#362 `03056f6`): four `-p <project>` call sites, explicit failure text when unspecified, runbook §4 rewritten to the measured order (compose → project → migrate → seed → indexer venv → projector venv).
- D-17 deploy applied (senku2 gen28): ai-api container rebuilt from `6e1487d` (starlette 1.3.1), local+public health 200; 3m38s dependency outage from a missing network in the hand-off list → "same shape = full inspect diff" gate adopted.
- T5-2 Gate 7 nets landed (#366 `84a585a`): three new negative drills — SQL question surface (arbitrary strings never reach the query layer; the allowlist is the front door), Cypher layers A/B (parameter binding; the extractor emits ID tokens only), in-document prompt injection (marker presence checked first; integrity exclusion is the defense; the re-index path stays unmeasured) — Gate 7 unmet 4→2; Q-72 raised (fail-closed kept).
- T5-2 Gate 7 map (#367 `844f420`): 13 items + 1 kept = 14 rows, no new runs, every cell sourced [V]/[N], zero disagreement between the two originals; PASS 6 / conditional 1 / partial 2 / unmeasurable 3 / unmet 2 — "Gate 7 is not standing" stated explicitly.

## 2026-09-02 (release gate)

- **D-004 release gate decided** (operator "전건 권장안 승인" 16:59 KST, `docs/decisions/004`): final state = **"Release candidate — reduced scope (v0.3)"**, not "Portfolio Release". §35.7: met 3 (⑤ offline fallback, ⑨ license, ⑩ README claim-evidence) / partial 3 (② GS E2E, ⑧ Actions, ① P0 43/47) / unmet 4 (③ independent verification gaps, ④ security gate, ⑥ benchmark, ⑦ KPI/latency) carried to "post-release improvements". T5-5 closed; T5-1~T5-4 carried over under the reduced scope.
- T3-6 Phase 3 integration verification closed as **conditional PASS** (#386): public-shell browser E2E 97 pass / 32 red / 2 skipped; §21 evidence ②③④ all green (5/5, 7/7, 16/16; D-7 Esc fix confirmed); the 32 reds attributed to net self-load, D-21, and Q-73 — not to the product.
- **D-21 public-shell WebSocket** measured to the Vercel-routed segment (#388: same cookie and run, opened=false via Vercel, opened=true via direct Funnel; direct leg is tailnet-self) → decision ⓐ: documented as a known limitation in README and runbook (#391); polling switch listed first among post-release improvements; client-direct WS rejected (session-cookie/contract §115 redesign).
- Q-73 networkidle reds (#390, #392): mechanism = page loads in 1–3 s but connections stay open ~30 s, so `networkidle` sits on the 30 s budget edge; 3/4 red at 2 real workers, 0/2 at 1; layer undetermined (no hypothesis recorded); polling counter `tests/web/_q73_netcount.mjs` added.
- README run-excerpt collation gate (#387): the six-line excerpt is checked every build against the section its own link points to, with no expected values or counts in the checker and a mandatory self-tamper stimulus.
- Ledger header corrected 39→43/47 (T4-3/T4-4 had been closed on 09-01 without a header stamp).
- develop promoted to main: #395 (`6849a08`, 50 commits / 33 files, runtime code 0; Production READY 18:16:55 KST; external re-check PASS — health 200, POST /enter 303 + sid, `/` 200) and #399 (D-21 ⓒ polling fallback, contract v0.1.10, Q-73 nets, T5-5 gate row; operator decision 18:13).
- **D-21 ⓒ polling fallback landed** (#397, senku2; contract v0.1.10 #396): when the public shell's run WebSocket never opens (close 1006 before 101) the run console polls `GET /api/runs/{id}/events` every `POLL_INTERVAL_MS` (2 s), dedups by seq in the single merge site, stops at terminal events (`run.queued` is not terminal), and shows what it is doing; a 429 halts polling and shows the reason (no auto-resume). Server code 0, new routes 0. README "실시간" claims aligned (direct path = WS, public shell = polling); the known-limitation section now says substitution, not fix. Behavioral verification on Production and net revision = levi2, after the CPU-protection window.
- Q-73 nets revised (#398, levi2): 45 code sites of `networkidle` (48 hits incl. 3 comments) → 27 removed (duplicate of auto-wait), 17 anchored (positive signal before absence checks), 1 kept with a 3 s cap; 30 s budget unchanged; `--list` 131 tests / 14 files unchanged; regression counts Not measured (window hold) — Q-73 closes only after that run.
- T5-5 verdict gate row (#394, levi2): §4 records the operator gate (16:59, D-004) and §35.7 condition 2 cites D-21 ⓐ (#391); no measured values touched.
- **D-21 ⓒ independently verified** (#404, levi2): local nets 5/5 (two runs; interval = screen-declared 2000 ms; polling samples 2, stated), public shell 3/4 (banner, stop after terminal, 32/32 events; interval Not measured because warm replay completes on the single backfill before polling starts — product truth, footnoted in README #402); target defect 0; six instrument self-corrections recorded. D-21 remains a substitution: the WebSocket still does not open via the Vercel path.
- **Q-73 closed** (#404): full local regression 133 pass / 0 red / 3 skip (Production build, 4 workers, 14 files). The regression caught 4+1 reds introduced by the nets revision itself (`overviewFromApi()` 401 — `networkidle` had been accidentally buying session time); fixed by waiting for the session cookie itself (`sessionReady()`), not another proxy signal.
- **T6-1 live diagnosis synthesis landed** (#407 gateway, #409 ai-api/web/fixture, senku2; schema #406 levi2; contract v0.1.11 #403): a host-only local gateway runs the operator's Claude Code CLI (subscription, no API key, `127.0.0.1:8787`, not in compose); ai-api accepts a live synthesis only when every cited evidence id is in the run's own evidence set, otherwise surfaces `axis=live-rejected` with the reason and keeps the deterministic ranking; the console shows the ranking axis and the cited sentences; GS-01 fixture re-recorded with the live axis (audit PASS). Recorder fix: obtains a session instead of a hard-coded id (it had been 401 since the 08-30 session gate).
- **T6-1 independently verified** (#410, levi2): ①결속 0위반(스텁 200 형상 · 가드 도달 각 1 · 대조군 2/2 rationale) ②갈림 3/3(off·미도달 8799·CLI 부재 8788 503 실재) ③env·키 0(코드 축 · 8787 로그 면 = 센쿠2 소유 미측) ④fixture 심사 PASS(32 이벤트 · 285 문자열 · sha 일치) ⑤화면 채택 2/2·거부 0/2+사유 렌더 + e2e 130/3/3(조건 갈림 online=true · 못 잼 2 · D-22 1) ⑥지연 미충족 · 자수 2. Latency Target 10 s (baseline §33, provisional) not met — Actual 합성 step 18.4~19.1s(벽시계 run 21.5~26.7s) wall-clock (CLI-internal 센쿠2 CLI 내부 10.9~13.6s, n=3(리바이2)+n=5(센쿠2)); recorded as Target/Actual, baseline revision referred to the operator.
- develop promoted to main: #411 (`0f75f96`, third promotion today).

## 2026-09-03 (owner switch, latency drills)

- Reboot resume (06:50): SSOT bundle 4 landed (#415); both seats respawned by the lead via the scrub wrapper; external probes green.
- D-22 closed: net fix #416 (count the success text, detection control 1/1 in both modes).
- T6-1 axis ⑦ verified on the public replay (#418, §10): rewind boundary 29 == recorded seq 28; external-vantage badge absence classified as observer loss, not a defect. T6-1 now holds on all seven axes.
- Contract v0.1.12 (#417/#419/#421/#427): owner-switch gateway bind/token, `/live/status.online` as a real health probe, `429 session_run_cap_exceeded` with `Retry-After` and an unchanged error body, timeout invariant (gateway < client budget; first draft had it backwards), default synthesis opus/low per operator decisions 07:36 and 07:59.
- T6-2 implementation landed (#423, mock 11/11), runbook §7 + README paragraph (#424), measured ON/OFF table (#426), effort default low + switch handles (#428). Deployed ai-api image replaced with `4685d80` (13 s outage, previous container kept as `fkt-deploy-ai-api-6e1487d`, Live env present, gateway OFF by default); external probes green.
- Latency drills: sonnet/medium 14.8~15.2 s, opus/medium 10.5 s, haiku/medium 44.7~60.1 s on the same GS-01 input with equal objective quality; opus low 9.3~9.5 s vs high 11.1~11.4 s; process spawn 1.7 s; prompt-cache hits do not reduce latency; no fast mode in headless CLI (#425).
- D-23 registered: internal exception class name leaked into `rejectedReason` on the public run timeline (levi2 E1); fix in ai-api before promotion.
- T6-3 registered (49→50): preliminary ranking event + sentence streaming, contract v0.1.13 (#429); API-key path deferred by the operator (08:10).

## 2026-09-03 (design redesign, guided tour)

- T6-2 completed (ledger 45): owner-switch live synthesis through the local gateway, independent verification PASS (#432, 7 of 8 axes with the 13.8 s figure recorded), and the three-layer D-23 repair closed (#444).
- T6-3 completed (ledger 46): gateway NDJSON streaming (#438), the screen axis (#443) and a re-recorded GS-01 fixture carrying `step.progress` (#453, 32 -> 38 events). The verification seat判 no-regression by comparing rows against a control on the same stage, and separated a flaky spec (`t42b-shell-axes`) from the change by running it twice on the same target.
- T6-4 redesigned after the operator rejected the value-only reskin (#448 closed): research on the target visual language produced four named reasons the console did not read the way the operator wanted - unicode glyphs used as icons, an icon-only 56 px rail, a 1 px border on every surface, and small type with tight spacing. PR #457 answers with structure: dark as the default palette, a 260 px labelled rail, borders replaced by three surface steps, a headline-first overview, a vertical-rail agent timeline, and charts drawn as a min..max band with a mean line - the "smeared" curve turned out to be `bucket-minmax` teeth, not a colour problem. Approved by the operator (15:25) with two conditions - label what each chart measures, and fix the line - both landed.
- T6-5 registered (51 -> 52) and implemented: a nine-step guided tour that runs on the real screens, replay-only so a tutorial cannot spend the live-synthesis budget. Off renders nothing; the invite card does not block the page; the click step refuses to advance until the user actually presses the target. Full-pass drill green with zero console errors.
- D-24 closed on both axes (server #447, screen needles #452). D-24b closed (#455) by making the gateway carry a `reasonCode` instead of parsing its prose - verification confirmed both directions (same prose without the code falls through to the structural branch, the code with different prose still classifies as binding failure).
- D-25 closed (#458): three verification rows had been counting the shell's own "owner gateway" banner as an ownership leak. Scan narrowed to `main` rather than excluding the word, with a planted leak sentence proving the narrowed eye still sees.
- Process: a commit pushed to an already-merged lane silently missed develop (`50701a5`); recovered through a separate PR and recorded as the landing-gap rule in practice.

## 2026-09-04 (promotions 7, 8 and 9)

- **develop promoted to main, seventh promotion** (10:15:16 KST, `d896c1e`, PR #567). The operator pre-approved it at 09:44:59 on one condition - D-1 independently verified PASS plus a Golden Scenario re-run; the condition was met at 10:11 (levi2 #565: D-1 10/10, GS 10/10, zero console errors). Vercel Production `dpl_5Dot46pGqkiENrq2Qdd5uNMFzsQu` READY at 10:15:49 (25 s build, `githubCommitSha` matching); 4 of 10 root asset references changed against the pre-promotion snapshot (the comparison was proven RED before the merge). External vantage: `/api/health` 200 ok, `/` 200. External re-check by levi2 (#568, public IP 64.29.17.67, `Server: Vercel`): D-1 passes on the public surface, GS 9/10, and step 10's four console errors are the known `wss .../api/ws/runs` 404 - recorded as observation O-4 in the D-21 lineage (the public path's WebSocket still never opens; the run completes through polling, no functional impact). The deployed ai-api (`:8010`) was not part of this promotion (build `7956e0c` unchanged).
- **develop promoted to main, eighth promotion** (12:23:21 KST, `3a49005`, PR #583; operator approval 12:19:11, recommended option (a)). Vercel Production `dpl_34LwR2edPY4r6vvtvYGhVkRtAZX5` READY with a matching `githubCommitSha`; 12 of 14 root assets changed against the pre-promotion snapshot (again RED-confirmed first), and the new CSS carries one `min-h-11` occurrence as the T7-29b marker. External vantage: `/api/health` 200 ok, `/` 200. Contents: T7-29b (#576, independently verified #582), the D-48 repair (#571, contract v0.1.14, independently verified #577), the D-50 redefinition (#579), plus tests, evidence and documentation. ai-api (`:8010`) untouched (build `7956e0c`). Two of the day's four allowed promotions used.
- **develop promoted to main, ninth promotion** (14:04:39 KST, `7151c2c`, PR #595; operator approval 13:57:53, option (a)). Content: D-49 congestion badge on 503 (#586, verified X-11 #591), D-51 human-readable unavailable reason (#588, verified X-25 re-run #593), D-52 pointer guard for the `inert` fallback branch (#590, verified X-22 forced column #593). Exception ledger 23 PASS / 0 FAIL / 2 unverified / 25. Vercel production completed; 7 of 11 root assets changed against the pre-promotion snapshot. Same day: Live gateway switched ON by operator order (14:06) and the per-session Live run cap raised from 3 to 10 (container recreated 14:15, `FKT_RUN_CAP_PER_SESSION=10`).
