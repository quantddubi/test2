# 퀀트 연구 서재 (Quant Paper Library)

퀀트 투자 · 시스템트레이딩 · 자산배분 논문을 **전문성이 없는 사람도 이해할 수 있게**
풀어 정리한 개인 지식 라이브러리입니다. GitHub Pages로 배포되는 정적 사이트입니다.

> **저작권 안내** — 논문 PDF 원본은 이 저장소에 없습니다(프라이빗 저장소/드라이브에만 보관).
> 여기 공개되는 것은 요약·해석·비평(2차 창작)뿐입니다.

## 화면

- **📚 서가** — 주제별 책장. 카드마다 한 줄 요약·난이도(입문/중급/심화)·검증 상태. 입문부터 읽기 순서대로 정렬.
- **🕸 지식 그래프** — 논문 간 관계 지도 (토대로 발전 / 확장 / 반박·충돌 / 관련). 노드 클릭으로 노트 열람.
- **💡 연구 아이디어** — 모든 노트의 '여기서 출발할 수 있는 후속 연구' 모아보기.
- 검색 · 주제/난이도 필터 · 라이트/다크 · 반응형 · 외부 의존성 0.

## 구조

```
├── index.html, assets/          # 대시보드 (vanilla JS)
├── library/
│   ├── README.md                # 노트 작성 규격 (스키마)
│   ├── notes/*.md               # 노트 원본 — Obsidian 호환 마크다운
│   ├── index.json               # 생성물: 메타데이터 + 관계 그래프
│   └── html/<id>.html           # 생성물: 본문 렌더링
├── scripts/build_library.py     # notes → index 빌더
└── .github/workflows/build-library.yml   # notes 변경 시 자동 재빌드
```

## 새 논문 추가하기

1. PDF를 구글 드라이브 `papers/` 폴더(또는 프라이빗 저장소 `test1/papers/`)에 넣는다.
2. Claude Code 세션에서: **"papers에 새 논문 있어, 서재에 정리해줘"**
3. Claude가 읽고 규격대로 노트를 작성해 커밋 → Action이 인덱스 재생성 → 대시보드 반영.

노트 규격과 Obsidian 연동 방법은 [`library/README.md`](library/README.md) 참고.

## 로컬 미리보기

```bash
pip install pyyaml markdown
python scripts/build_library.py     # notes → index.json + html/
python3 -m http.server 8099         # → http://127.0.0.1:8099/
```
