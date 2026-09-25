/**
 * 환경 변수 로딩·검증.
 *
 * 앱이 뜨는 시점에 한 번만 검사해서, 값이 없으면 바로 죽는다(fail fast).
 * 실제 Slack 호출 시점에 undefined가 드러나면 원인 추적이 훨씬 어렵기 때문이다.
 */

function requireEnv(key: string): string {
  const value = process.env[key];

  // 빈 문자열('')도 없는 것으로 취급한다. .env에 키만 적고 값을 안 넣은 실수가 잦다.
  if (value === undefined || value === '') {
    throw new Error(`환경 변수 ${key}가 비어 있습니다. .env 파일을 확인하세요.`);
  }

  return value;
}

export const env = {
  slackBotToken: requireEnv('SLACK_BOT_TOKEN'),
  slackAppToken: requireEnv('SLACK_APP_TOKEN'),
};
