import type { App } from '@slack/bolt';

import { buildReportView } from './report.view.js';

// Must match the command in slack-app-manifest.yml. A mismatch fails silently
// (Slack simply never delivers the command), so it is kept as a single constant.
export const REPORT_COMMAND = '/report';

export function registerReportCommand(app: App): void {
  app.command(REPORT_COMMAND, async ({ ack, body, client, respond, logger }) => {
    // Slack shows a failure if it gets no ack within 3 seconds, so acknowledge first.
    await ack();

    try {
      // trigger_id expires about 3 seconds after the command, so the modal is opened right away.
      await client.views.open({ trigger_id: body.trigger_id, view: buildReportView() });
    } catch (error) {
      logger.error('[report] failed to open modal:', error);
      await respond('업무 보고 창을 열지 못했습니다. 잠시 후 /report를 다시 실행해주세요.');
    }
  });
}
