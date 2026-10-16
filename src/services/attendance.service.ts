import {
  ABSENT_STATUS,
  isAttendanceStatus,
  type AttendanceRecord,
} from '../types/domain.js';
import { normalizeDate, normalizeTime } from './time.js';

/** Column order of the attendance sheet. Changing the sheet layout means changing only this. */
const COLUMN = {
  date: 0,
  department: 1,
  name: 2,
  slackUserId: 3,
  status: 4,
  startTime: 5,
  endTime: 6,
} as const;

/** Data starts on row 2 because row 1 is the header. Used to report sheet row numbers to humans. */
export const FIRST_DATA_ROW = 2;

export interface InvalidRow {
  rowNumber: number;
  reason: string;
}

export interface ParsedRows {
  records: AttendanceRecord[];
  invalidRows: InvalidRow[];
}

export interface TodayTargets {
  targets: AttendanceRecord[];
  /** Scheduled today but without a Slack user ID, so they cannot be mentioned. */
  missingSlackId: AttendanceRecord[];
}

function cell(row: readonly string[], index: number): string {
  return (row[index] ?? '').trim();
}

/**
 * Converts raw sheet rows into domain records. The Sheets API returns loosely
 * typed strings (and trims trailing empty cells), so this is the single place
 * where untrusted input becomes `AttendanceRecord`.
 */
export function parseAttendanceRows(rows: readonly (readonly string[])[]): ParsedRows {
  const records: AttendanceRecord[] = [];
  const invalidRows: InvalidRow[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + FIRST_DATA_ROW;

    // Fully empty rows are common in hand-edited sheets; they are not errors.
    if (row.every((value) => value.trim() === '')) {
      return;
    }

    const date = normalizeDate(cell(row, COLUMN.date));
    if (date === null) {
      invalidRows.push({ rowNumber, reason: `날짜 형식 오류: "${cell(row, COLUMN.date)}"` });
      return;
    }

    const name = cell(row, COLUMN.name);
    const department = cell(row, COLUMN.department);
    if (name === '' || department === '') {
      invalidRows.push({ rowNumber, reason: '이름 또는 부서가 비어 있음' });
      return;
    }

    const status = cell(row, COLUMN.status);
    if (!isAttendanceStatus(status)) {
      invalidRows.push({ rowNumber, reason: `알 수 없는 상태: "${status}"` });
      return;
    }

    records.push({
      date,
      department,
      name,
      slackUserId: cell(row, COLUMN.slackUserId),
      status,
      startTime: normalizeTime(cell(row, COLUMN.startTime)),
      endTime: normalizeTime(cell(row, COLUMN.endTime)),
    });
  });

  return { records, invalidRows };
}

export function selectTodayTargets(records: readonly AttendanceRecord[], today: string): TodayTargets {
  const scheduled = records.filter(
    (record) => record.date === today && record.status !== ABSENT_STATUS,
  );

  return {
    targets: scheduled.filter((record) => record.slackUserId !== ''),
    missingSlackId: scheduled.filter((record) => record.slackUserId === ''),
  };
}

export function groupByDepartment(
  records: readonly AttendanceRecord[],
): Map<string, AttendanceRecord[]> {
  const groups = new Map<string, AttendanceRecord[]>();
  for (const record of records) {
    const group = groups.get(record.department);
    if (group === undefined) {
      groups.set(record.department, [record]);
    } else {
      group.push(record);
    }
  }
  return groups;
}
