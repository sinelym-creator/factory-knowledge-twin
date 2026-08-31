# ai-api — 공개 형상 골격 (T4-1 ⓐ · baseline §14.2)
#
# 🔴 **자격 증명·절대경로를 이미지에 굽지 않는다**(§16.3 · §34.6). DSN·비밀번호는 전부
#    실행 시점 환경변수다. 이 파일에 기본 DSN을 박아 두면 그 값이 «어디서든» 붙고, 왜
#    붙었는지 아무도 모른다(settings.py 머리말과 같은 규율).
#
# 🔴 **빌드 sha 는 «인자»로 받는다**(Q-46). 이미지 안에서 git 을 부르지 않는다 — 리포를
#    이미지에 넣어야 하고, 그러면 경로·히스토리가 함께 들어간다. 짧은 sha 한 줄이면 된다.

FROM python:3.12-slim AS base

# 🔴 torch 는 «CPU 전용» 인덱스에서 받는다. 기본 PyPI 의 리눅스 휠은 CUDA 런타임을 함께
#    끌고 와 이미지가 수 GB 늘어나는데, 이 서비스는 노트북 CPU 에서 돈다(§14.2).
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # HF 캐시를 볼륨으로 뺄 수 있게 한 곳으로 모은다(콜드스타트 30초 자산 · Q-44)
    HF_HOME=/models

WORKDIR /srv

COPY requirements.txt ./
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY app ./app

# 🔴 빌드 sha — 없으면 «unknown» 이다. 그럴듯한 값을 지어내지 않는다: /health 가 sha 를
#    말하는 목적은 「어느 커밋이 답했나」이고, 지어낸 값은 그 질문에 거짓으로 답한다.
ARG FKT_BUILD_SHA=unknown
ENV FKT_BUILD_SHA=${FKT_BUILD_SHA}

# 🔴 root 로 돌리지 않는다(§16.3 「container privilege 최소화」).
RUN useradd --system --create-home --uid 10001 fkt && chown -R fkt:fkt /srv && mkdir -p /models && chown fkt:fkt /models
USER fkt

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
