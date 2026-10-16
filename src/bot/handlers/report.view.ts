import type { ViewOutput, types } from '@slack/bolt';

import { REPORT_ENTRY_STATUS } from '../../types/domain.js';
import type { RawReportRow, ReportField, ReportFieldError } from '../../services/report.service.js';

export const REPORT_VIEW_CALLBACK_ID = 'report_submit';

// Showing every row up front tells the user how many entries fit without
// any "add row" interaction (docs/UIUX.md).
const REPORT_ROW_COUNT = 5;
const ACTION_ID = 'value';

function blockId(rowIndex: number, field: ReportField): string {
  return `row${rowIndex}_${field}`;
}

function rowBlocks(rowIndex: number): types.KnownBlock[] {
  // Slack itself enforces the first row, so an empty submission never reaches the server.
  const optional = rowIndex > 0;
  const label = `${rowIndex + 1}`;
  return [
    {
      type: 'input',
      block_id: blockId(rowIndex, 'time'),
      optional,
      label: { type: 'plain_text', text: `${label}. 시간` },
      element: { type: 'timepicker', action_id: ACTION_ID },
    },
    {
      type: 'input',
      block_id: blockId(rowIndex, 'task'),
      optional,
      label: { type: 'plain_text', text: `${label}. 업무` },
      element: { type: 'plain_text_input', action_id: ACTION_ID },
    },
    {
      type: 'input',
      block_id: blockId(rowIndex, 'status'),
      optional,
      label: { type: 'plain_text', text: `${label}. 상태` },
      element: {
        type: 'static_select',
        action_id: ACTION_ID,
        options: REPORT_ENTRY_STATUS.map((status) => ({
          text: { type: 'plain_text', text: status },
          value: status,
        })),
      },
    },
    { type: 'divider' },
  ];
}

export function buildReportView(): types.ModalView {
  const blocks: types.KnownBlock[] = [];
  for (let rowIndex = 0; rowIndex < REPORT_ROW_COUNT; rowIndex += 1) {
    blocks.push(...rowBlocks(rowIndex));
  }
  return {
    type: 'modal',
    callback_id: REPORT_VIEW_CALLBACK_ID,
    title: { type: 'plain_text', text: '업무 보고' },
    submit: { type: 'plain_text', text: '제출' },
    close: { type: 'plain_text', text: '취소' },
    blocks,
  };
}

/** Pulls the raw rows out of Slack's nested view state; validation happens in the service. */
export function readReportRows(view: ViewOutput): RawReportRow[] {
  const values = view.state.values;
  const rows: RawReportRow[] = [];
  for (let rowIndex = 0; rowIndex < REPORT_ROW_COUNT; rowIndex += 1) {
    rows.push({
      time: values[blockId(rowIndex, 'time')]?.[ACTION_ID]?.selected_time ?? null,
      task: values[blockId(rowIndex, 'task')]?.[ACTION_ID]?.value ?? null,
      status: values[blockId(rowIndex, 'status')]?.[ACTION_ID]?.selected_option?.value ?? null,
    });
  }
  return rows;
}

/** Maps service errors back to block IDs so Slack shows each message under its own field. */
export function toViewErrors(errors: readonly ReportFieldError[]): Record<string, string> {
  const viewErrors: Record<string, string> = {};
  for (const error of errors) {
    viewErrors[blockId(error.rowIndex, error.field)] = error.message;
  }
  return viewErrors;
}
