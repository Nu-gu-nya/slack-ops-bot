import type { webApi } from '@slack/bolt';

import type { Messenger } from '../services/attendance-check.service.js';

export function createSlackMessenger(client: webApi.WebClient, adminChannelId: string): Messenger {
  return {
    async post(channel: string, text: string): Promise<string> {
      const response = await client.chat.postMessage({ channel, text });
      // `ts` is the thread key for check-ins; without it replies could never be matched.
      if (response.ts === undefined) {
        throw new Error('Slack did not return a message ts');
      }
      return response.ts;
    },

    async notifyAdmin(text: string): Promise<void> {
      await client.chat.postMessage({ channel: adminChannelId, text });
    },
  };
}
