# 인수인계 (HANDOVER)

> **이 문서의 목적**: 대화 기록이 전부 지워진 상태에서 Claude Code가 이 파일 하나만 읽고도
> 곧바로 이어서 작업할 수 있게 하는 것. 토큰 절약을 위해 대화를 주기적으로 비우기 때문이다.
>
> **작업을 재개할 때는 이 문서를 먼저 읽고, 마지막의 "다음에 할 일"부터 시작한다.**
> 작업이 끝날 때마다 "현재 상태"와 "다음에 할 일"을 갱신한다. 갱신하지 않으면 이 문서는 거짓말이 된다.

최종 갱신: 2026-09-27

---

## 1. 이 프로젝트는 무엇인가

슬랙 근태·업무 자동화 봇 2종.

- **A봇(출근 알림)**: Google Sheets에서 그날 근무 예정자를 읽어 부서 채널에 멘션하고,
  본인이 스레드에 답글을 달면 ✅ 리액션으로 확인 처리한다.
- **B봇(업무 보고 다이제스트)**: `/report`로 받은 업무 보고를 Claude API로 요약해 매니저에게 전달한다.
  **요약에 실패해도 원문은 반드시 전달한다.**

웹 화면은 없다. **Slack이 곧 UI다.**

### 왜 만드는가

포트폴리오 겸 학습용이다. 목적은 "동작하는 앱"이 아니라 **기획 → 구조 설계 → 개발 → 코드리뷰
→ QA → 배포의 실무 사이클을 한 바퀴 도는 것**이고, 그 과정에서 내린 판단을 면접에서 설명할 수 있는 것이다.

도메인 로직 자체는 단순하다(시트 읽기, 텍스트 요약, 슬랙 전송). 대신 **서로 다른 외부 API 3개
(Slack / Google Sheets / Claude)를 엮으면서 각각의 실패를 어떻게 다루는지**가 이 프로젝트의 핵심이다.

---

## 2. 사용자에 대해 (작업 방식의 전제)

**상세 지침은 `CLAUDE.md`의 "나에 대해" 절에 있다. 반드시 그쪽을 읽는다.** 요약하면:

- TypeScript·웹 개발 입문 단계. 파이썬과 **자바(람다·제네릭 등)** 경험이 있어 비교 설명이 잘 통한다.
- 목표는 **"내가 전부 설명할 수 있는 앱"**이다. 코드를 통째로 던지면 목적을 해친다.
- 한 번에 한 파일씩, **코드보다 개념 설명을 먼저**, 작성 후에는 왜 그렇게 짰는지 한두 문장.
- 확인 질문을 던지고, 답을 못 하면 다시 설명한다. 막히면 정답보다 **힌트 먼저**.
- 진도가 느리거나 방향이 틀렸으면 **솔직하게 말한다.**

### 실제로 겪은 것 (같은 실수를 반복하지 않기 위해)

- 화살표 함수·콜백·Promise가 한꺼번에 나오면 코드가 안 읽힌다. **개념 → 직접 실행 → 코드** 순서가 효과가 있었다.
- 터미널 명령과 설명 문장을 섞어 쓰면 **설명까지 통째로 터미널에 붙여넣는다.**
  → **코드 블록에는 실행할 명령만 넣고, 설명은 블록 밖에 쓴다.**
- YAML처럼 들여쓰기가 중요한 내용은 터미널 출력으로 주지 말고 **파일로 만들어서 전달한다.**
- 웹 UI 작업(Google Cloud 콘솔 등)은 화면에 보이는 항목 이름을 그대로 짚어가며 단계별로 안내한다.

---

## 3. 현재 상태 (무엇이 실제로 동작하는가)

| 상태 | 항목 |
|---|---|
| ✅ | 기획·설계 문서 일체 (`docs/`) |
| ✅ | Slack 워크스페이스·앱 생성, 봇을 테스트 채널에 초대 |
| ✅ | `src/config/env.ts` — 기동 시 환경 변수 검증, 없으면 즉시 종료(fail fast) |
| ✅ | `src/bot/app.ts` — Bolt 앱 기동(Socket Mode), `/report` 커맨드가 자리표시자 응답 |
| ✅ | GitHub 저장소·PR 워크플로 (PR 본문은 영어로 작성) |
| 🚧 | A봇 전체 (Sheets 연동, 대상자 필터링, 멘션 발송, 스케줄링, 스레드 확인) |
| 🚧 | B봇 전체 (모달, 포맷팅, Claude 요약, 폴백) |
| 🚧 | ESLint, 테스트, Docker, CI, 배포 |

**실제로 검증한 것**: `npm run dev` → Slack에서 `/report` 입력 → 자리표시자 메시지 응답 확인.

---

## 4. 환경 정보 (이미 갖춰진 것)

| 항목 | 값 |
|---|---|
| 작업 경로 | `C:\slack-ops-bot` (Windows 11, PowerShell, IntelliJ IDEA) |
| Node | v22.16.0 (`--env-file` 내장 지원 → dotenv 불필요) |
| GitHub 저장소 | https://github.com/Nu-gu-nya/slack-ops-bot (Public) |
| git 계정 | `Soohwan Kim <127274702+Nu-gu-nya@users.noreply.github.com>` (전역 설정 완료) |
| GitHub CLI | `C:\Program Files\GitHub CLI\gh.exe` — 로그인 완료. **PATH에 없으므로 전체 경로로 호출한다.** |
| Slack 워크스페이스 | `ops-bot-test` / 앱 이름 `Ops Bot` / 테스트 채널 `#test-attendance` |
| Slack 앱 설정 | `slack-app-manifest.yml` (저장소 루트). 스코프·이벤트가 이 파일에 있다 |
| 토큰 | `.env`에 `SLACK_BOT_TOKEN`(xoxb-), `SLACK_APP_TOKEN`(xapp-). **커밋 금지, 채팅에 붙여넣지 않는다** |

아직 없는 것: Google Cloud 서비스 계정, 근태 스프레드시트, `ANTHROPIC_API_KEY`.

### 명령어

```bash
npm run dev         # 개발 실행 (Socket Mode 연결)
npm run typecheck   # 타입 검사
npm run build && npm start
```

---

## 5. 확정된 결정 (뒤집지 않는다)

`docs/DECISIONS.md`의 ADR이 우선이다. 그 외에 작업하면서 확정된 것:

| 결정 | 이유 |
|---|---|
| dotenv를 쓰지 않고 Node 내장 `--env-file` 사용 | Node 20.6+에 같은 기능이 있어 의존성을 줄였다 |
| `SLACK_SIGNING_SECRET` 불필요 | Socket Mode는 인바운드 HTTP 요청이 없어 서명 검증 대상이 없다 |
| 슬래시 커맨드에 `commands` 스코프 필요 | `ARCHITECTURE.md` 표에 누락되어 있었다 (수정 예정) |
| 타입 단언(`as`) 대신 `if` 검사로 좁히기 | 컴파일 시점뿐 아니라 런타임에도 실제로 막힌다 |
| `learn/`은 git에 올리지 않는다 | 개인 학습용이며 프로젝트 산출물이 아니다 |
| **언어 정책**: README는 한국어·일본어 2종, **그 외 산출물은 전부 영어** | 한국·일본 양쪽 지원에 쓰는 자료다. 판단 근거(PR·커밋·설계 문서)는 어느 쪽 리뷰어든 읽을 수 있어야 한다 |
| 적용 범위: `docs/`, 커밋 메시지, PR, 코드 주석, 로그 문자열 → 영어 | 새로 쓰는 것부터 영어로 쓴다 |
| 예외: `learn/`은 한국어 유지 | 본인 학습용이고 git에 올라가지 않는다 |

---

## 6. 작업 규칙

### 브랜치·커밋

`main`에 직접 커밋하지 않는다. `이슈 선택 → 브랜치 → 구현 → 커밋 → PR → 셀프 리뷰 → 병합`.
커밋은 Conventional Commits(`CONTRIBUTING.md`), PR은 `.github/pull_request_template.md`를 따른다.
**셀프 체크 항목을 억지로 전부 체크하지 않는다.** 안 한 것은 안 했다고 적고 언제 할지를 함께 적는다.

### 코드

`any` 금지, `strict: true` 유지. 실패 경로(네트워크 오류·빈 배열·null·권한 없음)를 반드시 처리한다.
컨트롤러(`bot/handlers`)에 비즈니스 로직을 넣지 않는다. 판단 로직은 `services/`에 둔다.
매직 넘버·문자열은 상수로. 주석은 "무엇을"이 아니라 **"왜"**.

### 기능을 구현할 때마다 해설 파일을 쓴다 (중요)

기능 단위 작업을 마치면 **`learn/explain-<기능>.md`**에 해설을 남긴다.
`learn/`은 git에 올라가지 않으므로 저장소를 더럽히지 않는다.

- 대상 독자는 **코딩을 막 시작한 중학생**이다. 전제 지식을 가정하지 않는다.
- 새 문법·개념이 나오면 **코드보다 개념을 먼저** 설명한다. 가능하면 자바·파이썬과 비교한다.
- 그 파일이 **왜 필요한지**, 데이터가 **어디서 와서 어디로 가는지**를 먼저 그린다.
- 코드는 **한 줄씩** 해설한다. "무엇을 했는가"가 아니라 "왜 이렇게 했는가"를 적는다.
- 실패하면 어떻게 되는지, 그때 어떤 로그가 보이는지 함께 적는다.
- 마지막에 **확인 질문 2~3개**를 넣는다.

기존 문서: `learn/GUIDE.md`(TS 문법 교과서 — 10개 장), `learn/day1.ts`, `learn/day2.ts`(async 실습).

---

## 7. 문서 지도

| 상황 | 문서 |
|---|---|
| 작업 재개 / 현재 상태 파악 | **이 문서** |
| 오늘 뭘 할지 | `docs/ROADMAP.md` |
| 기능 요구사항 | `docs/PLANNING.md` |
| 구조·API·도메인 모델 | `docs/ARCHITECTURE.md` |
| 봇 메시지 문구·대화 흐름 | `docs/UIUX.md` |
| 커밋·PR 규칙 | `CONTRIBUTING.md` |
| 테스트 | `docs/QA.md` |
| 배포·CI | `docs/DEPLOY.md` |
| 기술 선택 근거(ADR) | `docs/DECISIONS.md` |
| 막힌 것·배운 것 기록 | `docs/JOURNAL.md` |
| TS 문법 참고서 | `learn/GUIDE.md` (git 추적 제외) |

---

## 8. 다음에 할 일

**ROADMAP 3일차: Google Sheets 연동.** 순서는 이렇다.

1. **Google Cloud 준비 (사용자가 브라우저에서 진행, 단계별 안내 필요)**
   - 프로젝트 생성 → **Google Sheets API 활성화** → **서비스 계정** 생성 → JSON 키 발급
   - `.env`에 `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID` 추가
     (`.env.example`에 주석으로 이미 들어 있다)
   - ⚠️ **스프레드시트를 서비스 계정 이메일에 "공유"해야 읽을 수 있다.** 빠뜨리기 쉬운 단계다.
2. **시트 스키마 확정** — 열: 날짜 / 부서 / 이름 / Slack 사용자 ID / 상태 / 시작 / 종료
   (`ARCHITECTURE.md`의 `AttendanceRecord` 참고. `slackUserId`는 멘션에 반드시 필요하다)
3. **`googleapis` 패키지 추가** — 설치 전에 왜 필요한지 설명한다
4. **`src/services/sheets.service.ts`** — 시트에서 행을 읽어오기만 한다(판단 로직 없음)
5. **`src/types/domain.ts`** — `AttendanceRecord`, `AttendanceStatus` 정의 (`as const` 패턴)
6. **`src/services/attendance.service.ts`** — 오늘 날짜 필터, `결근` 제외, 부서별 그룹핑
   → **여기가 첫 단위 테스트 대상이다** (`docs/QA.md`의 예시 참고)

그다음(4~7일차): 부서→채널 매핑, 멘션 발송, `node-cron` 스케줄(평일 08:50 Asia/Seoul),
스레드 답글 감지 → ✅ 리액션.

### 밀린 잔업

- `docs/ARCHITECTURE.md` 수정: `commands` 스코프 추가, `SLACK_SIGNING_SECRET` 제거
- `docs/ROADMAP.md` 수정: dotenv 언급 → `--env-file`
- `docs/JOURNAL.md`: 2026-09-23 이후 기록이 비어 있다 (비동기 개념, git author 이메일 사고)
- ESLint 미설정 — `package.json`에 `lint` 스크립트가 없다
- 테스트 러너 미도입 — `npm test`가 아직 오류를 반환한다
- **언어 정책 소급 적용**: 기존 `docs/*.md`(이 문서 포함)와 `src/`의 한국어 주석·로그가 아직 한국어다.
  `app.ts`의 기동 로그 `⚡ Ops Bot 실행 중 (Socket Mode)`도 영어로 바꿔야 한다.
  **MVP 완성 후 버퍼 기간에 일괄 번역한다. 지금은 새로 쓰는 것만 영어로 쓴다.**

### 일정 감각

마감이 촉박하다. 밀리면 **범위를 줄이지 일정을 늘리지 않는다.** 버리는 순서는 `ROADMAP.md`에 있다.
절대 버리지 않는 것: **근무 대상자 필터링 테스트, Claude 실패 폴백, 배포, README.**
