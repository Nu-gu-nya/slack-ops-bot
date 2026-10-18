# 아키텍처

## 전체 구조

```
┌──────────┐   WebSocket (Socket Mode)   ┌────────────────────────┐
│  Slack   │ ◄─────────────────────────► │     Node.js / TS       │
│Workspace │                             │     (Slack Bolt App)   │
└──────────┘                             │                        │
                                          │  ┌──────────────────┐  │      HTTPS      ┌────────────────┐
                                          │  │ node-cron         │─┼────────────────►│ Google Sheets   │
                                          │  │ (08:50 등 스케줄) │  │                  │ API             │
                                          │  └──────────────────┘  │                  └────────────────┘
                                          │                        │      HTTPS      ┌────────────────┐
                                          │                        │─────────────────►│  Claude API    │
                                          └────────────────────────┘                  └────────────────┘
```

**Socket Mode를 쓰는 이유**: 이 앱은 공개 URL이 없어도 Slack과 통신할 수 있다.
로컬 개발 중에도, Railway 같은 곳에 배포한 뒤에도 인바운드 HTTP 서버가 필요 없다.
대신 앱이 Slack에 WebSocket으로 접속해 이벤트를 "받으러" 간다.
근거는 [DECISIONS.md](DECISIONS.md) ADR-002 참고.

DB는 두지 않는다. **Google Sheets가 유일한 데이터 저장소(source of truth)**다.
근거는 ADR-003 참고.

---

## 프로젝트 구조

모노레포가 아니다. 단일 Node 프로세스이고, 프론트엔드가 없다(Slack이 곧 UI다).

```
slack-ops-bot/
├── src/
│   ├── bot/                         # Slack·node-cron 어댑터 (판단 로직 없음)
│   │   ├── app.ts                   # 의존성 조립, Socket Mode 기동, 스케줄 등록
│   │   ├── scheduler.ts             # node-cron 등록 (Asia/Seoul 고정, 중복 실행 방지)
│   │   ├── slack-messenger.ts       # Messenger 인터페이스의 Slack 구현
│   │   └── handlers/
│   │       ├── checkin.thread.ts    # 멘션 메시지의 스레드 답글 → ✅ 리액션
│   │       ├── report.command.ts    # `/report` → 모달 오픈
│   │       ├── report.view.ts       # 모달 Block Kit 정의, 입력값 추출, 필드별 오류 매핑
│   │       └── report.submit.ts     # 모달 제출(view_submission) 처리
│   ├── services/                    # 판단 로직. 외부 API는 인터페이스로만 의존 → 단위 테스트 대상
│   │   ├── sheets.service.ts        # Google Sheets 읽기 (AttendanceSheetReader)
│   │   ├── attendance.service.ts    # 시트 행 → AttendanceRecord 변환, 오늘 대상자 계산, 부서별 그룹핑
│   │   ├── attendance-check.service.ts # 08:50 실행 전체 흐름. 모든 실패를 관리자 알림으로 귀결
│   │   ├── checkin.service.ts       # (channel, ts) ↔ 대상자 메모리 저장, 답글 매칭
│   │   ├── report.service.ts        # 보고 입력 검증, "09:00 A업무 (완료)" 포맷팅
│   │   ├── summarize.service.ts     # Claude API 호출(Summarizer), 실패 시 원문 폴백
│   │   ├── report-delivery.service.ts # 요약 → 매니저 채널 전송, 전송 실패 시 관리자 알림
│   │   ├── messenger.ts             # Slack 전송 인터페이스 (post, notifyAdmin)
│   │   ├── messages.ts              # 사용자에게 보이는 문구 (UIUX.md 기준)
│   │   ├── time.ts                  # 서울 기준 날짜, 시트 날짜·시간 정규화
│   │   └── retry.ts                 # 1회 재시도
│   ├── config/
│   │   ├── env.ts                   # 환경 변수 로딩·검증 (fail fast)
│   │   └── departments.ts           # 부서 → 채널 ID 매핑, 시트 범위
│   └── types/
│       └── domain.ts                # AttendanceRecord, ReportEntry 등
├── docs/
├── .env.example
└── package.json
```

컨트롤러(handlers) ↔ 서비스 계층 분리는 `CLAUDE.md`의 코드 규칙을 그대로 따른다.
`handlers`는 Slack 이벤트를 받아 파싱하고 응답하는 역할만 하고, 실제 판단 로직(누구를 멘션할지,
어떻게 요약할지)은 `services`에 둔다. 이유는 서비스 로직만 떼어서 단위 테스트할 수 있어야 하기 때문이다.

서비스는 외부 API를 직접 부르지 않고 세 인터페이스에만 의존한다.

| 인터페이스 | 실제 구현 | 테스트에서 |
|---|---|---|
| `AttendanceSheetReader` | `sheets.service.ts` (Google Sheets API) | 고정된 행 배열을 돌려주거나 예외를 던지는 가짜 |
| `Messenger` | `bot/slack-messenger.ts` (Slack Web API) | 보낸 메시지를 배열에 기록하는 가짜 |
| `Summarizer` | `summarize.service.ts` (Anthropic SDK) | 고정 요약을 돌려주거나 예외를 던지는 가짜 |

조립은 `bot/app.ts` 한 곳에서만 한다.

---

## 핵심 도메인 모델

```typescript
// src/types/domain.ts

export const ATTENDANCE_STATUS = ['출근', '결근', '리모트'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export interface AttendanceRecord {
  date: string;            // 'YYYY-MM-DD'
  department: string;      // '개발', 'CS' 등. 시트의 부서 열 값 그대로
  name: string;
  slackUserId: string;     // 멘션에 반드시 필요. 시트의 별도 열에서 채운다
  status: AttendanceStatus;
  startTime: string | null; // 'HH:mm', 결근이면 null
  endTime: string | null;
}

export const REPORT_ENTRY_STATUS = ['완료', '지연', '미착수'] as const;
export type ReportEntryStatus = (typeof REPORT_ENTRY_STATUS)[number];

export interface ReportEntry {
  time: string;   // 'HH:mm'
  task: string;
  status: ReportEntryStatus;
}
```

`as const` + `typeof`로 유니온 타입을 뽑아내는 패턴이다. 상태 값을 추가할 일이 생기면
배열 한 곳만 고치면 타입이 따라온다.

---

## 데이터 흐름

### Bot A — 출근 알림 봇

```
node-cron(매일 08:50, Asia/Seoul)
  → sheets.service: 근태 탭 전체 행 조회 (실패 시 관리자 알림 후 종료)
  → attendance.service: 행 → AttendanceRecord 변환 (형식 오류 행은 건너뛰고 관리자 알림)
  → attendance.service: 서울 기준 오늘 날짜이고 status !== '결근'인 사람만 대상
      slackUserId가 빈 사람은 대상에서 빼고 관리자 알림, department별로 그룹
  → 부서별 채널에 멘션 메시지 발송 (실패 시 1회 재시도)
      "@james @kane 오늘 근무 예정입니다. 출근하셨으면 이 메시지 스레드에 댓글로 알려주세요."
  → 발송한 메시지의 (channel, ts) ↔ 대상자 slackUserId 목록을 메모리에 저장
  → (별도 이벤트) 누군가 그 메시지 스레드에 답글
      → checkin.thread 핸들러: 답글 작성자가 저장해둔 대상자 목록에 있는지 확인
      → 있으면 ✅ 이모지 리액션으로 확인 표시 (P0)
      → 없으면 조용히 무시 (P0) / 안내 메시지 (P1)
```

**당일 상태를 메모리에만 두는 이유**: 시트에 확인 시각을 다시 쓰는 것(back-write)은
쓰기 권한과 동시성 문제까지 다뤄야 해서 범위가 커진다. MVP는 프로세스가 켜져 있는 동안의
확인만 처리하고, 재시작 시 유실되는 건 감수한다. 확장 여지는 ADR-004에 남겨둔다.

### Bot B — 업무 보고 다이제스트 봇

```
사용자가 `/report` 실행
  → report.command: 모달(view) 오픈. 시간/업무/상태를 여러 줄 입력하는 폼
  → 사용자 제출 (view_submission)
  → report.submit: 입력값 추출 → report.service로 검증
      일부만 채운 줄이 있으면 → 모달을 닫지 않고 해당 필드 밑에 오류 표시
  → 검증 통과 시 모달을 먼저 닫는다 (Claude 호출이 Slack의 3초 응답 제한을 넘길 수 있으므로)
  → report.service: "09:00 A업무 (완료)" 형식으로 정렬·포맷팅
  → summarize.service: Claude API에 포맷된 텍스트를 보내 요약 생성
      실패 시(타임아웃, 레이트리밋, 거절, 빈 응답) → 원문 포맷 그대로 + "(자동 요약 실패, 원문 표시)"
  → report-delivery.service: 매니저 채널에 요약 + 원문 전송
      전송까지 실패하면 → 원문을 담아 관리자 채널로 알림 (보고 유실 방지)
```

요약 모델은 `claude-opus-5-5`를 effort `low`로 쓴다. 몇 줄짜리 보고 요약에는 깊은 추론이 필요 없어서다.
타임아웃 20초, SDK 재시도 1회로 묶어 매니저가 오래 기다리지 않게 한다.

---

## Slack 앱 설정 (이벤트/커맨드)

| 종류 | 이름 | 용도 |
|---|---|---|
| Slash Command | `/report` | 업무 보고 모달 오픈 |
| Interactivity | `view_submission` | 모달 제출 처리 |
| Event Subscription | `message.channels` | 스레드 답글 감지 (출근 확인) |
| Bot Token Scope | `chat:write` | 메시지/멘션 발송 |
| Bot Token Scope | `channels:history` | 스레드 답글 읽기 |
| Bot Token Scope | `reactions:write` | 확인 리액션 |
| Bot Token Scope | `commands` | 슬래시 커맨드 수신 |

설정 원본은 저장소 루트의 `slack-app-manifest.yml`이다. 이 표와 어긋나면 manifest가 우선한다.

Socket Mode를 쓰므로 `SLACK_APP_TOKEN`(xapp-, connections:write 스코프)이 추가로 필요하다.
반대로 `SLACK_SIGNING_SECRET`은 필요 없다. 인바운드 HTTP 요청이 없어 서명을 검증할 대상이 없기 때문이다.

봇은 알림을 보낼 모든 채널(부서·관리자·매니저)에 초대되어 있어야 한다. 부서 채널이 비공개 채널이면
`groups:history` 스코프와 `message.groups` 이벤트가 추가로 필요하다(현재는 공개 채널 전제).

---

## 스케줄링

`node-cron`을 Bolt 앱과 같은 프로세스 안에서 실행한다. 별도 워커/큐는 두지 않는다.

```typescript
cron.schedule('50 8 * * 1-5', job, { timezone: 'Asia/Seoul', noOverlap: true });
```

평일(1-5)에만 실행한다. 별도 스케줄러 서비스(예: cloud scheduler)를 쓰지 않는 이유는
이 규모에서 인프라 하나를 더 두는 비용이 이점보다 크기 때문이다.

- **타임존을 명시한다.** 배포 서버는 대개 UTC라서, 지정하지 않으면 08:50이 한국 시간 17:50이 된다.
  "오늘 날짜" 계산도 같은 이유로 `Intl.DateTimeFormat`에 `Asia/Seoul`을 넘겨 구한다.
- **공휴일은 처리하지 않는다.** 평일 공휴일에도 실행되며, 그날 시트에 행이 없으면
  "등록된 근무자 없음" 알림만 간다.
- **실행 시각은 `ATTENDANCE_CRON`으로 바꿀 수 있다.** 수동 검증 때 몇 분 뒤로 당겨 한 번만 실행하는 용도다.

---

## 에러 처리 방침

| 상황 | 처리 |
|---|---|
| 시트 조회 실패(네트워크/권한) | 관리자 DM/채널에 실패 알림, 그날 멘션은 건너뜀 |
| 시트에 오늘 행이 없음(빈 결과) | 멘션 생략, 관리자에게만 "오늘 등록된 근무자 없음" 알림 |
| 형식이 잘못된 시트 행 (날짜·상태·이름) | 그 행만 건너뛰고 시트 행 번호와 사유를 관리자에게 알림 |
| Slack 사용자 ID가 빈 행 | 멘션에서 빼고 관리자에게 이름 목록 알림 |
| 채널이 매핑되지 않은 부서 | 그 부서만 건너뛰고 관리자 알림, 다른 부서는 계속 발송 |
| Slack 메시지 발송 실패 | 재시도 1회 후 실패 시 관리자 알림 |
| Claude API 실패/타임아웃/거절/빈 응답 | 원문 포맷을 그대로 전달 (요약 없이) |
| 매니저 채널 전송 실패 | 원문을 담아 관리자 채널로 알림 |
| 관리자 알림 자체가 실패 | 로그만 남기고 나머지 처리는 계속한다 (더 알릴 곳이 없음) |
| 대상자 아닌 사람의 스레드 답글 | 무시 (오작동 방지) |

## 환경 변수

| 이름 | 필수 | 내용 |
|---|---|---|
| `SLACK_BOT_TOKEN` | ✅ | Bot User OAuth Token (xoxb-) |
| `SLACK_APP_TOKEN` | ✅ | Socket Mode 접속용 App-Level Token (xapp-) |
| `ADMIN_CHANNEL_ID` | ✅ | 실패·경고 알림을 받을 채널 |
| `REPORT_CHANNEL_ID` | ✅ | 업무 보고 다이제스트를 받을 매니저 채널 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✅ | 서비스 계정 JSON 키의 `client_email` |
| `GOOGLE_PRIVATE_KEY` | ✅ | JSON 키의 `private_key`. 한 줄로 저장하고 코드에서 `\n`을 개행으로 바꾼다 |
| `GOOGLE_SHEET_ID` | ✅ | 시트 URL의 `/d/`와 `/edit` 사이 문자열 |
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 |
| `ATTENDANCE_CRON` | | 출근 알림 스케줄. 기본값 `50 8 * * 1-5` |

필수 값이 하나라도 비어 있으면 기동 시점에 바로 종료한다(fail fast). 형식은 `.env.example` 참고.

부서-채널 매핑은 비밀값이 아니므로 `.env`가 아니라 `src/config/departments.ts`에 코드로 둔다.
서비스 계정에는 IAM 역할을 주지 않는다. 시트 접근 권한은 시트를 그 계정 이메일에 **뷰어로 공유**해서 준다.

## 아직 하지 않는 것 (의도적)

| 항목 | 이유 |
|---|---|
| 자체 DB | 시트가 이미 SoT 역할을 하고, 입력 UI(드롭다운)까지 겸함 |
| 웹 대시보드 | Slack 자체가 UI. 필요해지면 별도 확장 단계로 분리 |
| 다중 워크스페이스 지원 | 단일 조직 사용 전제. Socket Mode는 애초에 이런 확장에 안 맞음 |
| 확인 상태의 시트 back-write | 쓰기 동시성까지 다루기엔 시간 대비 이득이 작음 (P1로 남김) |

위 항목은 전부 일정이 아니라 범위 판단으로 제외한 것이다.
