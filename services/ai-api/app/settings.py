"""설정 — pydantic-settings (T1-8).

🔴 기본값에 자격 증명을 넣지 않는다. DSN·비밀번호는 «미설정»이 기본이고, 미설정이면
   의존 프로브가 그 사실을 그대로 말한다(`unconfigured`). 그럴듯한 기본 DSN을 박아 두면
   로컬에서는 붙고 다른 데서는 «왜 붙었는지 모르는 채» 붙는다.

🔴 `.env` 파일을 읽지 않는다. 이 리포는 값 없는 키 목록(`.env.example`)만 두고 실제 값은
   실행 시점 환경변수로 준다(system-architecture §6 · baseline §34.6). 설정 파일을 읽기
   시작하면 그 파일이 커밋될 자리가 생긴다.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FKT_", extra="ignore")

    version: str = "0.1.0"

    # 의존 — 전부 선택. 없으면 서비스는 degraded 로 뜨고 그 사실을 /health 가 말한다.
    postgres_dsn: SecretStr | None = None
    neo4j_uri: str | None = None
    neo4j_user: str | None = None
    neo4j_password: SecretStr | None = None

    # 프로브 상한. 의존이 느릴 때 health 가 같이 느려지면 모니터가 서비스를 죽은 것으로 읽는다.
    probe_timeout_sec: float = 2.0
    # 풀 상한 — 골격 단계의 값이며 부하 실측 후 조정 대상이다(§7 견고성).
    pg_pool_min: int = 1
    pg_pool_max: int = 4

    # replay fixture 디렉터리(T2-4). 미설정이면 리포 상대 `data/replay` 다 —
    # 🔴 코드 기본값에 이 머신의 절대경로를 박지 않는다(커밋되면 그 자체가 공개 경계 위반).
    #    바꿀 수 있게 두는 이유는 「fixture 부재」 상태를 시험에서 실제로 만들기 위함이다.
    replay_fixture_dir: str | None = None

    # --- T4-1 공개 형상 ---------------------------------------------------------
    #
    # 🔴 **빌드 sha 는 «주입»받는다 — 여기서 git 을 부르지 않는다**(Q-46). 프로세스가 리포
    #    안에서 돌 거라는 가정을 심으면 컨테이너에서 그 가정이 깨지고, 깨진 자리에서
    #    「경로를 찾아 올라가는」 코드가 자란다(그 경로가 곧 공개 경계 위반이다 · §34.6).
    #    안 주면 `unknown` 이다 — 그럴듯한 값을 지어내지 않는다.
    build_sha: str = "unknown"

    # 🔴 **CORS 는 «비어 있는 것»이 기본이다.** 「전부 허용」을 기본값으로 두면 그 기본값이
    #    공개 배포까지 따라간다(§16.3 CORS allowlist). 비어 있으면 미들웨어를 «켜지 않는다» —
    #    같은 origin 으로만 오는 로컬 형상(셸 rewrite 경유)이 정확히 그 상태다.
    #    값 형식 = 콤마 구분 origin 목록. 와일드카드(`*`)는 받지 않는다(아래 cors_allowlist).
    cors_origins: str = ""

    # Q-44 — 기동 시 임베딩 모델 warm-up. 🔴 부팅을 «막지» 않는다(main.py 성문 참조).
    warmup_embedding: bool = True

    # --- T4-2b 보호장치 (계약 v0.1.9 append · 형상은 계약 · «값»은 여기) ---------
    #
    # 🔴 계약이 성문한 것은 «형상»(HTTP·error.code·헤더·이벤트)뿐이고 운영 값은 env 다.
    #    그래서 이 절의 기본값은 계약이 아니라 «이 노트북 한 대»의 사정이며, 바꿔도 계약은
    #    갈리지 않는다. 반대로 이름·형상을 여기서 넓히면 그때는 계약이 갈린다.

    # ⓐ Live 동시 실행 상한과 대기열 상한. 둘 다 차면 503 live_capacity_exhausted.
    live_concurrency: int = 1
    live_queue_max: int = 2
    # 🔴 큐에서 얼마나 기다리면 포기하는가 — 계약은 「구현 선택」이라고만 한다. 상한이 없으면
    #    대기열은 «조용히 무한»이 되고, 방문자는 끝나지 않는 진행 표시를 본다. 넘기면
    #    run.failed + fallback:"replay" 로 «다음 수»를 함께 준다.
    live_queue_wait_max_sec: float = 120.0
    # 503 응답의 Retry-After(초). 정수로 나간다 — 계약이 「정수 초」라고 못박았다.
    live_retry_after_sec: int = 30

    # ⓑ run 하나가 붙잡을 수 있는 최대 시간. 넘기면 run.stopped reason=timeout + 안전 종료.
    #    🔴 0 이하 = 끄기가 아니라 «즉시 timeout» 이 되지 않게, 아래 runner 가 양수일 때만 건다.
    run_timeout_sec: float = 300.0

    # 🔴 세션 단위 «조사 실행» 상한(T6-2 ② · 계약 v0.1.12). 분당 rate limit 과 다른 축이다 —
    #    저쪽은 폭주를, 이쪽은 **구독 소모**를 막는다. live 축만 센다(replay 는 소모 0).
    #    0 이하 = 상한 없음(끄기). 「0 이면 아무도 못 돈다」로 두면 끄려는 순간 Live 가 닫힌다.
    #    🔴 3 → 5: 배포가 실제로 도는 값이 5 이고 공개 문서도 5 라고 말한다. 기본값만 3 이면
    #       env 를 안 준 형상(로컬·새 클론·테스트)이 문서와 다른 규칙으로 돌아, 「5회」를 읽고
    #       온 사람이 4회째에 429 를 만난다 — 기본값은 «아무도 정해 주지 않았을 때의 답»이라
    #       가장 자주 읽히는 문서와 같아야 한다. env 우선순위는 그대로다(env 가 있으면 env).
    run_cap_per_session: int = 5
    run_cap_window_sec: float = 3600.0

    # ⓒ rate limit — 축 2개를 «각각» 센다(IP · 익명 세션). 창은 60초 고정 슬라이딩.
    #    🔴 기본값을 넉넉히 둔다. 낮은 기본값은 우리 자신의 그물(tests/api·브라우저 suite)을
    #       먼저 잡고, 그러면 「처방이 도는가」를 우리 도구로 확인할 수 없게 된다.
    #       실측은 이 값을 낮춰서 낸다 — 기본값을 실측 편의에 맞추지 않는다.
    # 🔴 600 → 6000 (Q-60). IP 축은 셸(rewrite)이 프록시하는 형상에서 **방문자별 상한이 아니라
    #    총량 차단기**로 동작한다 — ai-api 가 보는 주소가 셸 한 대이기 때문이다. 그 성질 자체는
    #    결함이 아니라 이 배치의 사실이고(방문자별 방어는 세션 축이 맡는다), 다만 값이 낮으면
    #    우리 자신의 그물이 먼저 걸린다(실측: 브라우저 suite 가 429 를 78건 맞고 13행이 빨강).
    rate_limit_ip_per_min: int = 6000
    rate_limit_session_per_min: int = 300
    rate_limit_retry_after_sec: int = 60
    # 🔴 프록시 뒤의 «IP» 를 X-Forwarded-For 첫 값으로 읽을지. 기본은 «안 믿는다» —
    #    믿는 순간 아무나 헤더를 지어내 IP 축을 우회한다. 켜지 않으면 프록시 뒤 방문자가
    #    전원 한 IP 로 뭉친다는 사실은 runbook(T5-4)이 성문한다.
    trust_forwarded_for: bool = False

    # ⓓ 요청 본문 바이트 상한(413)과 자연어 질문 문자 상한(422).
    #    🔴 두 축은 겹칠 수 있고, 겹치면 413 이 먼저다(바이트는 읽기 «전»에 판정된다).
    max_body_bytes: int = 65536
    max_question_chars: int = 500

    # ⓔ 만료 세션 주기 정리 간격(초). 0 이하면 주기 태스크를 «띄우지 않는다»(lazy sweep 은
    #    그대로 남으므로 만료 판정 자체는 변하지 않는다 — 끄는 것은 «청소»지 «만료»가 아니다).
    session_sweep_sec: float = 300.0

    # --- T7-44 조사 run 의 문서 검색 전략 ------------------------------------------
    #
    # 🔴 **`Literal` 이 곧 규칙이다.** 문자열로 받고 나중에 `if` 로 거르면 오타가 런타임
    #    한복판까지 살아 들어가고, 그때는 「vector 도 hybrid 도 아닌」 값이 조용히 한쪽으로
    #    떨어진다. 여기서 타입으로 막으면 **모르는 값은 기동에서 거부된다** — 잘못된 설정을
    #    들고 뜬 프로세스가 없으므로, 「지금 무엇으로 도는가」를 뒤늦게 물을 일이 없다.
    #
    # 🔴 기본값이 `hybrid` 인 것은 폐하 결정 ⓑ(O-36 · 2026-09-06 00:17)다. 이 값은 계약이
    #    아니라 «이 배포의 사정»이고(위 T4-2b 절과 같은 규율), 어느 전략으로 돌았는지는
    #    run 이벤트의 `strategy` 가 매번 말한다 — 설정을 읽어야 알 수 있게 두지 않는다.
    run_retrieval_strategy: Literal["vector", "hybrid"] = "hybrid"

    # --- D-87 FastAPI 문서 표면 노출 -------------------------------------------
    #
    # 🔴 **기본은 «닫힘»이다.** `/docs`·`/redoc`·`/openapi.json`·`/docs/oauth2-redirect` 4종은
    #    FastAPI 가 직접 다는 평범한 Starlette 라우트라서 앱 레벨 세션 가드의 의존 체인
    #    «구조적 밖»에 있다(`session_guard.FRAMEWORK_UNGUARDED` 의 주석 · Q-35 → D-87).
    #    가드를 그 4종에 «붙일» 수 없으므로, 노출 판정은 「켜는가/끄는가」로만 가능하다.
    #
    # 🔴 기본값을 «열림»으로 두지 않는 이유는 CORS 절(위)과 같다 — 기본값은 그대로 공개
    #    배포까지 따라가고, 그때는 아무도 그것을 «선택»한 기억이 없다. 개발자가 스키마를
    #    보고 싶은 형상에서만 env 로 켠다(`FKT_EXPOSE_API_DOCS=1`).
    #
    #    🔴 켜고 끄는 것은 «라우트의 실재»이지 가드가 아니다. 끈 형상에서 4종은 404 이고,
    #       켠 형상에서 4종은 여전히 «가드 밖»이다 — 켜면 세션 없이 읽힌다는 뜻이다.
    expose_api_docs: bool = False

    @property
    def cors_allowlist(self) -> list[str]:
        """설정 문자열 → origin 목록. 🔴 `*` 는 목록에서 «버린다».

        와일드카드를 허용하면 이 한 글자가 allowlist 라는 개념을 없앤다. 필요해 보이면
        코드가 아니라 baseline §16.3 이 정할 일이다.
        """
        return [o.strip() for o in self.cors_origins.split(",") if o.strip() and o.strip() != "*"]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
