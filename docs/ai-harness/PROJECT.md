# test2 작업 안내

공개 연구 Vault 관계망 대시보드

## 읽기 순서

- `README.md`

## 진행 기록

- 기존 진행 상태 문서를 확인하지 못했다. 새 작업은 `docs/tasks/`에서 관리한다.

## 현재 구조

`README.md`, `assets`, `data`, `index.html`, `scripts`

## 실행과 검증

`python .harness/run.py commands`에서 정확한 인자·작업 디렉터리·근거를 확인한다.

| 명령 이름 | 실행 효과 | 근거 |
| --- | --- | --- |
| `test` | test | `scripts/validate_exchange.py`, `.github/workflows/validate-exchange.yml` |

이 표는 기존 파일에서 확인한 명령 정의다. 이번 설정 작업에서는 설치·서비스·전체 앱 테스트·빌드를 실행하지 않았다. 테스트가 없는 프로젝트는 성공으로 간주하지 말고 변경에 맞는 검증을 기록한다. 이름에 test가 있는 임의 스크립트를 자동 실행하지 않는다.

## 도구 전환

`docs/ai-harness/WORKFLOW.md`를 따른다. 인계 기록은 기존 계획 문서에 연결한다. 로컬 MCP·훅·인증과 가상환경은 각 PC에서 확인한다.
