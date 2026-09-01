"""질의 임베딩 — 색인(T1-4)과 «같은 공간»에 질문을 넣는다.

🔴 정합의 정본은 `services/indexer/build_index.py`다. 거기서 chunk를 어떤 모델로, 어떤
   접두로, 정규화를 켜고 껐는지가 이 파일과 하나라도 어긋나면 검색은 «오류 없이» 무의미한
   순위를 낸다 — 그래서 어긋남을 실행 시점에 깨지게 만든다(차원 대조 · 아래 `ensure_ready`).

| 축 | 색인(build_index.py) | 질의(이 파일) |
|---|---|---|
| 모델 | `intfloat/multilingual-e5-small` | 같다(아래 `MODEL_ID`) |
| 접두 | `passage: ` | `query: ` — 🔴 e5는 «비대칭» 모델이라 접두가 다른 것이 정합이다 |
| 정규화 | `normalize_embeddings=True` | 같다 → 코사인 = 내적 |
| 차원 | `document_chunk.embedding vector(384)` | 모델 차원과 대조해 다르면 즉시 실패 |

🔴 blocking 0(§7 · T1-8 계보): `SentenceTransformer` 의 로드·encode 는 동기 CPU 작업이다.
   async 경로에서 직접 부르면 그 수백 ms~수 초 동안 이벤트 루프가 멈추고, 같은 프로세스의
   WebSocket 진행 스트림이 함께 멈춘다. 전부 `asyncio.to_thread` 로 내보낸다.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

MODEL_ID = "intfloat/multilingual-e5-small"      # 🔴 build_index.py MODEL_ID 와 같아야 한다
QUERY_PREFIX = "query: "                          # 색인 쪽은 "passage: " (비대칭 e5)

log = logging.getLogger("fkt.retrieval.embedding")

_model: Any | None = None
_lock = asyncio.Lock()

# 🔴 «준비됐는가»를 프로세스가 스스로 말한다(Q-44 · T4-1 ⑦).
#    T3-4 실측: 첫 compare 왕복 30초+ (여기서 모델을 «그때» 올렸다) · warm 이후 0.1초.
#    이 상태가 밖에서 안 보이면 그 30초는 「서버 고장」으로 보고된다 — 실제로 그렇게 될 뻔했다.
#    🔴 `cold`(아직 안 올렸다)와 `failed`(올리다 실패했다)를 «합치지 않는다»: 앞은 기다리면
#       되고 뒤는 기다려도 안 된다. 합치면 운영이 그 둘을 구분할 방법이 없다.
_state: str = "cold"
_detail: str | None = None


def readiness() -> tuple[str, str | None]:
    """(state, detail) — `cold`·`loading`·`ready`·`failed`. 부작용 0(재는 쪽이 올리지 않는다)."""
    return _state, _detail


class EmbeddingMismatch(RuntimeError):
    """모델과 색인이 다른 공간을 가리킨다 — 검색을 시작하면 안 되는 상태."""


async def ensure_ready(expected_dim: int) -> int:
    """모델을 «미리» 올리고 차원을 색인과 대조한다.

    🔴 왜 미리 올리는가: 첫 로드는 수 초가 걸린다. 그것을 전략 실행 구간 안에서 하면
       계약의 `elapsedMs` 가 「검색에 걸린 시간」이 아니라 「모델을 처음 올린 시간」이 되어,
       화면이 전략 비교라며 보여 주는 숫자가 첫 호출에서만 거짓이 된다.
       그래서 compare 는 측정 «전에» 이 함수로 준비를 끝낸다.
    """
    global _model, _state, _detail
    async with _lock:
        if _model is None:
            t0 = asyncio.get_running_loop().time()
            _state = "loading"
            try:
                _model = await asyncio.to_thread(_load)
            except Exception as exc:                      # noqa: BLE001 — 사유를 «남기고» 다시 던진다
                _state, _detail = "failed", f"{type(exc).__name__}: {exc}"[:200]
                raise
            took = asyncio.get_running_loop().time() - t0
            _state, _detail = "ready", f"{MODEL_ID} · 로드 {took:.1f}s"
            log.info("임베딩 모델 로드 %.1fs (%s)", took, MODEL_ID)
        elif _state != "ready":
            _state = "ready"
    dim = _dimension(_model)
    if dim != expected_dim:
        raise EmbeddingMismatch(
            f"질의 모델 {MODEL_ID}({dim}d) ≠ 색인 document_chunk.embedding vector({expected_dim}) — "
            "같은 공간이 아니므로 검색을 중단한다"
        )
    return dim


def _load() -> Any:
    from sentence_transformers import SentenceTransformer   # noqa: PLC0415 — 지연 로드(무거운 의존)

    return SentenceTransformer(MODEL_ID)


def _dimension(model: Any) -> int:
    # sentence-transformers 6.x 에서 이름이 바뀌었다 — 색인 쪽과 같은 방식으로 둘 다 본다.
    getter = getattr(model, "get_embedding_dimension", None) or model.get_sentence_embedding_dimension
    return int(getter())


async def embed_query(question: str) -> list[float]:
    """질문 1건을 색인과 같은 공간의 단위 벡터로."""
    if _model is None:
        raise EmbeddingMismatch("ensure_ready() 를 먼저 부르지 않았다 — 준비 전 임베딩 금지")
    vec = await asyncio.to_thread(
        _model.encode,
        QUERY_PREFIX + question,
        normalize_embeddings=True,           # 🔴 색인과 같은 값 — 다르면 점수 스케일이 어긋난다
        show_progress_bar=False,
    )
    return [float(x) for x in vec]


def to_pgvector(vec: list[float]) -> str:
    """asyncpg 파라미터로 넘길 pgvector 리터럴.

    🔴 이것은 «값»이며 질의문에 이어 붙이지 않는다 — SQL 쪽에서 `$1::vector` 로 받는다.
    """
    return "[" + ",".join(f"{x:.8f}" for x in vec) + "]"


async def warm_up() -> None:
    """기동 시 모델을 미리 올린다 (Q-44 · T4-1).

    🔴 **부팅을 막지 않는다.** 호출자는 이것을 백그라운드 태스크로 띄운다 — 여기서 기다리면
       모델 적재(수십 초)만큼 `/health` 조차 안 뜨고, 그러면 컨테이너 헬스체크가 서비스를
       «죽은 것»으로 읽어 재시작 루프에 들어간다(main.py 머리말의 그 사고와 같은 형태).

    🔴 **차원 대조는 여기서 하지 않는다.** 그것은 색인과의 정합 검사이고 DB 를 물어야 안다 —
       질의 경로의 `ensure_ready(expected_dim)` 이 계속 그 자리를 지킨다. 여기서 하는 일은
       「무거운 것을 미리 올린다」 하나뿐이고, 그 이상을 하면 실패 사유가 섞인다.

    🔴 실패해도 «던지지 않는다» — 준비는 최적화이지 기동 조건이 아니다. 대신 실패 사실이
       `readiness()` 에 남아 `/health` 가 그것을 말한다(조용한 실패 0).
    """
    global _model, _state, _detail
    async with _lock:
        if _model is not None:
            return
        t0 = asyncio.get_running_loop().time()
        _state = "loading"
        try:
            _model = await asyncio.to_thread(_load)
        except Exception as exc:                          # noqa: BLE001 — 기동을 죽이지 않는다
            _state, _detail = "failed", f"{type(exc).__name__}: {exc}"[:200]
            log.warning("임베딩 warm-up 실패 — 첫 검색이 느려진다: %s", _detail)
            return
        took = asyncio.get_running_loop().time() - t0
        _state, _detail = "ready", f"{MODEL_ID} · warm-up {took:.1f}s"
        log.info("임베딩 warm-up 완료 %.1fs (%s)", took, MODEL_ID)
