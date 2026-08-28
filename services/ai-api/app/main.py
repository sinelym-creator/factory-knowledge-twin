"""ai-api 부팅 골격 (T1-0).

🔴 기능 코드 없음 — 부팅과 health 응답만 확인한다.
조사 workflow·retrieval·DB 연결은 S2 이후 티켓에서 붙인다.
"""

from fastapi import FastAPI

app = FastAPI(
    title="FKT ai-api",
    version="0.0.1",
    description="Factory Knowledge Twin — AI API (skeleton)",
)


@app.get("/health")
async def health() -> dict[str, str | bool]:
    """부팅 확인용 — 계약(rest-api-v0.1.md)의 GET /health 자리표시자."""
    return {"ok": True, "version": "0.0.1"}
