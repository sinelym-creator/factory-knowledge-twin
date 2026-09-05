# -*- coding: utf-8 -*-
# T5-1 (1)-D 재검 그물 — 교정 게이트(심은 빨강)를 전수 «앞»에 둔다.
import json, re, sys, copy

GT = 'benchmarks/datasets/ground-truth.v0.3.jsonl'
QS = 'benchmarks/datasets/questions.v0.3.jsonl'

def load(p):
    raw = open(p, 'rb').read().decode('utf-8')
    lines = raw.split('\r\n')
    assert lines[-1] == '', 'trailing CRLF missing: ' + repr(lines[-1])
    return [json.loads(x) for x in lines[:-1]]

def check(gt, qs):
    """빨강 사유 목록을 돌려준다. 빈 목록 = 초록."""
    red = []
    if len(gt) != 40: red.append('gt rows != 40 (%d)' % len(gt))
    if len(qs) != 40: red.append('qs rows != 40 (%d)' % len(qs))
    # 1) binding 확정 — pending 잔존 0
    pend = [o['id'] for o in gt if 'pending' in str(o.get('binding', ''))]
    if pend: red.append('binding pending 잔존: ' + ','.join(pend))
    miss = [o['id'] for o in gt if not o.get('binding')]
    if miss: red.append('binding 누락: ' + ','.join(miss))
    # 2) id 양방향 일치
    a, b = [o['id'] for o in gt], [o['id'] for o in qs]
    if set(a) - set(b): red.append('gt->qs 미매칭: ' + ','.join(sorted(set(a) - set(b))))
    if set(b) - set(a): red.append('qs->gt 미매칭: ' + ','.join(sorted(set(b) - set(a))))
    if len(set(a)) != len(a): red.append('gt id 중복')
    if len(set(b)) != len(b): red.append('qs id 중복')
    # 3) verdict <-> expected_answer_form 정합
    qf = {o['id']: o.get('expected_answer_form') for o in qs}
    for o in gt:
        if qf.get(o['id']) and o.get('verdict') != qf[o['id']]:
            red.append('verdict 불일치 %s: gt=%s qs=%s' % (o['id'], o.get('verdict'), qf[o['id']]))
    # 4) 빈 집합과의 비교 금지 — 기대가 통째로 빈 문항 0
    for o in gt:
        if not (o.get('must_include') or o.get('required_evidence') or
                o.get('required_safety_rules') or o.get('must_not_invent')):
            red.append('기대값 전부 빈 문항: ' + o['id'])
    # 5) answer_with_safety 인데 required_safety_rules 가 비면 지표 6 이 못 센다
    for o in gt:
        if o.get('verdict') == 'answer_with_safety' and not o.get('required_safety_rules'):
            red.append('safety verdict 인데 required_safety_rules 0: ' + o['id'])
    return red

gt, qs = load(GT), load(QS)

# ---- 교정 게이트: 심은 빨강 4갈래가 «같은 실행»에서 서야 한다 ----
gate = []
for name, mut in [
    ('pending 잔존', lambda g, q: g[0].__setitem__('binding', 'pending')),
    ('id 양방향 깨짐', lambda g, q: g[1].__setitem__('id', 'Q-NOT-REAL-999')),
    ('verdict 불일치', lambda g, q: g[2].__setitem__('verdict', '__bogus__')),
    ('기대값 전부 빔', lambda g, q: [g[3].__setitem__(k, []) for k in
        ('must_include', 'required_evidence', 'required_safety_rules', 'must_not_invent')]),
]:
    g2, q2 = copy.deepcopy(gt), copy.deepcopy(qs)
    mut(g2, q2)
    gate.append((name, len(check(g2, q2)) > len(check(gt, qs))))

print('== 교정 게이트(심은 빨강) ==')
for n, ok in gate:
    print('  %-16s -> %s' % (n, 'RED 검출 O' if ok else 'RED 미검출 X'))
if not all(ok for _, ok in gate):
    print('GATE FAIL — 그물이 심은 빨강을 못 잡는다. 전수 거부.')
    sys.exit(2)

# ---- 전수 ----
red = check(gt, qs)
print('== 전수 판정 ==')
print('  rows gt/qs      : %d / %d' % (len(gt), len(qs)))
print('  binding pending : %d' % len([o for o in gt if 'pending' in str(o.get('binding', ''))]))
bind = {}
for o in gt:
    bind[o['binding']] = bind.get(o['binding'], 0) + 1
print('  binding 분포    : %s' % json.dumps(bind, ensure_ascii=False))
print('  JSON 유효       : %d/40 (파싱 성공 행)' % len(gt))
print('  id 양방향       : %s' % ('일치 40/40' if set(o['id'] for o in gt) == set(o['id'] for o in qs) else '불일치'))
print('  빨강            : %d' % len(red))
for r in red:
    print('   - ' + r)
sys.exit(1 if red else 0)
