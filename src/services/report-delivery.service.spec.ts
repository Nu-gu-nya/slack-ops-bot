import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ReportEntry } from '../types/domain.js';
import type { Messenger } from './messenger.js';
import { SUMMARY_FAILED_NOTE } from './messages.js';
import { deliverReport } from './report-delivery.service.js';
import { summarizeReport, type Summarizer } from './summarize.service.js';

const ENTRIES: ReportEntry[] = [{ time: '09:00', task: 'A업무', status: '완료' }];
const FORMATTED = '09:00 A업무 (완료)';

const failingSummarizer: Summarizer = {
  summarize: async () => {
    throw new Error('timeout');
  },
};
const okSummarizer: Summarizer = { summarize: async () => 'A업무를 완료했습니다.' };

function recordingMessenger(options: { failPost?: boolean } = {}) {
  const posts: string[] = [];
  const adminMessages: string[] = [];
  const messenger: Messenger = {
    async post(_channel, text) {
      if (options.failPost === true) {
        throw new Error('channel_not_found');
      }
      posts.push(text);
      return 'ts';
    },
    async notifyAdmin(text) {
      adminMessages.push(text);
    },
  };
  return { messenger, posts, adminMessages };
}

describe('업무 보고 요약', () => {
  it('Claude API가 실패하면 원문 포맷을 그대로 반환한다', async () => {
    const result = await summarizeReport(failingSummarizer, FORMATTED);
    assert.equal(result.usedFallback, true);
    assert.equal(result.text, FORMATTED);
  });

  it('성공하면 요약을 반환한다', async () => {
    const result = await summarizeReport(okSummarizer, FORMATTED);
    assert.deepEqual(result, { text: 'A업무를 완료했습니다.', usedFallback: false });
  });
});

describe('업무 보고 전달', () => {
  const params = { userId: 'U1', date: '2026-10-16', entries: ENTRIES };

  it('요약에 성공하면 요약과 원문을 함께 매니저 채널에 보낸다', async () => {
    const { messenger, posts } = recordingMessenger();
    const result = await deliverReport({ summarizer: okSummarizer, messenger, reportChannelId: 'C-M' }, params);

    assert.deepEqual(result, { delivered: true, usedFallback: false });
    assert.match(posts[0] ?? '', /A업무를 완료했습니다/);
    assert.ok(posts[0]?.includes(FORMATTED));
  });

  it('요약이 실패해도 원문은 실패 표기와 함께 반드시 전달된다', async () => {
    const { messenger, posts } = recordingMessenger();
    const result = await deliverReport({ summarizer: failingSummarizer, messenger, reportChannelId: 'C-M' }, params);

    assert.deepEqual(result, { delivered: true, usedFallback: true });
    assert.ok(posts[0]?.includes(SUMMARY_FAILED_NOTE));
    assert.ok(posts[0]?.includes(FORMATTED));
  });

  it('매니저 채널 전송이 실패하면 원문을 담아 관리자에게 알린다', async () => {
    const { messenger, adminMessages } = recordingMessenger({ failPost: true });
    const result = await deliverReport({ summarizer: okSummarizer, messenger, reportChannelId: 'C-M' }, params);

    assert.equal(result.delivered, false);
    assert.ok(adminMessages[0]?.includes(FORMATTED));
  });
});
