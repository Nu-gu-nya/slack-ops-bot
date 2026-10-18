import cron from 'node-cron';

import { SEOUL_TIMEZONE } from '../services/time.js';

/**
 * Registers a job on Seoul time. The explicit timezone matters because the
 * deployed server will most likely run in UTC, where 08:50 would be 17:50 KST.
 */
export function scheduleDaily(expression: string, name: string, job: () => Promise<unknown>): void {
  if (!cron.validate(expression)) {
    throw new Error(`Invalid cron expression for ${name}: "${expression}"`);
  }

  cron.schedule(
    expression,
    async () => {
      try {
        await job();
      } catch (error) {
        // The job is expected to report its own failures; this only guards
        // against a bug turning into an unhandled rejection that kills the bot.
        console.error(`[scheduler] ${name} threw unexpectedly:`, error);
      }
    },
    { timezone: SEOUL_TIMEZONE, name, noOverlap: true },
  );

  console.log(`[scheduler] ${name} scheduled: "${expression}" (${SEOUL_TIMEZONE})`);
}
