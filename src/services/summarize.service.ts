import Anthropic from '@anthropic-ai/sdk';

/** Abstraction so the fallback behaviour can be tested without calling the API. */
export interface Summarizer {
  summarize(formattedReport: string): Promise<string>;
}

export interface SummaryResult {
  text: string;
  usedFallback: boolean;
}

/**
 * Summarises a report, falling back to the original text on any failure.
 * A failed summary must never mean a lost report (docs/PLANNING.md US-09),
 * so this function never throws.
 */
export async function summarizeReport(
  summarizer: Summarizer,
  formattedReport: string,
): Promise<SummaryResult> {
  try {
    const summary = await summarizer.summarize(formattedReport);
    return { text: summary, usedFallback: false };
  } catch (error) {
    console.error('[summarize] falling back to original report:', describeError(error));
    return { text: formattedReport, usedFallback: true };
  }
}

const SUMMARY_MODEL = 'claude-opus-5-5';
// A summary is a few lines; the cap mainly bounds cost if something goes wrong.
// It also has to leave room for the model's thinking, which counts toward it.
const SUMMARY_MAX_TOKENS = 4000;
// The modal has already closed when this runs, but a manager waiting on a digest
// should not wait minutes. One retry covers transient 429/5xx without dragging on.
const SUMMARY_TIMEOUT_MS = 20_000;
const SUMMARY_MAX_RETRIES = 1;

const SYSTEM_PROMPT = [
  "You summarise one team member's time-ordered daily work report for their manager.",
  'Each line is "HH:mm task (status)", where status is 완료 (done), 지연 (delayed) or 미착수 (not started).',
  'Write the summary in Korean, at most three short sentences, plain text suitable for Slack.',
  'Say what was completed, then call out anything 지연 or 미착수 so the manager can follow up.',
  'Only use information present in the report. Do not add a title or greeting.',
].join('\n');

export function createClaudeSummarizer(apiKey: string): Summarizer {
  const client = new Anthropic({
    apiKey,
    timeout: SUMMARY_TIMEOUT_MS,
    maxRetries: SUMMARY_MAX_RETRIES,
  });

  return {
    async summarize(formattedReport: string): Promise<string> {
      const response = await client.beta.messages.create({
        model: SUMMARY_MODEL,
        max_tokens: SUMMARY_MAX_TOKENS,
        // Summarising a few lines needs little reasoning; low effort keeps it fast and cheap.
        output_config: { effort: 'low' },
        // If the model declines for policy reasons, let the API retry on its default fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: formattedReport }],
      });

      if (response.stop_reason === 'refusal') {
        throw new Error('Claude declined to summarise the report');
      }

      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim();

      // An empty summary would be worse than the original, so treat it as a failure.
      if (text === '') {
        throw new Error(`Claude returned no text (stop_reason: ${response.stop_reason ?? 'unknown'})`);
      }
      return text;
    },
  };
}

/** Distinguishes the failure kinds in logs; the user-facing behaviour is the same fallback for all. */
function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'invalid ANTHROPIC_API_KEY';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'rate limited';
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return 'timed out';
  }
  if (error instanceof Anthropic.APIError) {
    return `API error ${String(error.status)}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
