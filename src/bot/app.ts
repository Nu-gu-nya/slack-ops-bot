import { App } from '@slack/bolt';

import { ATTENDANCE_SHEET_RANGE, DEPARTMENT_CHANNELS } from '../config/departments.js';
import { env } from '../config/env.js';
import { runAttendanceCheck } from '../services/attendance-check.service.js';
import { CheckinStore } from '../services/checkin.service.js';
import { createSheetsReader } from '../services/sheets.service.js';
import { createClaudeSummarizer } from '../services/summarize.service.js';
import { todayInSeoul } from '../services/time.js';
import { registerCheckinHandler } from './handlers/checkin.thread.js';
import { registerReportCommand } from './handlers/report.command.js';
import { registerReportSubmit } from './handlers/report.submit.js';
import { scheduleDaily } from './scheduler.js';
import { createSlackMessenger } from './slack-messenger.js';

const app = new App({
  token: env.slackBotToken,
  appToken: env.slackAppToken,
  socketMode: true,
});

const messenger = createSlackMessenger(app.client, env.adminChannelId);

// Bot A — attendance announcement and thread check-in
const checkins = new CheckinStore();
const attendanceDeps = {
  reader: createSheetsReader({
    serviceAccountEmail: env.googleServiceAccountEmail,
    privateKey: env.googlePrivateKey,
    spreadsheetId: env.googleSheetId,
    range: ATTENDANCE_SHEET_RANGE,
  }),
  messenger,
  checkins,
  departmentChannels: DEPARTMENT_CHANNELS,
};
registerCheckinHandler(app, checkins);

// Bot B — /report modal and summarised digest
registerReportCommand(app);
registerReportSubmit(app, {
  summarizer: createClaudeSummarizer(env.anthropicApiKey),
  messenger,
  reportChannelId: env.reportChannelId,
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
