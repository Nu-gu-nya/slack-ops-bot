/**
 * Department name (exactly as written in the sheet's 부서 column) → Slack channel ID.
 *
 * Channel IDs are not secrets, so they live in code rather than .env
 * (docs/ARCHITECTURE.md). A department missing here is reported to the admin
 * channel instead of being silently skipped.
 *
 * Find a channel ID in Slack: open the channel → click its name → the ID (C…)
 * is at the bottom of the "About" tab. The bot must be invited to each channel.
 */
export const DEPARTMENT_CHANNELS: Readonly<Record<string, string>> = {
  개발: 'C0C3JN00CRG',
};

/** Tab name and columns A–G (날짜, 부서, 이름, Slack 사용자 ID, 상태, 시작, 종료), skipping the header row. */
export const ATTENDANCE_SHEET_RANGE = '근태!A2:G';
