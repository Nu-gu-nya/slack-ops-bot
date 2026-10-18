import type { ReportEntry } from '../types/domain.js';
import type { Messenger } from './messenger.js';
import * as messages from './messages.js';
import { formatReport } from './report.service.js';
import { errorMessage, withOneRetry } from './retry.js';
import { summarizeReport, type Summarizer } from './summarize.service.js';

export interface ReportDeliveryDeps {
  summarizer: Summarizer;
  messenger: Messenger;
  reportChannelId: string;
}

export interface ReportDeliveryResult {
  delivered: boolean;
  usedFallback: boolean;
}

/**
 * Formats, summarises and posts a report to the manager channel.
 * Summary failure only changes how the digest looks; delivery failure is the
 * one case that can lose a report, so that is escalated to the admin channel.
 */
export async function deliverReport(
  deps: ReportDeliveryDeps,
  params: { userId: string; date: string; entries: readonly ReportEntry[] },
): Promise<ReportDeliveryResult> {
  const formattedReport = formatReport(params.entries);
  const summary = await summarizeReport(deps.summarizer, formattedReport);

  const digest = messages.reportDigest({
    userId: params.userId,
    date: params.date,
    formattedReport,
    summary: summary.usedFallback ? null : summary.text,
  });

  try {
    await withOneRetry(() => deps.messenger.post(deps.reportChannelId, digest));
    return { delivered: true, usedFallback: summary.usedFallback };
  } catch (error) {
    console.error(`[report] failed to deliver report from ${params.userId}:`, error);
    try {
      // Include the original so the report survives even when the manager channel is unreachable.
      await deps.messenger.notifyAdmin(
        `${messages.reportPostFailed(params.userId, errorMessage(error))}\n\`\`\`\n${formattedReport}\n\`\`\``,
      );
    } catch (adminError) {
      console.error('[report] failed to notify admin:', adminError);
    }
    return { delivered: false, usedFallback: summary.usedFallback };
  }
}
