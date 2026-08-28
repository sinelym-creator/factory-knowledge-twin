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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
