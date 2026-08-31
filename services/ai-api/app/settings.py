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
