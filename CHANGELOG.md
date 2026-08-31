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
