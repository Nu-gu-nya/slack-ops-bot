import type { App } from '@slack/bolt';

import { deliverReport, type ReportDeliveryDeps } from '../../services/report-delivery.service.js';
import { validateReportRows } from '../../services/report.service.js';
import { todayInSeoul } from '../../services/time.js';
import { readReportRows, REPORT_VIEW_CALLBACK_ID, toViewErrors } from './report.view.js';

export function registerReportSubmit(app: App, deps: ReportDeliveryDeps): void {
  app.view(REPORT_VIEW_CALLBACK_ID, async ({ ack, body, view }) => {
    const validation = validateReportRows(readReportRows(view));

    if (!validation.ok) {
      // Keeps the modal open with each message under the offending field.
      await ack({ response_action: 'errors', errors: toViewErrors(validation.errors) });
      return;
    }

    // Close the modal before calling Claude: the summary can take seconds,
    // well past Slack's 3-second ack deadline.
    await ack();

    const result = await deliverReport(deps, {
      userId: body.user.id,
      date: todayInSeoul(new Date()),
      entries: validation.entries,
    });
    console.log(`[report] report from ${body.user.id}:`, result);
  });
}
