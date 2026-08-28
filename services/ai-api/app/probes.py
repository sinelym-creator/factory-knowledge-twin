"""의존 자원 — asyncpg 풀 · Neo4j async 드라이버 골격과 그 프로브 (T1-8).

🔴 §7 「완전 비동기 경로」. 두 드라이버 모두 async 구현을 쓴다. 동기 드라이버(psycopg2 계열,
   neo4j 동기 세션)를 하나라도 섞으면 그 호출 동안 이벤트 루프 전체가 멈춘다 — 이 서비스는
   조사 1건이 수 초를 쓰는 동안 WebSocket 으로 진행을 흘려야 하므로, 그 정지가 그대로
   화면 멈춤이 된다.

🔴 부팅은 의존 없이도 성립한다. 풀 생성 실패로 프로세스가 죽으면 「DB가 늦게 뜨는」 흔한
   상황에서 서비스가 재시작 루프에 빠지고, /health 로 원인을 물어볼 창구조차 사라진다.
   실패는 «상태»로 남기고 서비스는 뜬다.

🔴 프로브에는 상한을 건다. 의존이 느릴 때 /health 가 같이 느려지면 모니터는 그것을
   「서비스가 죽었다」로 읽는다.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from .schemas import DependencyProbe
from .settings import Settings

log = logging.getLogger("fkt.probes")


@dataclass
class Resources:
    """lifespan 이 만들고 앱이 들고 다니는 의존 핸들.

    핸들이 None 이면 「그 의존은 지금 없다」이며, 이유는 `notes` 가 말한다.
    """

    settings: Settings
    pg_pool: Any | None = None
    neo4j_driver: Any | None = None
    notes: dict[str, str] = field(default_factory=dict)

    async def probe_all(self) -> dict[str, DependencyProbe]:
        """두 프로브를 «동시에» 돌린다. 직렬로 돌리면 상한이 합산된다."""
        pg, neo = await asyncio.gather(self.probe_postgres(), self.probe_neo4j())
        return {"postgres": pg, "neo4j": neo}

    async def probe_postgres(self) -> DependencyProbe:
        if self.pg_pool is None:
            return DependencyProbe(
                state="unconfigured" if self.settings.postgres_dsn is None else "unavailable",
                detail=self.notes.get("postgres"),
            )
        started = time.perf_counter()
        try:
            async with asyncio.timeout(self.settings.probe_timeout_sec):
                async with self.pg_pool.acquire() as conn:
                    await conn.fetchval("SELECT 1")
        except asyncio.CancelledError:
            raise                       # 취소는 상태가 아니다 — 그대로 위로 흘린다(§7 취소 전파)
        except Exception as exc:        # noqa: BLE001 — 프로브는 어떤 실패도 «상태»로 바꾼다
            return DependencyProbe(state="unavailable", detail=_brief(exc))
        return DependencyProbe(state="ok", latencyMs=_elapsed_ms(started))

    async def probe_neo4j(self) -> DependencyProbe:
        if self.neo4j_driver is None:
            return DependencyProbe(
                state="unconfigured" if self.settings.neo4j_uri is None else "unavailable",
                detail=self.notes.get("neo4j"),
            )
        started = time.perf_counter()
        try:
            async with asyncio.timeout(self.settings.probe_timeout_sec):
                await self.neo4j_driver.verify_connectivity()
        except asyncio.CancelledError:
            raise
        except Exception as exc:        # noqa: BLE001
            return DependencyProbe(state="unavailable", detail=_brief(exc))
        return DependencyProbe(state="ok", latencyMs=_elapsed_ms(started))


async def open_resources(settings: Settings) -> Resources:
    """의존 핸들을 «열어 본다». 실패는 예외가 아니라 note 로 남는다."""
    res = Resources(settings=settings)

    if settings.postgres_dsn is not None:
        try:
            import asyncpg

            async with asyncio.timeout(settings.probe_timeout_sec):
                res.pg_pool = await asyncpg.create_pool(
                    dsn=settings.postgres_dsn.get_secret_value(),
                    min_size=settings.pg_pool_min,
                    max_size=settings.pg_pool_max,
                )
        except Exception as exc:        # noqa: BLE001
            res.notes["postgres"] = _brief(exc)
            log.warning("postgres 풀 생성 실패 — degraded 로 계속한다: %s", _brief(exc))
    else:
        res.notes["postgres"] = "FKT_POSTGRES_DSN 미설정"

    if settings.neo4j_uri is not None:
        try:
            from neo4j import AsyncGraphDatabase

            auth = None
            if settings.neo4j_user and settings.neo4j_password:
                auth = (settings.neo4j_user, settings.neo4j_password.get_secret_value())
            # 드라이버 생성은 연결하지 않는다 — 실제 연결은 프로브가 확인한다.
            res.neo4j_driver = AsyncGraphDatabase.driver(settings.neo4j_uri, auth=auth)
        except Exception as exc:        # noqa: BLE001
            res.notes["neo4j"] = _brief(exc)
            log.warning("neo4j 드라이버 생성 실패 — degraded 로 계속한다: %s", _brief(exc))
    else:
        res.notes["neo4j"] = "FKT_NEO4J_URI 미설정"

    return res


async def close_resources(res: Resources) -> None:
    """graceful shutdown(§7) — 핸들을 닫는다. 닫기 실패로 종료를 막지 않는다."""
    if res.pg_pool is not None:
        try:
            async with asyncio.timeout(res.settings.probe_timeout_sec):
                await res.pg_pool.close()
        except Exception as exc:        # noqa: BLE001
            log.warning("postgres 풀 종료 중 무시한 오류: %s", _brief(exc))
    if res.neo4j_driver is not None:
        try:
            async with asyncio.timeout(res.settings.probe_timeout_sec):
                await res.neo4j_driver.close()
        except Exception as exc:        # noqa: BLE001
            log.warning("neo4j 드라이버 종료 중 무시한 오류: %s", _brief(exc))


def _brief(exc: BaseException) -> str:
    """예외를 한 줄로. 🔴 DSN·자격 증명이 섞여 나가지 않게 메시지를 자른다."""
    text = str(exc).splitlines()[0] if str(exc) else exc.__class__.__name__
    return f"{exc.__class__.__name__}: {text[:120]}"


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
