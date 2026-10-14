---
asset_class: decision
description: braces(GHSA-vfj7-8cjw-p6xm) audit 예외 근거 — 남기되 감시한다(만료 2026-11-13)
owner: orchestrator
status: active
effective_date: 2026-10-14
lifecycle: 만료일(2026-11-13) 또는 dependency-watch 신호 시 재판정 · 예외 정본 = `.github/audit-exceptions.json`
---

# D-006 — braces audit 예외 (S69-5)

> 결정 = 폐하 DM `1559771292234678324`(2026-10-14 12:34 「권장안 승인」) · 청구 = 스자쿠 `1559770411250745516` 「가」
> 경과 = S69-3(PR #1025)에서 web-console audit 치명 3 · 높음 11을 정리했고, 수정판이 없는 1건이 남았다.

## 결정
`braces` GHSA-vfj7-8cjw-p6xm(high · 「깊게 중첩된 패턴으로 stack 고갈 DoS」)을 **남긴다. 대신 감시를 붙인다.**

| 장치 | 자리 | 동작 |
|---|---|---|
| 예외 목록 | `.github/audit-exceptions.json` | (id, package, **severity**, 만료일, 근거 문서) 단위로 기록 |
| 게이트 | `security.yml` dependency audit · `.github/scripts/pnpm_audit_gate.py` | 예외 id만 뺀다 · 다른 high/critical은 FAIL · **만료가 지나면 FAIL** · **audit 결과에서 사라진 예외도 FAIL**(「예외 정리하라」) · **현재 심각도가 기록보다 높아지면 FAIL**(격상 = 재판정 · L3) · **권고 단위 계수(게이트+예외) ≠ metadata high+critical이면 FAIL**(옛 게이트보다 약해지지 않게 · L4) |
| 주간 감시 | `dependency-watch.yml`(월 09:00 KST) · `.github/scripts/audit_exception_watch.py` | 권고에 수정판이 생기거나 상위 고정이 풀리면 FAIL(신호) · 조회에 실패해도 FAIL |

- `check_patch`는 권고의 **어느 버전 계열이든** `first_patched_version`이 생기면 신호를 낸다. 우리가 쓰는 계열(3.x)과 무관한 계열의 수정판에도 울린다. 보수 방향이라 그대로 둔다(울리면 계열을 확인하고 재판정한다 · 스자쿠 10-14 판정).
| 만료 | **2026-11-13** | 그 전에 재판정한다(연장 = 이 문서 갱신 + 결정 id) |

## 사슬 (E1 · 2026-10-14 · develop `26fcf32`)
```
web-console (devDependencies)
└─ eslint-config-next@16.3.8
   └─ @next/eslint-plugin-next@16.3.8
      └─ fast-glob@3.3.1        ← 상위가 정확한 버전으로 고정한다
         └─ micromatch@4.0.8    ← braces ^3.0.3
            └─ braces@3.0.3     ← 최신판 · 권고 범위 <=3.0.3 · 수정판 없음
```
`pnpm why braces` 결과는 위 1줄뿐이다.

## 도달성 — 이 앱에서 이 코드가 도는가 (E1)
| 질문 | 측정 | 값 |
|---|---|---|
| 운영 의존에 있는가 | `pnpm why braces --prod` | **빈 출력**(0줄) — dev 의존 전용이다 |
| 빌드 산출물에 들어가는가 | `next build` 뒤 `.next/**/*.nft.json`(서버 추적 파일 17개)에서 `braces`·`micromatch`·`fast-glob` 검색 · `.next` 전체에서 `node_modules/braces` 검색 | **0 · 0 · 0** (대조: 같은 nft에서 `node_modules/next` = 16/17) |
| lint 때 호출되는가 | 플러그인에서 fast-glob을 쓰는 곳은 `dist/utils/get-root-dirs.js` 하나(규칙 `no-html-link-for-pages`)다. `settings.next.rootDir`가 있을 때만 `globSync`를 부른다 | `eslint.config.mjs`의 `settings` = **0건** → 호출되지 않는다 |

⇒ 남은 노출은 「누군가 eslint 설정에 `settings.next.rootDir`로 악의적 중첩 패턴을 넣는 경우」다. 그 입력은 리포 커밋으로만 들어온다.

## 시도한 대체와 기각 사유
| # | 시도 | 결과 | 판정 |
|---|---|---|---|
| 1 | 상위 갱신 | `@next/eslint-plugin-next` latest 16.4.0과 canary 모두 `fast-glob: 3.3.1` 고정 · fast-glob 최신 3.3.3 → micromatch ^4.0.8 · micromatch 최신 4.0.8 → braces ^3.0.3 · braces 최신 3.0.3 | 경로 없음 |
| 2 | `pnpm.overrides` `@next/eslint-plugin-next>fast-glob` → `npm:tinyglobby@^0.2.17` | audit 0 · braces 0. 그러나 플러그인의 실제 `getRootDirs`로 패턴 5개를 대조하니 **의미가 달라졌다**: `["apps/web-console","services/*/"]` 5개 → 857개, `apps/{web-console,nope}` 1개 → 852개(디렉터리 재귀 확장) · 결과 끝에 `/`가 붙음 | 기각(조용한 동작 변경) · 되돌림 |
| 3 | 리포 안 shim(tinyglobby + `expandDirectories:false` + 끝 `/` 제거) | 같은 5개 패턴에서 fast-glob과 출력 일치(5/5) | 보류 — 표본이 작고 자체 코드 유지 비용이 든다. 호출되지 않는 경로에 들이는 비용이 더 크다 |
| 4 | Next 플러그인 제거 | `@next/next/*` 규칙을 잃는다(실측: `<img>` → `no-img-element` 경고가 이 플러그인에서 나온다) | 기각 |

## 재판정 조건
- `dependency-watch` FAIL(수정판이 나오거나 상위 고정이 풀림) → 예외를 걷고 갱신한다.
- 2026-11-13 만료 → 게이트 FAIL → 재판정한다(남김 연장이면 이 문서에 결정 id를 append).
- audit 결과에서 braces가 사라짐(상위가 사슬을 끊음) → 게이트가 「예외 정리하라」로 FAIL → 목록에서 항목을 지운다.
