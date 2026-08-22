# 연구 Vault 관계망 (Research Vault Network)

주제별 연구 지식 Vault들 **사이의 관계**를 물리엔진으로 탐색하는 공개 대시보드입니다.
GitHub Pages로 배포되는 정적 사이트이며, 외부 의존성이 없습니다.

> **여기에 지식 본문은 없습니다.** 논문 PDF와 정독 노트(본문·수식·연구 아이디어)는 전부
> 프라이빗 저장소 [`test1`](https://github.com/quantddubi/test1)의 주제별 vault에만 있습니다.
> 이 저장소가 받는 것은 vault들이 내보낸 **최소 컨텍스트** — 출처·권한·키워드·관계 엣지 —
> 하나(`data/exchange.json`)뿐입니다.

## 화면

- **🕸 관계망** — Vault를 노드로, vault 쌍의 연결강도를 **스프링 장력**으로 옮긴 물리 그래프.
  - 장력(strength)이 셀수록 두 vault가 짧고 굵게 당겨집니다.
  - **충돌**(반박 관계 포함)은 빨간 점선과 ⚡ 배지로 표시됩니다 — 충돌도 연결이므로 밀어내지 않습니다.
  - **공백**은 키워드가 겹치는데 아직 잇는 연구가 없는 쌍 — 옅은 점선, 물리력 없음 (범례에서 토글).
  - 링크에 마우스를 올리면 장력 패널(관계 타입별 개수·공유 키워드)이 뜹니다.
  - Vault 클릭 → **드릴다운**: 그 vault의 노트들과 이웃 vault로 뻗는 관계(토대로 발전/확장/충돌/관련/언급).
  - 노트 클릭 → **최소 컨텍스트 카드**: 서지정보·키워드·검증상태·출처(PDF 경로, 프라이빗 노트 링크).
  - **임계치 게이트**: vault·노트가 기준(관계망이 의미를 갖는 최소 축적량) 미만이면 관계망 대신
    진행 바("축적 중")를 보여줍니다.
- **📚 서가** — Vault 카드 목록(설명·키워드·공개 범위·노트 메타데이터).

> ⚖️ **이 그래프의 장력은 지식의 진위를 판단하지 않습니다 — 연결·보완·충돌·공백을
> 탐색하기 위한 시각화입니다.** 대시보드 하단에도 항상 표시됩니다.

## Vault 독립성과 공개 범위

각 vault는 독립적이며, 자신이 내보낼 범위를 `permission`으로 선언합니다
(계약: test1의 `EXCHANGE_SPEC.md`).

| permission | 관계망에 보이는 것 |
|---|---|
| `none` | 🔒 봉인 노드 — 존재와 노트 수만 |
| `keywords` | + 키워드 (노트 목록·엣지 없음) |
| `metadata` | + 노트 서지정보·관계 엣지 |
| `summary` | + 한줄요약 |

어떤 단계에서도 노트 본문·연구 아이디어는 오지 않으며, CI(`validate-exchange`)가
스키마 위반과 본문류 유출을 검사합니다.

## 구조와 데이터 흐름

```
test1 (PRIVATE)  vaults/<주제>/notes/*.md  ← 논문 정독 노트 (본문은 여기만)
      │  build-exchange CI: 최소 컨텍스트 추출 (scripts/build_exchange.py)
      ▼
test2 (PUBLIC)   data/exchange.json        ← 이 저장소로 배달되는 유일한 데이터
      │
      ▼
index.html + assets/app.js                 ← 물리엔진 관계망 (vanilla JS, canvas)
scripts/validate_exchange.py               ← 계약 검증 + 유출 카나리아 (CI)
```

새 논문을 추가하는 곳은 **test1**입니다 (PDF → 정독 노트 → 자동 재빌드·배달).
이 저장소에는 직접 쓸 일이 없습니다 — `data/exchange.json`은 CI가 갱신합니다.

## 로컬 미리보기

```bash
python3 -m http.server 8099      # → http://127.0.0.1:8099/
python3 scripts/validate_exchange.py   # 교환 데이터 검증
```
