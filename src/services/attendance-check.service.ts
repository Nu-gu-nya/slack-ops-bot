import type { AttendanceRecord } from '../types/domain.js';
import {
  groupByDepartment,
  parseAttendanceRows,
  selectTodayTargets,
} from './attendance.service.js';
import type { CheckinStore } from './checkin.service.js';
import * as messages from './messages.js';
import { errorMessage, withOneRetry } from './retry.js';
import type { AttendanceSheetReader } from './sheets.service.js';

/** Slack operations the run needs. Abstracted so the run is testable without Slack. */
export interface Messenger {
  /** Returns the posted message's ts, which identifies its thread. */
  post(channel: string, text: string): Promise<string>;
  notifyAdmin(text: string): Promise<void>;
}

export interface AttendanceCheckDeps {
  reader: AttendanceSheetReader;
  messenger: Messenger;
  checkins: CheckinStore;
  departmentChannels: Readonly<Record<string, string>>;
}

export interface AttendanceCheckResult {
  announcedDepartments: string[];
  failedDepartments: string[];
  skippedReason: 'sheet-error' | 'no-targets' | null;
}

/**
 * The daily 08:50 job: read the sheet, mention today's workers per department,
 * and tell the admin about anything that could not be delivered.
 * Never throws — every failure path ends in an admin notification instead,
 * because a scheduled job that fails silently is invisible (docs/UIUX.md).
 */
export async function runAttendanceCheck(
  deps: AttendanceCheckDeps,
  today: string,
): Promise<AttendanceCheckResult> {
  const { reader, messenger, checkins, departmentChannels } = deps;
  const result: AttendanceCheckResult = {
    announcedDepartments: [],
    failedDepartments: [],
    skippedReason: null,
  };

  checkins.reset();

  let rows: string[][];
  try {
    rows = await reader.readRows();
  } catch (error) {
    console.error('[attendance] failed to read sheet:', error);
    await safeNotifyAdmin(messenger, messages.sheetLoadFailed(today, errorMessage(error)));
    result.skippedReason = 'sheet-error';
    return result;
  }

  const { records, invalidRows } = parseAttendanceRows(rows);
  if (invalidRows.length > 0) {
    await safeNotifyAdmin(messenger, messages.invalidRowsWarning(invalidRows));
  }

  const { targets, missingSlackId } = selectTodayTargets(records, today);
  if (missingSlackId.length > 0) {
    await safeNotifyAdmin(messenger, messages.missingSlackIdWarning(missingSlackId));
  }

  if (targets.length === 0) {
    // Only notify "nobody today" when nobody was scheduled at all; if people were
    // scheduled but lacked IDs, the warning above already explains the silence.
    if (missingSlackId.length === 0) {
      await safeNotifyAdmin(messenger, messages.noTargetsToday(today));
    }
    result.skippedReason = 'no-targets';
    return result;
  }

  for (const [department, members] of groupByDepartment(targets)) {
    const delivered = await announceDepartment(deps, department, members);
    (delivered ? result.announcedDepartments : result.failedDepartments).push(department);
  }

  return result;
}

async function announceDepartment(
  deps: AttendanceCheckDeps,
  department: string,
  members: readonly AttendanceRecord[],
): Promise<boolean> {
  const { messenger, checkins, departmentChannels } = deps;
  const channel = departmentChannels[department];

  if (channel === undefined) {
    await safeNotifyAdmin(
      messenger,
      messages.unmappedDepartmentWarning(department, members.map((member) => member.name)),
    );
    return false;
  }

  try {
    const ts = await withOneRetry(() =>
      messenger.post(channel, messages.attendanceAnnouncement(members)),
    );
    checkins.register(channel, ts, members.map((member) => member.slackUserId));
    return true;
  } catch (error) {
    console.error(`[attendance] failed to post for department "${department}":`, error);
    await safeNotifyAdmin(messenger, messages.announcementFailed(department, errorMessage(error)));
    return false;
  }
}

/**
 * The admin channel is the last line of reporting. If even that fails there is
 * nobody left to tell, so log and keep going rather than abort the other departments.
 */
async function safeNotifyAdmin(messenger: Messenger, text: string): Promise<void> {
  try {
    await messenger.notifyAdmin(text);
  } catch (error) {
    console.error('[attendance] failed to notify admin:', error);
  }
}
