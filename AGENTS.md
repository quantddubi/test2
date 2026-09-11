# test2 — 공통 작업 지침

공개 연구 Vault 관계망 대시보드

<!-- shared-harness:v1 -->
## Claude Code · Codex 공통 하네스

- 먼저 `docs/ai-harness/PROJECT.md`와 `docs/ai-harness/WORKFLOW.md`를 읽는다.
- `PROJECT_CONTEXT.md`가 있으면 공통 설계·도메인 지침으로 읽는다.
- 하위 디렉터리를 수정하기 전에 그 범위의 `AGENTS.md`와 `PROJECT_CONTEXT.md`도 확인한다.
- 작업 시작 시 현재 Git 상태와 관련 계획/작업 기록을 확인하고 기존 변경을 보존한다.
- 기존 `.planning/`·이슈·결정 기록을 유지한다. 도구 전환 시 `docs/tasks/`에 검증·판단·다음 행동을 남긴다.
- 계획·실행·검증 절차는 양쪽 도구에서 수행한다. 특정 GSD/슬래시 명령의 설치를 필수로 하지 않는다.
- 이전 PC의 절대 경로와 과거 검증 결과는 이력이다. 현재 인터프리터·의존성·실제 코드를 확인한다.
- 명령 목록: `python .harness/run.py commands`. 하네스 검사: `python .harness/run.py check`.
- 하네스 검사 통과와 애플리케이션 테스트 통과를 구분한다. 수행하지 않은 검증은 미검증으로 적는다.
- 공통 절차는 이 섹션, 기술·도메인 제약은 기존 프로젝트 문서를 기준으로 유지한다.
<!-- /shared-harness:v1 -->
