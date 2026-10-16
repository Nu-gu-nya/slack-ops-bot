// Status values are declared once as a const array so the union type and the
// runtime validation list can never drift apart.
export const ATTENDANCE_STATUS = ['출근', '결근', '리모트'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export const ABSENT_STATUS: AttendanceStatus = '결근';

export interface AttendanceRecord {
  date: string; // 'YYYY-MM-DD'
  department: string;
  name: string;
  slackUserId: string; // may be '' — the row is still valid, but cannot be mentioned
  status: AttendanceStatus;
  startTime: string | null; // 'HH:mm'
  endTime: string | null;
}

export const REPORT_ENTRY_STATUS = ['완료', '지연', '미착수'] as const;
export type ReportEntryStatus = (typeof REPORT_ENTRY_STATUS)[number];

export interface ReportEntry {
  time: string; // 'HH:mm'
  task: string;
  status: ReportEntryStatus;
}

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUS as readonly string[]).includes(value);
}

export function isReportEntryStatus(value: string): value is ReportEntryStatus {
  return (REPORT_ENTRY_STATUS as readonly string[]).includes(value);
}
