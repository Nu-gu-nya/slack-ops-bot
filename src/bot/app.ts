import { App } from '@slack/bolt';

import { ATTENDANCE_SHEET_RANGE, DEPARTMENT_CHANNELS } from '../config/departments.js';
import { env } from '../config/env.js';
import { runAttendanceCheck } from '../services/attendance-check.service.js';
import { CheckinStore } from '../services/checkin.service.js';
import { createSheetsReader } from '../services/sheets.service.js';
import { todayInSeoul } from '../services/time.js';
import { registerCheckinHandler } from './handlers/checkin.thread.js';
import { scheduleDaily } from './scheduler.js';
import { createSlackMessenger } from './slack-messenger.js';

// Must match the command in slack-app-manifest.yml. A mismatch fails silently
// (Slack simply never delivers the command), so it is kept as a single constant.
const REPORT_COMMAND = '/report';

const app = new App({
  token: env.slackBotToken,
  appToken: env.slackAppToken,
  socketMode: true,
});

const checkins = new CheckinStore();
const attendanceDeps = {
  reader: createSheetsReader({
    serviceAccountEmail: env.googleServiceAccountEmail,
    privateKey: env.googlePrivateKey,
    spreadsheetId: env.googleSheetId,
    range: ATTENDANCE_SHEET_RANGE,
  }),
  messenger: createSlackMessenger(app.client, env.adminChannelId),
  checkins,
  departmentChannels: DEPARTMENT_CHANNELS,
};

registerCheckinHandler(app, checkins);

app.command(REPORT_COMMAND, async ({ ack, respond }) => {
  // Slack shows a failure if it gets no ack within 3 seconds, so acknowledge first.
  await ack();

  await respond('업무 보고 기능은 아직 준비 중입니다.');
});

async function main(): Promise<void> {
  await app.start();
  console.log('⚡ Ops Bot is running (Socket Mode)');

  scheduleDaily(env.attendanceCron, 'attendance-check', async () => {
    const result = await runAttendanceCheck(attendanceDeps, todayInSeoul(new Date()));
    console.log('[attendance] run finished:', result);
  });
}

// If startup fails (bad token, no network), dying loudly beats staying up
// half-working: a process that is visibly down gets fixed.
main().catch((error: unknown) => {
  console.error('Failed to start app:', error);
  process.exit(1);
});
