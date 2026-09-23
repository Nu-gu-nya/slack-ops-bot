# QA (품질 보증)

> QA는 "다 만들고 나서 버그를 찾는 일"이 아니라
> **"버그가 나올 수 없는 구조를 만드는 일"**이다. 세 겹으로 방어한다.

---

## 방어선 3겹

```
1겹  타입 시스템        컴파일 시점에 막는다        비용 0, 커버리지 넓음
2겹  자동화 테스트      커밋 시점에 막는다          비용 중간, 회귀 방지
3겹  수동 테스트        배포 전에 막는다            비용 높음, 최후 수단
```

---

## 1겹 — 타입으로 막기

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

`any` 금지, `await` 누락 금지를 ESLint로 강제한다.

```js
// eslint.config.js
rules: {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
}
```

특히 이 프로젝트는 외부 API(Slack/Sheets/Claude) 응답이 전부 "느슨한 타입"으로 들어온다.
받는 즉시 우리 도메인 타입(`AttendanceRecord`, `ReportEntry`)으로 변환하는 지점에서
`any`가 새어 들어가지 않도록 하는 게 이 프로젝트의 타입 방어에서 가장 중요한 지점이다.

---

## 2겹 — 자동화 테스트

### 무엇을 테스트할 것인가

| 대상 | 테스트 | 이유 |
|---|---|---|
| 근무 대상자 필터링 로직 | **반드시** | 이 프로젝트의 핵심 비즈니스 로직 (Bot A) |
| 시트 행 → 도메인 타입 매핑 | **반드시** | 외부 데이터 형식이 깨지면 전체가 죽는다 |
| 업무 보고 포맷팅 로직 | **반드시** | 두 번째 핵심 로직 (Bot B) |
| 스레드 답글 → 확인 대상 매칭 | 반드시 | 잘못 매칭되면 엉뚱한 사람이 확인 처리됨 |
| Claude 프롬프트 자체 품질 | 수동 검증 | 자동화로 "좋은 요약인지" 판단하기 어려움 |
| Slack 메시지 문자열 조립 | 하면 좋음 | |

### 외부 API는 모킹한다

Slack Web API, Google Sheets API, Anthropic SDK를 실제로 호출하는 테스트는 만들지 않는다.
각 서비스 모듈의 클라이언트를 인터페이스로 감싸고, 테스트에서는 가짜 구현을 주입한다.

```typescript
// src/services/attendance.service.spec.ts

describe('오늘 근무 대상자 계산', () => {
  it('결근인 사람은 대상에서 제외한다', () => {
    const rows: AttendanceRecord[] = [
      { date: '2026-09-14', department: 'CS', name: 'James', slackUserId: 'U1', status: '출근', startTime: '09:00', endTime: '18:00' },
      { date: '2026-09-14', department: 'CS', name: 'Kane', slackUserId: 'U2', status: '결근', startTime: null, endTime: null },
    ];
    const targets = getTodayTargets(rows, '2026-09-14');
    expect(targets.map((t) => t.name)).toEqual(['James']);
  });

  it('slackUserId가 없는 행은 대상에서 제외하고 경고 목록에 담는다', () => {
    const rows: AttendanceRecord[] = [
      { date: '2026-09-14', department: 'CS', name: 'Denis', slackUserId: '', status: '출근', startTime: '09:00', endTime: '18:00' },
    ];
    const { targets, warnings } = getTodayTargetsSafe(rows, '2026-09-14');
    expect(targets).toHaveLength(0);
    expect(warnings).toContain('Denis');
  });

  it('오늘 행이 하나도 없으면 빈 배열을 반환한다', () => {
    expect(getTodayTargets([], '2026-09-14')).toEqual([]);
  });
});
```

> 테스트 이름을 한국어 서술문으로 쓰면 테스트 목록 자체가 명세서가 된다.
> `npm test` 출력을 캡처해 포트폴리오에 넣을 수 있다.

### Claude 요약 실패 폴백 테스트

```typescript
describe('업무 보고 요약', () => {
  it('Claude API가 실패하면 원문 포맷을 그대로 반환한다', async () => {
    const fakeClient = { summarize: async () => { throw new Error('timeout'); } };
    const result = await summarizeReport(fakeClient, formattedText);
    expect(result.usedFallback).toBe(true);
    expect(result.text).toBe(formattedText);
  });
});
```

이 테스트가 없으면 "요약 API가 죽으면 보고 자체가 사라진다"는 걸 코드 리뷰 전까지 아무도 모른다.

---

## 3겹 — 수동 테스트 체크리스트

자동화하기 어려운 것만 남긴다. 배포 전에 한 번 훑는다.

### 데모/테스트 계정 준비

Slack은 실제 이메일로 초대된 계정만 `@멘션`할 수 있다. Gmail의 플러스 주소
(`본인계정+james@gmail.com`, `+kane@gmail.com`, `+denis@gmail.com`)로 테스트 워크스페이스에
별도 계정 여러 개를 만들어두면, 실제 멘션·스레드 답글까지 전 과정을 혼자서 검증할 수 있다.

### 기능

- [ ] 오늘 행이 있는 부서 채널에 정상적으로 멘션이 발송된다
- [ ] 대상자 본인이 스레드에 답글을 달면 리액션이 붙는다
- [ ] 대상자가 아닌 계정이 답글을 달아도 오작동하지 않는다
- [ ] `/report` 제출 후 다이제스트가 매니저 채널에 도착한다

### 비정상 경로 (여기서 대부분의 버그가 나온다)

- [ ] 오늘 시트에 아무도 없을 때 → 멘션 생략, 관리자 알림만 감
- [ ] 시트 API 키를 일부러 틀리게 설정 → 실패가 조용히 묻히지 않고 알림이 감
- [ ] slackUserId 열을 비워둔 행 → 멘션에서 빠지고 경고로 표시됨
- [ ] `/report` 모달에서 필수 항목을 비우고 제출 → 어느 항목이 문제인지 표시됨
- [ ] Claude API 키를 일부러 무효화 → 원문이라도 반드시 전달됨
- [ ] 같은 사람이 스레드에 답글을 두 번 → 리액션이 중복되지 않음

### 환경

- [ ] Asia/Seoul 기준으로 스케줄이 정확한 시각에 실행된다 (서버 타임존이 다를 수 있음에 주의)
- [ ] 콘솔에 처리되지 않은 Promise rejection 경고가 없다

---

## CI에서 자동 실행

```
lint  →  typecheck  →  unit test  →  build
```

설정은 [DEPLOY.md](DEPLOY.md)를 참고한다.

---

## 버그를 발견했을 때

1. **먼저 실패하는 테스트를 쓴다** (재현)
2. 그 다음 코드를 고친다
3. 테스트가 통과하는지 확인한다

PR 본문에 "재현 테스트 추가함"이라고 쓸 수 있으면 리뷰어 신뢰도가 크게 올라간다.
