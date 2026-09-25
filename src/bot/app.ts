import { App } from '@slack/bolt';

import { env } from '../config/env.js';

// 슬래시 커맨드 이름은 Slack 앱 설정(slack-app-manifest.yml)과 반드시 같아야 한다.
// 양쪽이 어긋나면 조용히 아무 반응도 없으므로 상수로 빼서 한곳에서 관리한다.
const REPORT_COMMAND = '/report';

const app = new App({
  token: env.slackBotToken,
  appToken: env.slackAppToken,
  socketMode: true,
});

app.command(REPORT_COMMAND, async ({ ack, respond }) => {
  // Slack은 3초 안에 응답받지 못하면 사용자에게 실패로 표시한다.
  // 그래서 실제 처리보다 먼저 "받았다"는 신호부터 보낸다.
  await ack();

  await respond('업무 보고 기능은 아직 준비 중입니다.');
});

async function main(): Promise<void> {
  await app.start();
  console.log('⚡ Ops Bot 실행 중 (Socket Mode)');
}

// 시작 단계에서 실패하면(토큰 오류, 네트워크 불가) 조용히 살아 있는 것보다
// 즉시 죽고 로그를 남기는 편이 낫다. 죽은 줄 알아야 고칠 수 있다.
main().catch((error: unknown) => {
  console.error('앱 시작 실패:', error);
  process.exit(1);
});
