# test2 — 글로벌 금리·크레딧·환율 대시보드 (PUBLIC)

한국·미국·일본·유로·호주의 **금리 · 크레딧 · 환율 · 환헤지 · 변동성** 지표를
한눈에 보는 정적 대시보드입니다. GitHub Pages 로 배포됩니다.

> **이 저장소는 '결과값'만 담습니다.** 각 지표의 최신값·기간 변화·52주 통계 등
> 요약 결과(`data/summary.json`)만 포함하며, **데이터 밴더의 원본 일별 시계열은
> 포함하지 않습니다.** 원본은 비공개 저장소
> [`test1`](https://github.com/quantddubi/test1) 에만 보관됩니다.

## 구성

```
test2/
├── index.html            # 대시보드 페이지
├── assets/
│   ├── styles.css        # 스타일 (라이트/다크, 외부 리소스 없음)
│   └── app.js            # 렌더링 로직 (vanilla JS)
├── data/
│   └── summary.json      # ← test1의 GitHub Actions가 자동 갱신 (결과값만)
└── .nojekyll
```

## 기능

- **헤드라인 KPI 타일** — 주요 지표(USDKRW, 국고 10y, UST10y, 기준금리, VIX/VKOSPI 등) 스냅샷 + 변화 + 52주 위치
- **파생 분석** — 국채 커브(2s10s·5s30s 등), 크레딧 스프레드(회사채−국고), 실질금리(명목−BEI)
- **전체 지표 테이블** — 카테고리별, `1D·1W·1M·3M·6M·YTD·1Y` 변화 히트맵, 52주 위치 미터
- 검색 · 카테고리 필터 · 정렬 · 기준기간 선택
- 라이트/다크 테마, 반응형, 접근성(색상 단독 의존 없음: ▲/▼·부호 병기)
- 변화 색상은 **한국 시장 관례(상승=빨강, 하락=파랑)**

## GitHub Pages 배포

**Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: **`main`** / **`/ (root)`** → Save

잠시 후 `https://quantddubi.github.io/test2/` 에서 확인할 수 있습니다.
(`.nojekyll` 이 있어 `assets/` 가 그대로 서빙됩니다.)

## 데이터 갱신 방식

`data/summary.json` 은 **직접 편집하지 않습니다.** 비공개 저장소 `test1` 의
GitHub Actions 가 원본 엑셀에서 결과값을 산출해 이 파일만 커밋/푸시합니다.
설정 방법은 test1 README 를 참고하세요.

## 로컬 미리보기

```bash
python3 -m http.server 8099
# → http://127.0.0.1:8099/
```

(파일을 직접 열면 브라우저 보안정책으로 `summary.json` 로드가 막히므로 위처럼 서버로 여세요.)
