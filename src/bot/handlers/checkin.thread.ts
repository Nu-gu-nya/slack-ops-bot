import type { App } from '@slack/bolt';

import type { CheckinStore } from '../../services/checkin.service.js';
import { CHECKIN_REACTION } from '../../services/messages.js';

/** Slack's error code when the reaction is already there; harmless, so not worth logging as a failure. */
const ALREADY_REACTED = 'already_reacted';

export function registerCheckinHandler(app: App, checkins: CheckinStore): void {
  app.message(async ({ message, client, logger }) => {
    // Edits, deletions, joins etc. arrive with a subtype. Only plain user messages count as replies.
    if (message.subtype !== undefined) {
      return;
    }
    // A top-level message has no thread_ts; a thread parent has thread_ts === ts.
    if (message.thread_ts === undefined || message.thread_ts === message.ts) {
      return;
    }

    const result = checkins.recordReply(message.channel, message.thread_ts, message.user);
    if (result !== 'confirmed') {
      // Non-targets, repeat replies and unrelated threads are ignored on purpose
      // (docs/UIUX.md): reacting to every reply would just be noise.
      return;
    }

    try {
      await client.reactions.add({
        channel: message.channel,
        timestamp: message.ts,
        name: CHECKIN_REACTION,
      });
    } catch (error) {
      if (isSlackErrorCode(error, ALREADY_REACTED)) {
        return;
      }
      logger.error(`[checkin] failed to add reaction for ${message.user}:`, error);
    }
  });
}

function isSlackErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return false;
  }
  const { data } = error;
  return typeof data === 'object' && data !== null && 'error' in data && data.error === code;
}
