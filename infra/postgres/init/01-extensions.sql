-- pgvector 확장 활성화 (T1-0 · 최초 기동 시 1회 실행)
-- 스키마·테이블은 S2(T1-x)에서 별도 마이그레이션으로 만든다 — 여기서는 확장만.
CREATE EXTENSION IF NOT EXISTS vector;
