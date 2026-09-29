# Slack Ops Bot — 슬랙 근태·업무 자동화 봇

**한국어** | [日本語](README.ja.md)

> 팀의 반복적인 근태 확인과 진척 보고를 슬랙 봇 2종으로 자동화한다.
> **기획 → 구조 설계 → 개발 → 코드 리뷰 → QA → 배포**의 실무 사이클을
> 문서와 함께 굴리는 것을 목표로 한 개인 프로젝트다.

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

## 현재 진행 상황

개발 중인 프로젝트다. 지금까지 실제로 동작하는 범위는 아래와 같다.

| 상태 | 항목 |
|---|---|
| ✅ | 기획·구조 설계 문서 (요구사항, 아키텍처, ADR, QA 전략) |
| ✅ | Slack 앱 구성 (Socket Mode, 매니페스트를 저장소에 코드로 관리) |
| ✅ | Bolt 앱 기동 + 환경 변수 검증(fail fast) + `/report` 커맨드 응답 |
| 🚧 | A봇 — Google Sheets 연동, 근무 대상자 필터링, 멘션 발송, 스케줄링 |
| 🚧 | B봇 — 보고 수집 모달, Claude 요약, 실패 시 원문 폴백 |
| 🚧 | 테스트, CI, 배포 |

기능 목록을 "예정"이 아니라 **실제 동작 여부로** 구분해 적는다.

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
기술 선택 근거는 [DECISIONS.md](docs/DECISIONS.md)에 ADR로 기록한다.

### 설계상의 판단 예

- **Socket Mode 채택** — 공개 URL 없이 Slack과 통신할 수 있어, 로컬 개발과 배포 후가
  같은 구성으로 동작한다.
- **DB를 두지 않는다** — Google Sheets를 유일한 source of truth로 삼는다.
  입력 UI 역할까지 겸하고 있어, 이 규모에서 저장소를 하나 더 두는 이점이 작다.
- **요약에 실패해도 보고는 반드시 전달한다** — Claude API가 타임아웃이나 레이트리밋으로
  실패하면 정리된 원문을 그대로 보낸다. 자동화 때문에 정보가 사라져서는 안 된다는 방침이다.
- **기동 시점에 환경 변수를 검증하고 즉시 종료한다(fail fast)** — 실제 API 호출 시점에
  `undefined`가 드러나면 원인 추적이 훨씬 어려워진다.

## 실행

```powershell
git clone https://github.com/Nu-gu-nya/slack-ops-bot.git
cd slack-ops-bot
npm install
Copy-Item .env.example .env   # 발급받은 토큰을 채워넣는다
npm run dev
```

`⚡ Ops Bot 실행 중 (Socket Mode)`이 출력되면 봇이 초대된 채널에서 `/report`로 확인할 수 있다.

Slack 앱은 [`slack-app-manifest.yml`](slack-app-manifest.yml)을 https://api.slack.com/apps 의
**Create New App → From a manifest**에 붙여넣어 생성한다. 필요한 스코프와 이벤트 구독이
파일에 그대로 들어 있다.

| 명령어 | 용도 |
|---|---|
| `npm run dev` | 개발 실행 (`.env`를 읽어 Socket Mode로 접속) |
| `npm run typecheck` | 타입 검사 |
| `npm run build && npm start` | 프로덕션 빌드 후 실행 |

환경 변수는 `.env.example` 참고. 각 값의 의미는
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
| — | [DECISIONS.md](docs/DECISIONS.md) | 기술 선택 기록 (ADR) |

> 이 프로젝트엔 웹 화면이 없다. [UIUX.md](docs/UIUX.md)는 "화면 UX" 대신
> "봇 메시지·대화 UX" 원칙을 다룬다.

## 문서 언어

README는 한국어와 일본어로 제공한다.
코드·커밋 메시지·PR은 영어로 쓰고, `docs/`의 설계 문서는 한국어로 쓴다.
협업 기록은 어디서나 읽히는 언어로, 설계 문서는 계속 고칠 사람이 가장 정확하게 쓸 수 있는 언어로 둔다.

## 일정

MVP(P0) 완성을 목표로 진행 중이다. 일별 목표와 범위 조정 기준은
[ROADMAP.md](docs/ROADMAP.md)에 정리되어 있다.
