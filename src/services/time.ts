export const SEOUL_TIMEZONE = 'Asia/Seoul';

// 'en-CA' formats dates as YYYY-MM-DD. Formatting through Intl with an explicit
// time zone keeps "today" correct even when the server runs in UTC.
const SEOUL_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: SEOUL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayInSeoul(now: Date): string {
  return SEOUL_DATE_FORMAT.format(now);
}

/**
 * Accepts the date shapes Google Sheets produces depending on locale
 * ('2026-10-16', '2026. 10. 16', '2026/10/16') and returns 'YYYY-MM-DD'.
 * Returns null instead of throwing so one bad row cannot abort the whole run.
 */
export function normalizeDate(raw: string): string | null {
  const match = /^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/.exec(raw.trim());
  if (match === null) {
    return null;
  }
  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    return null;
  }
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** '9:00' → '09:00'. Returns null for anything that is not a valid clock time. */
export function normalizeTime(raw: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (match === null) {
    return null;
  }
  const [, hour, minute] = match;
  if (hour === undefined || minute === undefined) {
    return null;
  }
  if (Number(hour) > 23 || Number(minute) > 59) {
    return null;
  }
  return `${hour.padStart(2, '0')}:${minute}`;
}
