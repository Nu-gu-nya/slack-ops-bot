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
│   ├── bot/
│   │   ├── app.ts               # Bolt App 초기화, Socket Mode 연결
│   │   ├── handlers/
│   │   │   ├── report.command.ts    # `/report` 슬래시 커맨드 → 모달 오픈
│   │   │   ├── report.submit.ts     # 모달 제출(view_submission) 처리
│   │   │   └── checkin.thread.ts    # 멘션 메시지의 스레드 답글 처리
│   │   └── scheduler.ts         # node-cron 등록 (08:50 출근 알림 등)
│   ├── services/
│   │   ├── sheets.service.ts    # Google Sheets 읽기 (근태) / 쓰기(확장 시)
│   │   ├── attendance.service.ts# 오늘 근무 대상자 계산, 부서별 그룹핑
│   │   ├── report.service.ts    # 보고 텍스트 포맷팅
│   │   └── summarize.service.ts # Claude API 호출, 실패 시 원문 폴백
│   ├── config/
│   │   ├── env.ts               # 환경 변수 로딩·검증
│   │   └── departments.ts       # 부서 → 채널 ID 매핑
│   └── types/
│       └── domain.ts            # AttendanceRecord, ReportEntry 등
├── docs/
├── .env.example
└── package.json
```

컨트롤러(handlers) ↔ 서비스 계층 분리는 `CLAUDE.md`의 코드 규칙을 그대로 따른다.
`handlers`는 Slack 이벤트를 받아 파싱하고 응답하는 역할만 하고, 실제 판단 로직(누구를 멘션할지,
어떻게 요약할지)은 `services`에 둔다. 이유는 서비스 로직만 떼어서 단위 테스트할 수 있어야 하기 때문이다.

---

## 핵심 도메인 모델

```typescript
// src/types/domain.ts

export const ATTENDANCE_STATUS = ['출근', '결근', '리모트'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export interface AttendanceRecord {
  date: string;            // 'YYYY-MM-DD'
  department: string;      // '27기 인턴', 'PD', 'CS' 등
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
  → sheets.service: 오늘 날짜 행 조회
  → attendance.service: status !== '결근'인 사람만 필터, department별로 그룹
  → 부서별 채널에 멘션 메시지 발송
      "@james @kane 오늘 근무 예정입니다. 출근하셨으면 이 스레드에 댓글 부탁드립니다."
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
  → report.submit: 입력값 파싱 → ReportEntry[] 로 변환
  → report.service: "09:00 A업무 (완료)" 형식으로 정렬·포맷팅
  → summarize.service: Claude API에 포맷된 텍스트를 보내 요약/다이제스트 생성
      실패 시(타임아웃, 레이트리밋) → 원문 포맷 그대로 전달 + "(자동 요약 실패)" 표시
  → 매니저/부서 채널에 다이제스트 전송
```

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

Socket Mode를 쓰므로 `SLACK_APP_TOKEN`(xapp-, connections:write 스코프)이 추가로 필요하다.

---

## 스케줄링

`node-cron`을 Bolt 앱과 같은 프로세스 안에서 실행한다. 별도 워커/큐는 두지 않는다.

```typescript
cron.schedule('50 8 * * 1-5', runAttendanceCheck, { timezone: 'Asia/Seoul' });
```

평일(1-5)에만 실행한다. 별도 스케줄러 서비스(예: cloud scheduler)를 쓰지 않는 이유는
이 규모에서 인프라 하나를 더 두는 비용이 이점보다 크기 때문이다.

---

## 에러 처리 방침

| 상황 | 처리 |
|---|---|
| 시트 조회 실패(네트워크/권한) | 관리자 DM/채널에 실패 알림, 그날 멘션은 건너뜀 |
| 시트에 오늘 행이 없음(빈 결과) | 멘션 생략, 관리자에게만 "오늘 등록된 근무자 없음" 알림 |
| Slack 메시지 발송 실패 | 재시도 1회 후 실패 시 관리자 알림 |
| Claude API 실패/타임아웃 | 원문 포맷을 그대로 전달 (요약 없이) |
| 대상자 아닌 사람의 스레드 답글 | 무시 (오작동 방지) |

## 환경 변수

```
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=        # Socket Mode용 (xapp-)
SLACK_SIGNING_SECRET=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_ID=
ANTHROPIC_API_KEY=
```

부서-채널 매핑은 비밀값이 아니므로 `.env`가 아니라 `src/config/departments.ts`에 코드로 둔다.

## 아직 하지 않는 것 (의도적)

| 항목 | 이유 |
|---|---|
| 자체 DB | 시트가 이미 SoT 역할을 하고, 입력 UI(드롭다운)까지 겸함 |
| 웹 대시보드 | Slack 자체가 UI. 필요해지면 별도 확장 단계로 분리 |
| 다중 워크스페이스 지원 | 단일 조직 사용 전제. Socket Mode는 애초에 이런 확장에 안 맞음 |
| 확인 상태의 시트 back-write | 쓰기 동시성까지 다루기엔 시간 대비 이득이 작음 (P1로 남김) |

**"안 한 것"과 "못 한 것"을 구분해서 설명할 수 있어야 한다.**
