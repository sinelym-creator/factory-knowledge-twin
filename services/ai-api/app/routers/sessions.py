"""계약 v0.1 §세션 — 격리·리셋."""

from __future__ import annotations

from fastapi import APIRouter

from ..errors import NOT_IMPLEMENTED, NotImplementedRoute
from ..schemas import OkResponse, SessionCreated

router = APIRouter(tags=["session"])


@router.post("/sessions", response_model=SessionCreated, responses=NOT_IMPLEMENTED)
async def create_session() -> SessionCreated:
    """세션 생성 — 계약 `{ sessionId }`(쿠키 병행). 세션 키가 격리 단위다(인증 없음)."""
    raise NotImplementedRoute("POST /sessions", "세션 저장소")


@router.post("/sessions/{sid}/reset", response_model=OkResponse, responses=NOT_IMPLEMENTED)
async def reset_session(sid: str) -> OkResponse:
    """해당 세션 상태«만» 초기화 — 계약 `{ ok: true }`."""
    raise NotImplementedRoute("POST /sessions/{sid}/reset", "세션 저장소")
