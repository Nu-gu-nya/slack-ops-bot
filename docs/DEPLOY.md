# 배포 및 자동화

> "내 노트북에서는 됩니다"를 없애는 단계.

---

## 단계별 접근

한 번에 고급 인프라로 가지 않는다. **동작하는 배포를 먼저 만들고, 그다음에 고급화한다.**

```
목표 1   로컬에서 npm run dev 로 Bot A + Bot B 전체 기동
목표 2   GitHub Actions로 lint + typecheck + test 자동 실행
목표 3   Railway 또는 Render에 자동 배포 (main 머지 시)
```

> DB가 없는 단일 Node 프로세스라 인프라가 단순하다. 이 단순함은
> ADR-003(시트를 저장소로 채택)의 결과다.

---

## Socket Mode라 인바운드 포트가 필요 없다

이 봇은 Slack에 WebSocket으로 접속하는 쪽(Socket Mode, ADR-002)이라
**HTTP 서버를 띄우거나 공개 URL을 확보할 필요가 없다.** 배포는 "장기 실행되는 프로세스 하나"만
있으면 된다. Railway의 Worker/Background 서비스 타입이 정확히 이 형태에 맞는다.

---

## Docker

### 왜 쓰나

- 개발 환경과 운영 환경의 Node 버전 차이를 없앤다
- 배포 플랫폼이 바뀌어도 이미지 하나로 이식 가능하다

### Dockerfile (멀티스테이지)

```dockerfile
# 빌드 단계
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 실행 단계 — 빌드 도구를 포함하지 않아 이미지가 작아진다
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/bot/app.js"]
```

DB가 없으므로 `docker-compose.yml`은 필수가 아니다. 로컬 개발은 `npm run dev`로 충분하고,
Docker는 배포 이미지 통일 용도로만 쓴다.

> 멀티스테이지를 쓰는 이유는 빌드에만 필요한 의존성을 최종 이미지에서 제외해 크기와 공격 표면을 줄이기 위해서다.

---

## CI — GitHub Actions

설정은 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)에 있다. `main` 대상 PR과 `main` 푸시에서 실행된다.

```
npm ci  →  lint  →  typecheck  →  test  →  build
```

- Node 22 (로컬 개발과 같은 메이저 버전), npm 캐시 사용
- 같은 브랜치에 새 푸시가 오면 이전 실행은 취소한다 (`concurrency`)
- 토큰 권한은 `contents: read`만 준다. CI는 저장소를 읽기만 하면 된다
- 외부 API를 호출하는 테스트가 없으므로 CI에는 비밀값이 하나도 필요 없다

이 워크플로가 통과해야만 병합되도록 브랜치 보호 규칙을 건다. [CONTRIBUTING.md](../CONTRIBUTING.md) 참고.

---

## CD — 자동 배포

`.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Railway
        run: railway up --service bot
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

**비밀값은 절대 코드에 넣지 않는다.** GitHub Settings → Secrets, Railway 환경 변수에 각각 저장한다.

---

## Slack 알림 연동 (CI/배포 알림 — 봇 자체 기능과는 별개)

CI 결과와 배포 결과도 Slack 채널로 보낸다. 개인 테스트 워크스페이스의
`#ci-alerts`, `#deploy` 채널을 쓰면 되고, 이건 봇이 사용자에게 제공하는 기능이 아니라
**개발 프로세스를 관리하는 용도**다.

```yaml
      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {"text": "❌ CI 실패: ${{ github.event.pull_request.title }}"}
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

> `if: failure()`가 포인트다. 성공까지 다 알리면 알림이 소음이 되어 아무도 안 본다.
> **알림 설계 = 무엇을 알리지 않을지 정하는 일.**

---

## 운영 관측 (Observability)

DB가 없어 전통적인 "헬스체크 엔드포인트"는 의미가 없다. 대신 다음을 확인한다.

- **Socket Mode 연결 상태 로그**: 연결/재연결/끊김을 로그로 남긴다 (배포 플랫폼의 로그 뷰에서 확인)
- **스케줄러 실행 로그**: 매일 08:50 실행이 실제로 발동했는지, 몇 명을 멘션했는지 로그로 남긴다
- **에러 트래킹**: Sentry 무료 티어로 예외를 자동 수집 (선택 사항, 여유 있으면 추가)

현재 남기는 로그는 다음과 같다.

```
[scheduler] attendance-check scheduled: "50 8 * * 1-5" (Asia/Seoul)   ← 기동 시
[attendance] run finished: { announcedDepartments: [...], failedDepartments: [...], skippedReason: null }
[report] report from U…: { delivered: true, usedFallback: false }
```

실패 경로는 로그와 별개로 관리자 채널에도 알림이 가므로, 로그를 보지 않아도 실패를 놓치지 않는다.

단순히 "떠 있다"만 확인하면 의미가 없다. **의도한 일이 실제로 일어났는지까지 로그로 남겨야 진짜 관측이다.**

---

## 환경 변수 관리

```
.env.example    ← 저장소에 커밋 (키 이름만, 값은 비움)
.env            ← .gitignore에 등록. 절대 커밋 금지
```

```bash
# .env.example
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
ADMIN_CHANNEL_ID=
REPORT_CHANNEL_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_ID=
ANTHROPIC_API_KEY=
# ATTENDANCE_CRON=   (선택)
```

`GOOGLE_PRIVATE_KEY`는 개행 문자가 포함되어 있어 `.env`에 그대로 넣으면 깨지기 쉽다.
그래서 한 줄로 저장하고 `src/config/env.ts`에서 `\n`을 실제 개행으로 치환한다.

---

## 배포 전 최종 체크리스트

- [ ] `.env`가 `.gitignore`에 있다
- [ ] 커밋 히스토리에 비밀키가 없다 (`git log -p | grep -i secret`)
- [ ] CI가 전부 초록불이다
- [ ] 프로덕션 빌드가 로컬에서 정상 기동하고 Slack에 연결된다
- [ ] 스케줄러가 배포 환경의 타임존 기준으로도 08:50(Asia/Seoul)에 맞게 실행된다
- [ ] 에러 응답/로그에 API 키 등 민감정보가 노출되지 않는다
- [ ] README의 실행 방법대로 따라 하면 실제로 동작한다
