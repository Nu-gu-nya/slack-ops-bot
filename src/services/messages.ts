import type { AttendanceRecord } from '../types/domain.js';
import type { InvalidRow } from './attendance.service.js';

// User-facing Slack copy lives here so wording rules from docs/UIUX.md
// ("cause + next action", consistent terms) can be checked in one place.

export const CHECKIN_REACTION = 'white_check_mark';

export function mention(userId: string): string {
  return `<@${userId}>`;
}

export function attendanceAnnouncement(targets: readonly AttendanceRecord[]): string {
  const mentions = targets.map((target) => mention(target.slackUserId)).join(' ');
  return `${mentions} 오늘 근무 예정입니다. 출근하셨으면 이 메시지 스레드에 댓글로 알려주세요.`;
}

export function sheetLoadFailed(today: string, reason: string): string {
  return [
    `:warning: ${today} 출근 알림을 보내지 못했습니다. 구글 시트를 불러오지 못했습니다.`,
    `사유: ${reason}`,
    '서비스 계정에 시트가 공유되어 있는지, GOOGLE_* 환경 변수가 맞는지 확인해주세요.',
  ].join('\n');
}

export function noTargetsToday(today: string): string {
  return `:information_source: ${today} 시트에 등록된 근무자가 없어 출근 알림을 보내지 않았습니다.`;
}

export function missingSlackIdWarning(records: readonly AttendanceRecord[]): string {
  const names = records.map((record) => `${record.name}(${record.department})`).join(', ');
  return `:warning: Slack 사용자 ID가 비어 있어 멘션하지 못한 사람: ${names}\n시트의 Slack 사용자 ID 열을 채워주세요.`;
}

export function invalidRowsWarning(rows: readonly InvalidRow[]): string {
  const lines = rows.map((row) => `• ${row.rowNumber}행: ${row.reason}`);
  return [':warning: 시트에서 읽지 못한 행이 있어 건너뛰었습니다.', ...lines].join('\n');
}

export function unmappedDepartmentWarning(department: string, names: readonly string[]): string {
  return `:warning: 부서 "${department}"에 연결된 채널이 없어 ${names.join(', ')}님에게 알림을 보내지 못했습니다.\nsrc/config/departments.ts에 채널을 추가해주세요.`;
}

export function announcementFailed(department: string, reason: string): string {
  return `:x: 부서 "${department}" 채널에 출근 알림을 보내지 못했습니다 (재시도 후 실패).\n사유: ${reason}\n봇이 그 채널에 초대되어 있는지 확인해주세요.`;
}

export function reportPostFailed(userId: string, reason: string): string {
  return `:x: ${mention(userId)}님의 업무 보고를 매니저 채널에 전달하지 못했습니다 (재시도 후 실패).\n사유: ${reason}`;
}

export const SUMMARY_FAILED_NOTE = '(자동 요약 실패, 원문 표시)';

export function reportDigest(params: {
  userId: string;
  date: string;
  formattedReport: string;
  summary: string | null;
}): string {
  const header = `*${params.date} 업무 보고* — ${mention(params.userId)}`;
  if (params.summary === null) {
    return [header, SUMMARY_FAILED_NOTE, '```', params.formattedReport, '```'].join('\n');
  }
  return [header, params.summary, '', '*원문*', '```', params.formattedReport, '```'].join('\n');
}
