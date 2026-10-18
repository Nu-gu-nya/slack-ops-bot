import { isReportEntryStatus, type ReportEntry } from '../types/domain.js';
import { normalizeTime } from './time.js';

/** One modal row as typed by the user, before validation. Slack-independent so it can be unit tested. */
export interface RawReportRow {
  time: string | null;
  task: string | null;
  status: string | null;
}

export type ReportField = keyof RawReportRow;

export interface ReportFieldError {
  rowIndex: number;
  field: ReportField;
  message: string;
}

export type ReportValidation =
  | { ok: true; entries: ReportEntry[] }
  | { ok: false; errors: ReportFieldError[] };

const FIELD_LABEL: Record<ReportField, string> = {
  time: '시간',
  task: '업무',
  status: '상태',
};

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === '';
}

/**
 * Rows left completely empty are simply unused (the modal shows several rows up
 * front). A row that is only partly filled is an error, pointed at the exact
 * missing field, so the user is never left guessing what was rejected.
 */
export function validateReportRows(rows: readonly RawReportRow[]): ReportValidation {
  const entries: ReportEntry[] = [];
  const errors: ReportFieldError[] = [];

  rows.forEach((row, rowIndex) => {
    const fields: ReportField[] = ['time', 'task', 'status'];
    const blankFields = fields.filter((field) => isBlank(row[field]));

    if (blankFields.length === fields.length) {
      return;
    }
    for (const field of blankFields) {
      errors.push({ rowIndex, field, message: `${FIELD_LABEL[field]}을(를) 입력해주세요.` });
    }
    if (blankFields.length > 0) {
      return;
    }

    const time = normalizeTime(row.time ?? '');
    if (time === null) {
      errors.push({ rowIndex, field: 'time', message: '시간 형식이 올바르지 않습니다 (예: 09:00).' });
      return;
    }
    const status = (row.status ?? '').trim();
    if (!isReportEntryStatus(status)) {
      errors.push({ rowIndex, field: 'status', message: '상태를 목록에서 선택해주세요.' });
      return;
    }
    entries.push({ time, task: (row.task ?? '').trim(), status });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (entries.length === 0) {
    return {
      ok: false,
      errors: [{ rowIndex: 0, field: 'time', message: '업무를 한 줄 이상 입력해주세요.' }],
    };
  }
  return { ok: true, entries };
}

/** "09:00 A업무 (완료)" per line, sorted by time (docs/PLANNING.md US-07). */
export function formatReport(entries: readonly ReportEntry[]): string {
  return [...entries]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((entry) => `${entry.time} ${entry.task} (${entry.status})`)
    .join('\n');
}
