# Factory Knowledge Twin — AI Operations Console

Portfolio-grade PoC: when factory equipment shows anomalies, an AI agent investigates equipment state, sensor trends, maintenance history, SOPs, safety rules, and a knowledge graph — then proposes root-cause candidates with cited evidence and drafts a work order for human approval.

> **Status: bootstrap.** Baseline spec: [`docs/baseline/poc-baseline-v0.2.md`](docs/baseline/poc-baseline-v0.2.md) (Korean). Public release structure, demo links, KPI evidence, and license closure will follow the baseline §34.

- **Stack (planned):** Next.js on Vercel (always-on sandbox + deterministic replay) · FastAPI + LangGraph · PostgreSQL/pgvector · Neo4j · local embedding/reranker · Cloudflare Tunnel / Tailscale Funnel
- **Safety boundary:** synthetic manufacturing data only · no real equipment control · human-in-the-loop approval · no Claude subscription exposed as a public API
- **License:** Apache-2.0 (to be finalized at release per baseline §34.5)
