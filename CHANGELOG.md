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
