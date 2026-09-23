# Slack Ops Bot — 슬랙 근태·업무 자동화 봇

> 팀의 반복적인 근태 확인과 진척 보고를 슬랙 봇 2종으로 자동화한다.
> 포트폴리오 겸 학습용 프로젝트이며, **기획 → 구조 설계 → 개발 → 코드 리뷰 → QA → 배포**의
> 실무 사이클을 한 바퀴 도는 것이 목적이다.

## 왜 이 프로젝트인가

도메인 로직 자체는 단순하다. 시트를 읽고, 텍스트를 요약하고, 슬랙에 보낸다.
대신 **서로 다른 외부 API(Slack, Google Sheets, Claude) 사이의 연동, 실패 처리,
스케줄링**에 공을 들인다.

> 외부 API가 하나만 얽혀도 "정상 응답"만 처리하면 절반짜리다.
> 세 개의 외부 서비스를 엮으면서 각각의 실패를 어떻게 다루는지가
> 이 프로젝트에서 설명할 수 있어야 하는 부분이다.

## 기능 범위

### A봇 — 출근 알림 봇

| 기능 | 설명 | 우선순위 |
|---|---|---|
| 시트 조회 | Google Sheets에서 그날 근무 예정 인원(부서·상태·근무시간)을 읽는다 | P0 |
| 멘션 발송 | 부서별 채널에 그날 근무자를 멘션 형태로 발송한다 | P0 |
| 정기 실행 | 매일 평일 08:50(Asia/Seoul)에 자동으로 실행된다 | P0 |
| 출근 확인 | 대상자가 멘션 메시지 스레드에 답글을 달면 리액션으로 확인 표시한다 | P0 |
| 실패 알림 | 시트 조회 실패·빈 결과·슬랙 전송 실패를 구분해 대응한다 | P1 |

### B봇 — 진척 보고 다이제스트 봇

| 기능 | 설명 | 우선순위 |
|---|---|---|
| 진척 보고 수집 | 팀원이 자유 텍스트로 작성한 진척 보고를 받는다 | P0 |
| LLM 요약 | 수집된 텍스트를 Claude API로 요약한다 | P0 |
| 다이제스트 발송 | 요약본을 매니저에게 정리된 형태로 전달한다 | P0 |
| 실패 처리 | 보고 누락 팀원 표시, LLM 호출 실패 시 원문 대체 전달 | P1 |

**두 봇 모두 P0만 끝나도 완성된 프로젝트다.**

## 기술 스택

| 영역 | 기술 |
|---|---|
| 언어/런타임 | TypeScript, Node.js |
| 슬랙 연동 | Slack Bolt SDK |
| 근태 데이터 | Google Sheets API |
| 요약 | Claude API (Anthropic SDK) |
| 스케줄링 | node-cron (Bolt 프로세스 내 실행, Socket Mode라 별도 서버 불필요) |
| 품질 | ESLint, Prettier |
| CI/CD | GitHub Actions |

세부 구조와 각 봇의 실행 방식은 [ARCHITECTURE.md](docs/ARCHITECTURE.md)에서 다룬다.
기술 선택 근거는 [DECISIONS.md](docs/DECISIONS.md) 참고 (구 도메인 ADR이 섞여 있으니
새 ADR이 추가되기 전까지는 주의해서 읽는다).

## 실행

```powershell
git clone <repo-url>
cd slack-ops-bot
Copy-Item .env.example .env   # Slack/Sheets/Claude 자격 증명 채워넣기
npm install
npm run dev
```

필요한 환경 변수(슬랙 토큰, 구글 서비스 계정, Claude API 키 등)의 구체 목록은
[ARCHITECTURE.md](docs/ARCHITECTURE.md)에서 정리한다.

## 문서

진행 순서대로 읽으면 된다.

| 단계 | 문서 | 내용 |
|---|---|---|
| 0 | [ROADMAP.md](docs/ROADMAP.md) | 일정과 일별 목표 |
| 1 | [PLANNING.md](docs/PLANNING.md) | 요구사항 정의, 유저 스토리, 인수 조건 |
| 2 | [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 구조, 데이터 흐름, API 설계 |
| 3 | [CONTRIBUTING.md](CONTRIBUTING.md) | 브랜치·커밋·PR·코드 리뷰 규칙 |
| 4 | [QA.md](docs/QA.md) | 테스트 전략과 체크리스트 |
| 5 | [DEPLOY.md](docs/DEPLOY.md) | CI/CD, 배포, 알림 |
| — | [TEAM.md](docs/TEAM.md) | 혼자서 팀 프로세스 굴리는 법 |
| — | [DECISIONS.md](docs/DECISIONS.md) | 기술 선택 기록 (면접 대비) |

> 이 프로젝트엔 웹 화면이 없다. [UIUX.md](docs/UIUX.md)는 "화면 UX" 대신
> "봇 메시지·대화 UX" 원칙을 다룬다.

## 일정

국내 이력서 마감(1주 이내)에는 이 프로젝트를 맞추지 않는다.
해외 지원 마감(이번 달 말)을 기준으로 MVP(P0)까지 완성하는 걸 목표로 한다.
자세한 일정은 [ROADMAP.md](docs/ROADMAP.md) 참고.
