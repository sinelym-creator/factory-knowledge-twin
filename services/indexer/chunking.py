"""chunk 분할 정책 — T1-4 게이트 ① 실측 대상 구현.

정본: `docs/product/data-ontology-spec.md` §3.3(chunk_sha256 · chunking_policy_version)
      · §8 Q2(chunk 크기 400~600 token 확정) · `data/documents/README.md`(인용 문장 정본).

🔴 이 모듈은 «정책을 고르는» 코드가 아니라 «후보안을 같은 조건에서 재는» 코드다.
   동결된 정책(chunking_policy_version=1)은 오케스트레이터 판정으로 정해지고, 그때
   `FROZEN_POLICY` 한 줄이 채워진다. 그 전까지 색인 빌드는 이 모듈을 쓰지 않는다.

🔴 토큰은 «토크나이저에 종속»이다. 같은 400 token이 토크나이저마다 다른 분량을 뜻하므로
   chunk 좌표(`#014` 같은 화면 앵커)는 토크나이저를 바꾸는 순간 함께 흔들린다. 그래서
   계수기를 주입받고, 어떤 계수기로 잰 값인지를 실측표에 반드시 병기한다.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Protocol, Sequence

# --- 정규화 (spec §3.3) ---------------------------------------------------------


def normalize(text: str) -> str:
    """UTF-8 NFC → CRLF를 LF로 → 행말 공백 제거 → 파일 끝 개행 1개."""
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return text.rstrip("\n") + "\n"


# --- 토큰 계수기 ----------------------------------------------------------------


class TokenCounter(Protocol):
    """토큰 경계를 «문자 오프셋»으로 돌려준다 — 분할은 문자 좌표에서 일어난다."""

    name: str
    grade: str  # E1 = 실 토크나이저 · E3 = 문자 환산 추정

    def offsets(self, text: str) -> list[tuple[int, int]]: ...


@dataclass
class RatioCounter:
    """토크나이저가 없을 때의 환산 계수기 — 전임(T1-3)이 쓴 1 token ~= 1.3자.

    🔴 근거 등급 E3. 실 토크나이저가 붙으면 값이 달라진다 — 그 대조가 게이트 ① 산출물이다.
    """

    chars_per_token: float = 1.3
    name: str = "ratio-1.3"
    grade: str = "E3"

    def offsets(self, text: str) -> list[tuple[int, int]]:
        step = self.chars_per_token
        out: list[tuple[int, int]] = []
        pos = 0.0
        while pos < len(text):
            start = int(pos)
            end = min(int(pos + step), len(text))
            if end <= start:
                end = min(start + 1, len(text))
            out.append((start, end))
            pos += step
        return out


@dataclass
class HFCounter:
    """HuggingFace `tokenizers` 계수기 — offsets가 토큰과 문자의 대응을 정확히 준다."""

    tokenizer: object
    name: str
    grade: str = "E1"

    def offsets(self, text: str) -> list[tuple[int, int]]:
        enc = self.tokenizer.encode(text)
        # 특수 토큰([CLS] 등)은 (0,0)으로 나온다 — 본문 경계가 아니므로 걸러낸다.
        return [(s, e) for (s, e) in enc.offsets if e > s]


@dataclass
class TiktokenCounter:
    """tiktoken 계수기 — offset을 주지 않으므로 조각 길이를 누적해 복원한다."""

    encoding: object
    name: str
    grade: str = "E1"

    def offsets(self, text: str) -> list[tuple[int, int]]:
        ids = self.encoding.encode(text)
        out: list[tuple[int, int]] = []
        pos = 0
        for tid in ids:
            piece = self.encoding.decode([tid])
            end = pos + len(piece)
            if end > pos:
                out.append((pos, min(end, len(text))))
            pos = end
        return out


# --- 정책 ----------------------------------------------------------------------


@dataclass(frozen=True)
class ChunkPolicy:
    strategy: str  # "fixed" | "section" | "section_sentence"
    max_tokens: int
    overlap_ratio: float = 0.0

    @property
    def label(self) -> str:
        ov = f"+ov{int(self.overlap_ratio * 100)}" if self.overlap_ratio else ""
        return f"{self.strategy}/{self.max_tokens}{ov}"


@dataclass(frozen=True)
class Chunk:
    # 🔴 0-based다. `document_chunk.id`의 `#NNN` 표기가 이 값과 «동치»이며(오케 판정
    #    2026-08-29 · `#000` = 첫 chunk · 3자리 zero-pad), id와 index 사이에 변환 계층을
    #    두지 않는 것이 off-by-one을 구조적으로 막는 방법이다. 표시 편의보다 동치가 앞선다.
    index: int
    start: int  # 정규화 본문의 문자 오프셋 [start, end)
    end: int
    n_tokens: int
    section: str  # 이 chunk가 속한 최상위 절 제목(없으면 "")
    text: str


# --- 경계 후보 ------------------------------------------------------------------

H2 = re.compile(r"^## .*$", re.M)
H3 = re.compile(r"^### .*$", re.M)
# 문장 경계: 종결부호 뒤 공백, 그리고 개행(목록 항목·표 행이 개행으로 나뉜다).
SENT = re.compile(r"(?<=[.!?])[ \t]+|\n")


def _heading_starts(pattern: re.Pattern[str], text: str, lo: int, hi: int) -> list[int]:
    return [m.start() for m in pattern.finditer(text) if lo < m.start() < hi]


def _cut_points(text: str, lo: int, hi: int, level: str) -> list[int]:
    """분할 후보 지점 — 계층: h2 → h3 → 문장/줄."""
    if level == "h2":
        return _heading_starts(H2, text, lo, hi)
    if level == "h3":
        return _heading_starts(H3, text, lo, hi)
    return [m.end() for m in SENT.finditer(text) if lo < m.end() < hi]


# --- 분할 ----------------------------------------------------------------------


def _token_index(offsets: Sequence[tuple[int, int]], char_pos: int) -> int:
    """문자 위치를 포함하는(또는 그 뒤 첫) 토큰의 인덱스."""
    lo, hi = 0, len(offsets)
    while lo < hi:
        mid = (lo + hi) // 2
        if offsets[mid][1] <= char_pos:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _n_tokens(offsets: Sequence[tuple[int, int]], start: int, end: int) -> int:
    return _token_index(offsets, end) - _token_index(offsets, start)


def split_fixed(
    text: str,
    offsets: Sequence[tuple[int, int]],
    policy: ChunkPolicy,
    lo: int = 0,
    hi: int | None = None,
) -> list[tuple[int, int]]:
    """토큰 개수 고정 분할 — 경계를 보지 않는다(전임 표의 「고정」)."""
    hi = len(text) if hi is None else hi
    i0, i1 = _token_index(offsets, lo), _token_index(offsets, hi)
    step = max(1, int(policy.max_tokens * (1 - policy.overlap_ratio)))
    out: list[tuple[int, int]] = []
    i = i0
    while i < i1:
        j = min(i + policy.max_tokens, i1)
        s = max(lo, offsets[i][0])
        e = min(hi, offsets[j - 1][1])
        out.append((s, e))
        if j >= i1:
            break
        i += step
    return out


def _split_greedy(
    text: str,
    offsets: Sequence[tuple[int, int]],
    policy: ChunkPolicy,
    lo: int,
    hi: int,
    levels: tuple[str, ...],
) -> list[tuple[int, int]]:
    """경계 후보를 그리디로 채운다 — 예산을 넘기면 직전 후보에서 끊는다.

    한 조각이 예산을 넘겨도 더 잘게 쪼갤 후보가 없으면 그 조각은 «그대로 둔다»
    (문장 하나가 예산보다 길다는 뜻 — 거기서 자르면 인용이 깨진다).
    """
    if not levels:
        return split_fixed(text, offsets, policy, lo, hi)

    level, rest = levels[0], levels[1:]
    cuts = [lo] + _cut_points(text, lo, hi, level) + [hi]
    pieces = [(cuts[i], cuts[i + 1]) for i in range(len(cuts) - 1) if cuts[i] < cuts[i + 1]]

    out: list[tuple[int, int]] = []
    cur_s: int | None = None
    cur_e = lo
    for ps, pe in pieces:
        if _n_tokens(offsets, ps, pe) > policy.max_tokens:
            # 이 조각 하나가 예산을 넘는다 — 다음 계층으로 내려가 쪼갠다.
            if cur_s is not None:
                out.append((cur_s, cur_e))
                cur_s = None
            out.extend(_split_greedy(text, offsets, policy, ps, pe, rest))
            cur_e = pe
            continue
        if cur_s is None:
            cur_s, cur_e = ps, pe
        elif _n_tokens(offsets, cur_s, pe) <= policy.max_tokens:
            cur_e = pe
        else:
            out.append((cur_s, cur_e))
            cur_s, cur_e = ps, pe
    if cur_s is not None:
        out.append((cur_s, cur_e))
    return out


def _apply_overlap(
    text: str,
    offsets: Sequence[tuple[int, int]],
    spans: list[tuple[int, int]],
    policy: ChunkPolicy,
) -> list[tuple[int, int]]:
    """앞 chunk 꼬리를 overlap 비율만큼 끌어와 앞에 붙인다(chunk 개수는 불변)."""
    if not policy.overlap_ratio:
        return spans
    budget = int(policy.max_tokens * policy.overlap_ratio)
    if budget <= 0:
        return spans
    out: list[tuple[int, int]] = []
    for idx, (s, e) in enumerate(spans):
        if idx == 0:
            out.append((s, e))
            continue
        i = max(0, _token_index(offsets, s) - budget)
        out.append((min(s, offsets[i][0]), e))
    return out


def _section_of(text: str, pos: int) -> str:
    """pos가 속한 최상위(`##`) 절 제목."""
    last = ""
    for m in H2.finditer(text):
        if m.start() <= pos:
            last = m.group(0).lstrip("# ").strip()
        else:
            break
    return last


def chunk(body: str, counter: TokenCounter, policy: ChunkPolicy) -> list[Chunk]:
    """정책대로 본문을 자른다. 반환 좌표는 «정규화된» 본문 기준이다."""
    text = normalize(body)
    offsets = counter.offsets(text)
    if not offsets:
        return []

    if policy.strategy == "fixed":
        spans = split_fixed(text, offsets, policy)
    elif policy.strategy == "section":
        # 전임 정의: `##` 절을 먼저 자르고, 넘치는 절만 «고정»으로 재분할.
        spans = _split_greedy(text, offsets, policy, 0, len(text), ("h2",))
    elif policy.strategy == "section_sentence":
        # 계층 하강: `##` → `###` → 문장/줄. 문장 아래로는 내려가지 않는다.
        spans = _split_greedy(text, offsets, policy, 0, len(text), ("h2", "h3", "sent"))
    else:
        raise ValueError(f"unknown strategy: {policy.strategy}")

    spans = [(s, e) for (s, e) in spans if text[s:e].strip()]
    spans = _apply_overlap(text, offsets, spans, policy)
    return [
        Chunk(
            index=i,
            start=s,
            end=e,
            n_tokens=_n_tokens(offsets, s, e),
            section=_section_of(text, s),
            text=text[s:e],
        )
        for i, (s, e) in enumerate(spans)
    ]


CANDIDATES: tuple[ChunkPolicy, ...] = tuple(
    ChunkPolicy(strategy=st, max_tokens=sz, overlap_ratio=ov)
    for st in ("fixed", "section", "section_sentence")
    for sz in (400, 512, 600)
    for ov in (0.0, 0.15)
)

# --- 동결 (T1-4 게이트 ② · 오케스트레이터 판정 2026-08-29) -----------------------
#
# `chunking_policy_version = 1` — 실측 근거는 README「권고와 그 근거」.
# 🔴 512를 고른 결정적 이유는 분량 취향이 아니라 «모델 입력 상한»이다. 이 값은
#    e5-small(max_seq_length 512 · 실측 max chunk 483)과 bge-m3(8192) 양쪽에서 생존한다.
# 🔴 임베더가 확정되면 그 «실 토크나이저»로 max ≤ 512를 재실측해 병기한다. 초과가 나오면
#    빌드를 멈추고 보고한다 — 동결 재개정은 오케스트레이터 몫이다.
CHUNKING_POLICY_VERSION = 1
FROZEN_POLICY = ChunkPolicy(strategy="section_sentence", max_tokens=512, overlap_ratio=0.0)
