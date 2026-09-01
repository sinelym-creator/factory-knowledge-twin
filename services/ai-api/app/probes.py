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

🔴 **핸들이 없으면 프로브가 «다시 열어 본다»**(Q-52 · 2026-08-31). 앞판은 기동 시 한 번만
   풀을 만들고, 실패하면 `pg_pool=None` 을 «영구히» 들고 있었다. 그래서 의존이 살아난 뒤에도
   `/health` 는 부팅 순간의 실패 문구를 그대로 답했다 — 실측(E1): 재부팅 restart 경로에서
   ai-api 가 postgres 보다 3ms 먼저 떠(`depends_on` 은 restart 에 적용되지 않는다) 풀 생성이
   실패했고, postgres 가 22초 뒤 정상화된 뒤에도 38분간 `unavailable` 이었다. 같은 컨테이너
   안에서 asyncpg 직결은 그 시각에 성공했다 — 「pg 가 안 받는다」가 아니라 「아무도 다시
   묻지 않았다」였다.
   부팅을 죽이지 않는다는 규율은 그대로다(T1-8). 대신 **복구를 관측할 창구**를 프로브에 둔다:
   물어볼 때마다 핸들이 없으면 한 번 열어 보고, 실패하면 최소 간격만큼 쉰다(폭주 금지).
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

# 🔴 **재연결 최소 간격.** 프로브가 부를 때마다 무제한으로 다시 열면, 의존이 계속 죽어 있는
#    동안 `/health` 를 두드리는 만큼 연결 시도가 나간다 — 모니터가 1초마다 물으면 1초마다
#    붙어 보는 셈이고, 그 폭주는 살아나려는 의존을 다시 넘어뜨린다.
#    compose healthcheck interval 이 10s 이므로 5s 면 한 체크에 최대 한 번 시도한다.
# 🔴 설정으로 빼지 않았다 — env 표면을 늘리면 「이 값을 언제 바꾸나」가 새 질문이 되는데,
#    지금 그것을 조절해야 할 근거가 없다. 필요해지면 그때 계약과 함께 올린다.
_RECONNECT_MIN_INTERVAL_SEC = 5.0


@dataclass
class Resources:
    """lifespan 이 만들고 앱이 들고 다니는 의존 핸들.

    핸들이 None 이면 「그 의존은 지금 없다」이며, 이유는 `notes` 가 말한다.
    """

    settings: Settings
    pg_pool: Any | None = None
    neo4j_driver: Any | None = None
    notes: dict[str, str] = field(default_factory=dict)

    # 🔴 다음 재연결을 시도해도 되는 시각(`time.monotonic`). 벽시계를 쓰지 않는 이유는
    #    시스템 시간이 뒤로 조정되면 간격이 음수가 되어 «폭주» 쪽으로 무너지기 때문이다.
    _pg_retry_after: float = 0.0
    _neo4j_retry_after: float = 0.0
    # 🔴 프로브는 동시에 여러 개가 돈다(`probe_all` · `/health` 두 번 겹침). 잠그지 않으면
    #    같은 순간에 풀을 두 개 만들고 하나는 주인 없이 남는다(연결 누수).
    _open_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    # 🔴 마지막 프로브 결과와 그 시각(monotonic) — live 시작 판정만 읽는다(위 성문).
    _probe_cache: dict[str, "DependencyProbe"] | None = None
    _probe_cache_at: float = 0.0

    async def probe_all(self) -> dict[str, DependencyProbe]:
        """두 프로브를 «동시에» 돌린다. 직렬로 돌리면 상한이 합산된다."""
        pg, neo = await asyncio.gather(self.probe_postgres(), self.probe_neo4j())
        result = {"postgres": pg, "neo4j": neo}
        self._probe_cache = result
        self._probe_cache_at = time.monotonic()
        return result

    async def probe_all_cached(self, max_age_sec: float) -> dict[str, DependencyProbe]:
        """`max_age_sec` 안에 잰 값이 있으면 그것을 쓴다 (T4-2b Q-48).

        🔴 **`/health` 는 이 캐시를 쓰지 않는다.** health 는 「지금 어떤가」를 묻는 창구라
           캐시된 과거를 답하면 그 창구의 뜻이 사라진다. 캐시가 필요한 쪽은 **요청마다 부르는**
           live 시작 판정이다 — 매번 두 의존에 실제로 붙어 보면 보호장치가 스스로 부하가 된다.

        🔴 **≤5s stale 을 «허용»한다고 계약이 적었다**(v0.1.9 Q-48 절). 그 틈에 시작된 run 은
           `run.failed` + `fallback:"replay"` 로 받는다 — 여기서 완벽한 최신성을 흉내 내는 대신,
           틀릴 수 있는 창을 «성문된 크기»로 묶고 그 뒤를 기존 신호로 받는 쪽을 고른다.
        """
        if self._probe_cache is not None and (time.monotonic() - self._probe_cache_at) <= max_age_sec:
            return self._probe_cache
        return await self.probe_all()

    async def probe_postgres(self) -> DependencyProbe:
        # 🔴 물어보는 자리가 곧 «다시 열어 보는» 자리다(Q-52). 열지 못하면 아래에서 그
        #    사유를 그대로 답한다 — 실패를 조용히 삼키지 않는다.
        await self._reopen_postgres_if_needed()
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
        # 🔴 형제 축도 같이 고친다. 드라이버 생성은 네트워크를 타지 않아 실패가 드물지만,
        #    실패하면 같은 병(영구 None)이다 — 한쪽만 고치면 다음 사람이 그 비대칭을 결함으로
        #    읽거나, 같은 자리를 두 번 고친다.
        await self._reopen_neo4j_if_needed()
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


    async def _reopen_postgres_if_needed(self) -> None:
        """핸들이 없으면 «한 번» 다시 열어 본다. 🔴 성공하면 옛 사유를 지운다.

        사유를 남겨 두면 `/health` 가 「지금은 붙었는데 그때 이랬다」를 함께 말하게 되고,
        읽는 쪽은 그 문장을 현재 상태로 읽는다.
        """
        if self.pg_pool is not None or self.settings.postgres_dsn is None:
            return
        if time.monotonic() < self._pg_retry_after:
            return
        async with self._open_lock:
            # 🔴 잠금을 얻는 동안 다른 프로브가 이미 붙였을 수 있다 — 두 번 확인한다.
            if self.pg_pool is not None or time.monotonic() < self._pg_retry_after:
                return
            self._pg_retry_after = time.monotonic() + _RECONNECT_MIN_INTERVAL_SEC
            pool, note = await _open_pg_pool(self.settings)
            if pool is not None:
                self.pg_pool = pool
                self.notes.pop("postgres", None)
                log.info("postgres 풀 재연결 성공 — degraded 해제")
            else:
                self.notes["postgres"] = note or "풀 생성 실패"

    async def _reopen_neo4j_if_needed(self) -> None:
        """neo4j 드라이버 자리의 같은 처방(형제 축)."""
        if self.neo4j_driver is not None or self.settings.neo4j_uri is None:
            return
        if time.monotonic() < self._neo4j_retry_after:
            return
        async with self._open_lock:
            if self.neo4j_driver is not None or time.monotonic() < self._neo4j_retry_after:
                return
            self._neo4j_retry_after = time.monotonic() + _RECONNECT_MIN_INTERVAL_SEC
            driver, note = _open_neo4j_driver(self.settings)
            if driver is not None:
                self.neo4j_driver = driver
                self.notes.pop("neo4j", None)
                log.info("neo4j 드라이버 재생성 성공 — degraded 해제")
            else:
                self.notes["neo4j"] = note or "드라이버 생성 실패"


async def _open_pg_pool(settings: Settings) -> tuple[Any | None, str | None]:
    """풀을 열어 본다 — 🔴 «부팅»과 «프로브 재연결»이 같은 코드를 쓴다.

    두 자리에 따로 적으면 한쪽만 고치는 날 부팅과 복구가 다른 규칙으로 붙는다(상한·풀 크기가
    갈리는 것이 특히 조용하다). 그래서 여기 한 번만 적는다.
    """
    try:
        import asyncpg

        async with asyncio.timeout(settings.probe_timeout_sec):
            pool = await asyncpg.create_pool(
                dsn=settings.postgres_dsn.get_secret_value(),  # type: ignore[union-attr]
                min_size=settings.pg_pool_min,
                max_size=settings.pg_pool_max,
            )
        return pool, None
    except Exception as exc:  # noqa: BLE001 — 실패는 «상태»로 바꾼다(부팅을 죽이지 않는다)
        return None, _brief(exc)


def _open_neo4j_driver(settings: Settings) -> tuple[Any | None, str | None]:
    """드라이버를 만든다. 🔴 생성은 연결하지 않는다 — 실제 연결은 프로브가 확인한다."""
    try:
        from neo4j import AsyncGraphDatabase

        auth = None
        if settings.neo4j_user and settings.neo4j_password:
            auth = (settings.neo4j_user, settings.neo4j_password.get_secret_value())
        return AsyncGraphDatabase.driver(settings.neo4j_uri, auth=auth), None  # type: ignore[arg-type]
    except Exception as exc:  # noqa: BLE001
        return None, _brief(exc)


async def open_resources(settings: Settings) -> Resources:
    """의존 핸들을 «열어 본다». 실패는 예외가 아니라 note 로 남는다."""
    res = Resources(settings=settings)

    if settings.postgres_dsn is not None:
        res.pg_pool, note = await _open_pg_pool(settings)
        if res.pg_pool is None:
            res.notes["postgres"] = note or "풀 생성 실패"
            # 🔴 여기서 죽지 않는다(T1-8). 그리고 이제 «영구»도 아니다 — 프로브가 다시 열어
            #    본다. 다만 첫 재시도까지 간격을 둔다: 부팅 직후 연달아 붙는 것을 막는다.
            res._pg_retry_after = time.monotonic() + _RECONNECT_MIN_INTERVAL_SEC
            log.warning(
                "postgres 풀 생성 실패 — degraded 로 계속한다(프로브가 %.0fs 뒤부터 재시도): %s",
                _RECONNECT_MIN_INTERVAL_SEC,
                res.notes["postgres"],
            )
    else:
        res.notes["postgres"] = "FKT_POSTGRES_DSN 미설정"

    if settings.neo4j_uri is not None:
        res.neo4j_driver, note = _open_neo4j_driver(settings)
        if res.neo4j_driver is None:
            res.notes["neo4j"] = note or "드라이버 생성 실패"
            res._neo4j_retry_after = time.monotonic() + _RECONNECT_MIN_INTERVAL_SEC
            log.warning("neo4j 드라이버 생성 실패 — degraded 로 계속한다: %s", res.notes["neo4j"])
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
