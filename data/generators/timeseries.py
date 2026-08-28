"""센서 시계열 생성 — 2단 해상도 + 알람 스파이크 주입.

정본: data-ontology-spec.md §5(ⓐ 기저 1분×21일 / ⓑ 사건 1초×4시간) ·
      golden-scenario-spec.md §2(SN-204-VIB = 3주 완만 상승 + 최근 24h 급등)

🔴 PK(sensor_id, ts) 충돌 회피: 사건 구간(마지막 4시간)에 1초 데이터를 넣는 3개 센서는
   같은 구간의 1분 데이터를 «생성하지 않는다». T0-6 §5의 907,200 + 43,200 = 950,400은
   이 중복(3센서 × 240분 = 720)을 빼지 않은 추정치다 — 실측치는 949,680이 된다.

🔴 난수는 센서별 독립 Random(seed ⊕ crc32(sensor_id))에서 뽑는다.
   문자열 hash()는 PYTHONHASHSEED에 따라 실행마다 달라져 멱등을 깬다 — crc32를 쓴다.

🔴 알람 관측값은 «지어내지 않는다». 스트리밍 중 알람 발생 격자점의 값을 그대로 캡처해
   events.py가 observed_value로 쓴다. 그래야 「알람 관측값 = 그 시각 계측값」이 성립한다.
"""

from __future__ import annotations

import math
import random
import zlib
from datetime import datetime, timedelta

from .config import (BASE_INTERVAL_SEC, EVENT_INTERVAL_SEC, EVENT_START, GS,
                     RANDOM_SEED, REFERENCE_NOW, SURGE_HOURS, WINDOW_START)

# 측정 종류별 정상 기준값 (base, 일주기 진폭, 노이즈 σ)
NORMAL_PROFILE = {
    ("CNC", "VIB"): (2.20, 0.16, 0.055),
    ("CNC", "TEMP"): (42.0, 2.4, 0.55),
    ("CNC", "CUR"): (12.4, 0.9, 0.22),
    ("CONVEYOR", "SPD"): (24.0, 0.7, 0.20),
    ("CONVEYOR", "CUR"): (9.6, 0.6, 0.18),
    ("CONVEYOR", "TEMP"): (36.0, 2.0, 0.45),
    ("ROBOT", "VIB"): (1.80, 0.12, 0.045),
    ("ROBOT", "CUR"): (6.40, 0.5, 0.15),
    ("PRESS", "VIB"): (3.10, 0.22, 0.070),
    ("PRESS", "TEMP"): (48.0, 3.0, 0.60),
}

# --- GS-01 이상 파형 파라미터 ----------------------------------------------------
# 3주 완만 상승분 + 최근 24h 급등분. 급등 지수를 3.4로 두면 경보 임계(6.3) 최초 초과가
# 사건 구간(1초 해상도 · 마지막 4시간)의 «중반»에 떨어진다. 3.0이면 구간 시작 1초 만에 넘어
# 급등 과정이 화면에 남지 않는다(실측 후 조정 — S1 회귀 화면에 상승 구간이 보여야 한다).
GS_VIB_TREND = 1.45
GS_TREND_EXP = 1.6
GS_VIB_SURGE = 4.30
GS_SURGE_EXP = 3.4
# 온도 «동반 상승(약)» — GS §2. 경보 임계(65)에는 닿지 않아야 한다(알람은 진동 1건뿐).
GS_TEMP_TREND = 3.2
GS_TEMP_SURGE = 4.2
GS_CUR_TREND = 0.5
GS_CUR_SURGE = 0.9

WINDOW_SECONDS = (REFERENCE_NOW - WINDOW_START).total_seconds()
EVENT_SENSOR_IDS = (GS["sensor_vib"], GS["sensor_temp"], GS["sensor_cur"])


class _NoNoise:
    """추세만 보고 싶을 때 쓰는 난수 대역(플롯 전용)."""

    @staticmethod
    def gauss(_mu, _sigma):
        return 0.0

    @staticmethod
    def random():
        return 1.0


def _rng_for(sensor_id: str) -> random.Random:
    return random.Random(RANDOM_SEED ^ zlib.crc32(sensor_id.encode("utf-8")))


def _diurnal(ts: datetime, amp: float) -> float:
    sod = ts.hour * 3600 + ts.minute * 60 + ts.second
    # 주간 교대에 부하가 몰리는 형태 — 08시 부근을 위상 기준으로 둔다
    return amp * math.sin(2 * math.pi * (sod - 8 * 3600) / 86400.0)


def _surge_fraction(ts: datetime) -> float:
    hours_left = (REFERENCE_NOW - ts).total_seconds() / 3600.0
    if hours_left >= SURGE_HOURS:
        return 0.0
    return (SURGE_HOURS - hours_left) / SURGE_HOURS


def _progress(ts: datetime) -> float:
    return max(0.0, min(1.0, (ts - WINDOW_START).total_seconds() / WINDOW_SECONDS))


def value_at(sensor, eq_class, ts, rng, spikes=()):
    meas = sensor["measurement_type"]
    base, amp, sigma = NORMAL_PROFILE[(eq_class, meas)]
    v = base + _diurnal(ts, amp) + rng.gauss(0.0, sigma)

    sid = sensor["id"]
    if sid == GS["sensor_vib"]:
        v += GS_VIB_TREND * _progress(ts) ** GS_TREND_EXP
        v += GS_VIB_SURGE * _surge_fraction(ts) ** GS_SURGE_EXP
    elif sid == GS["sensor_temp"]:
        v += GS_TEMP_TREND * _progress(ts) ** GS_TREND_EXP
        v += GS_TEMP_SURGE * _surge_fraction(ts) ** GS_SURGE_EXP
    elif sid == GS["sensor_cur"]:
        v += GS_CUR_TREND * _progress(ts)
        v += GS_CUR_SURGE * _surge_fraction(ts) ** GS_SURGE_EXP
    else:
        # 정상 설비도 완전히 평평하면 부자연스럽다 — 아주 약한 드리프트만 준다
        v += base * 0.012 * _progress(ts)

    # 알람 스파이크: 중심(=알람 raised_at)에서 계획 피크에 정확히 닿고 좌우로 감쇠한다
    for center, half_width, peak in spikes:
        dt = abs((ts - center).total_seconds())
        if dt <= half_width:
            v += (peak - v) * math.exp(-((dt / (half_width * 0.45)) ** 2))
    return v


def iter_readings(sensors, eq_class_by_id, spikes_by_sensor=None,
                  capture_points=None, out=None):
    """(sensor_id, ts, value, quality) 스트리밍. 95만 row를 메모리에 올리지 않는다.

    capture_points: {(sensor_id, ts)} — 이 격자점의 값을 out["captured"]에 담아 돌려준다.
    out:            호출자가 준 dict. 소진 후 out["captured"] · out["gs_breach"]를 읽는다.
                    gs_breach = GS 진동이 경보 임계를 «처음» 넘은 (ts, value) — 알람 발생 시각의 근거.
    """
    spikes_by_sensor = spikes_by_sensor or {}
    capture_points = capture_points or frozenset()
    sink = out if out is not None else {}
    captured = sink.setdefault("captured", {})
    sink.setdefault("gs_breach", None)
    gs_threshold = None

    def emit(sid, ts, v, q):
        rounded = round(v, 4)
        if (sid, ts) in capture_points:
            captured[(sid, ts)] = rounded
        return (sid, ts, rounded, q)

    for s in sensors:
        sid = s["id"]
        eq_class = eq_class_by_id[s["equipment_id"]]
        rng = _rng_for(sid)
        spikes = spikes_by_sensor.get(sid, ())
        in_event = sid in EVENT_SENSOR_IDS

        if sid == GS["sensor_vib"]:
            gs_threshold = float(s["alarm_threshold"])

        n_base = int(WINDOW_SECONDS // BASE_INTERVAL_SEC)
        for k in range(n_base):
            ts = WINDOW_START + timedelta(seconds=k * BASE_INTERVAL_SEC)
            if in_event and ts >= EVENT_START:
                continue          # 🔴 사건 구간은 1초 해상도가 대신한다(PK 중복 방지)
            v = value_at(s, eq_class, ts, rng, spikes)
            row = emit(sid, ts, v, "good" if rng.random() > 0.0008 else "suspect")
            if gs_threshold is not None and sink["gs_breach"] is None and row[2] >= gs_threshold:
                sink["gs_breach"] = (ts, row[2])
            yield row

        if in_event:
            n_event = int((REFERENCE_NOW - EVENT_START).total_seconds() // EVENT_INTERVAL_SEC)
            for k in range(n_event):
                ts = EVENT_START + timedelta(seconds=k * EVENT_INTERVAL_SEC)
                v = value_at(s, eq_class, ts, rng, spikes)
                row = emit(sid, ts, v, "good" if rng.random() > 0.0008 else "suspect")
                if gs_threshold is not None and sink["gs_breach"] is None and row[2] >= gs_threshold:
                    sink["gs_breach"] = (ts, row[2])
                yield row

        if sid == GS["sensor_vib"]:
            gs_threshold = None


def trend_curve(sensor, eq_class, buckets=90):
    """육안 확인용 추세선 — 노이즈를 뺀 결정 성분만 뽑는다."""
    step = WINDOW_SECONDS / buckets
    out = []
    for i in range(buckets):
        ts = WINDOW_START + timedelta(seconds=step * (i + 0.5))
        out.append((ts, value_at(sensor, eq_class, ts, _NoNoise)))
    return out


def ascii_plot(points, threshold=None, warn=None, height=16, label=""):
    """의존성 없이 파형을 한 커트로 본다 — AC 「진동 파형 육안 확인용 1커트」."""
    values = [v for _ts, v in points]
    lo, hi = min(values), max(values)
    if threshold is not None:
        hi = max(hi, threshold)
    span = (hi - lo) or 1.0
    rows = []
    for r in range(height, 0, -1):
        level = lo + span * (r - 0.5) / height
        line = []
        for v in values:
            line.append("█" if v >= level else " ")
        marker = ""
        if threshold is not None and abs(level - threshold) <= span / (2 * height):
            marker = "  <- alarm"
            line = ["-" if c == " " else c for c in line]
        elif warn is not None and abs(level - warn) <= span / (2 * height):
            marker = "  <- warn"
            line = ["." if c == " " else c for c in line]
        rows.append(f"{level:7.2f} |{''.join(line)}|{marker}")
    head = f"{label}  ({points[0][0]:%m-%d %H:%M} ~ {points[-1][0]:%m-%d %H:%M})"
    return "\n".join([head, *rows,
                      " " * 8 + "+" + "-" * len(values) + "+"])


__all__ = ["iter_readings", "trend_curve", "ascii_plot", "value_at", "EVENT_SENSOR_IDS"]
