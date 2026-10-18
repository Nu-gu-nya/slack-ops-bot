import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runAttendanceCheck, type AttendanceCheckDeps } from './attendance-check.service.js';
import type { Messenger } from './messenger.js';
import { CheckinStore } from './checkin.service.js';

const TODAY = '2026-09-14';

interface FakeMessenger extends Messenger {
  posts: { channel: string; text: string }[];
  adminMessages: string[];
}

function fakeMessenger(options: { failPostTimes?: number } = {}): FakeMessenger {
  let failuresLeft = options.failPostTimes ?? 0;
  const posts: { channel: string; text: string }[] = [];
  const adminMessages: string[] = [];
  return {
    posts,
    adminMessages,
    async post(channel, text) {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error('channel_not_found');
      }
      posts.push({ channel, text });
      return `ts-${posts.length}`;
    },
    async notifyAdmin(text) {
      adminMessages.push(text);
    },
  };
}

function deps(rows: string[][], messenger: Messenger, checkins = new CheckinStore()): AttendanceCheckDeps {
  return {
    reader: { readRows: async () => rows },
    messenger,
    checkins,
    departmentChannels: { CS: 'C-CS', PD: 'C-PD' },
  };
}

describe('출근 알림 실행', () => {
  it('부서별 채널에 대상자를 멘션하고, 답글 매칭을 위해 스레드를 등록한다', async () => {
    const messenger = fakeMessenger();
    const checkins = new CheckinStore();
    const result = await runAttendanceCheck(
      deps(
        [
          [TODAY, 'CS', 'James', 'U1', '출근'],
          [TODAY, 'PD', 'Kane', 'U2', '리모트'],
        ],
        messenger,
        checkins,
      ),
      TODAY,
    );

    assert.deepEqual(result.announcedDepartments.sort(), ['CS', 'PD']);
    assert.ok(messenger.posts.some((p) => p.channel === 'C-CS' && p.text.includes('<@U1>')));
    assert.equal(checkins.recordReply('C-CS', 'ts-1', 'U1'), 'confirmed');
    assert.deepEqual(messenger.adminMessages, []);
  });

  it('시트 조회가 실패하면 멘션을 보내지 않고 관리자에게 알린다', async () => {
    const messenger = fakeMessenger();
    const result = await runAttendanceCheck(
      {
        ...deps([], messenger),
        reader: {
          readRows: async () => {
            throw new Error('The caller does not have permission');
          },
        },
      },
      TODAY,
    );

    assert.equal(result.skippedReason, 'sheet-error');
    assert.deepEqual(messenger.posts, []);
    assert.equal(messenger.adminMessages.length, 1);
    assert.match(messenger.adminMessages[0] ?? '', /permission/);
  });

  it('오늘 근무자가 없으면 멘션 없이 관리자에게만 알린다', async () => {
    const messenger = fakeMessenger();
    const result = await runAttendanceCheck(deps([], messenger), TODAY);

    assert.equal(result.skippedReason, 'no-targets');
    assert.deepEqual(messenger.posts, []);
    assert.match(messenger.adminMessages[0] ?? '', /근무자가 없어/);
  });

  it('Slack ID가 빈 사람은 멘션에서 빠지고 관리자에게 경고가 간다', async () => {
    const messenger = fakeMessenger();
    await runAttendanceCheck(
      deps(
        [
          [TODAY, 'CS', 'James', 'U1', '출근'],
          [TODAY, 'CS', 'Denis', '', '출근'],
        ],
        messenger,
      ),
      TODAY,
    );

    assert.equal(messenger.posts.length, 1);
    assert.doesNotMatch(messenger.posts[0]?.text ?? '', /Denis/);
    assert.ok(messenger.adminMessages.some((m) => m.includes('Denis')));
  });

  it('채널 매핑이 없는 부서는 건너뛰고 관리자에게 알린다', async () => {
    const messenger = fakeMessenger();
    const result = await runAttendanceCheck(
      deps([[TODAY, '디자인', 'Mia', 'U5', '출근']], messenger),
      TODAY,
    );

    assert.deepEqual(result.failedDepartments, ['디자인']);
    assert.deepEqual(messenger.posts, []);
    assert.ok(messenger.adminMessages.some((m) => m.includes('디자인')));
  });

  it('발송이 한 번 실패하면 재시도해서 성공시킨다', async () => {
    const messenger = fakeMessenger({ failPostTimes: 1 });
    const result = await runAttendanceCheck(deps([[TODAY, 'CS', 'James', 'U1', '출근']], messenger), TODAY);

    assert.deepEqual(result.announcedDepartments, ['CS']);
    assert.deepEqual(messenger.adminMessages, []);
  });

  it('재시도까지 실패하면 관리자에게 알리고 다른 부서는 계속 보낸다', async () => {
    const messenger = fakeMessenger({ failPostTimes: 2 });
    const result = await runAttendanceCheck(
      deps(
        [
          [TODAY, 'CS', 'James', 'U1', '출근'],
          [TODAY, 'PD', 'Kane', 'U2', '출근'],
        ],
        messenger,
      ),
      TODAY,
    );

    assert.deepEqual(result.failedDepartments, ['CS']);
    assert.deepEqual(result.announcedDepartments, ['PD']);
    assert.ok(messenger.adminMessages.some((m) => m.includes('CS')));
  });
});
