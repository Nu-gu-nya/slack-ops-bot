/**
 * Environment variable loading and validation.
 *
 * Checked once at startup so a missing value kills the process immediately
 * (fail fast). Discovering `undefined` later, in the middle of a Slack call or
 * an 08:50 job, makes the cause far harder to trace.
 */

function requireEnv(key: string): string {
  const value = process.env[key];

  // Treat '' as missing too: leaving a key with no value in .env is a common mistake.
  if (value === undefined || value === '') {
    throw new Error(`Environment variable ${key} is empty. Check your .env file.`);
  }

  return value;
}

function optionalEnv(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
}

/** Weekdays at 08:50 (docs/ARCHITECTURE.md). Overridable so the job can be triggered sooner in testing. */
const DEFAULT_ATTENDANCE_CRON = '50 8 * * 1-5';

export const env = {
  slackBotToken: requireEnv('SLACK_BOT_TOKEN'),
  slackAppToken: requireEnv('SLACK_APP_TOKEN'),
  adminChannelId: requireEnv('ADMIN_CHANNEL_ID'),

  googleServiceAccountEmail: requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
  // A PEM key spans multiple lines, but .env values are single-line, so the key
  // is stored with literal "\n" sequences and restored to real newlines here.
  googlePrivateKey: requireEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  googleSheetId: requireEnv('GOOGLE_SHEET_ID'),

  attendanceCron: optionalEnv('ATTENDANCE_CRON', DEFAULT_ATTENDANCE_CRON),
};
