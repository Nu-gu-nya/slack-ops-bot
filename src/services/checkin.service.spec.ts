import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { CheckinStore } from './checkin.service.js';

describe('스레드 답글 → 출근 확인 매칭', () => {
  let store: CheckinStore;

  beforeEach(() => {
    store = new CheckinStore();
    store.register('C1', '100.1', ['U1', 'U2']);
  });

  it('대상자 본인의 첫 답글은 확인 처리한다', () => {
    assert.equal(store.recordReply('C1', '100.1', 'U1'), 'confirmed');
  });

  it('같은 사람이 두 번 답글을 달면 두 번째는 중복으로 본다', () => {
    store.recordReply('C1', '100.1', 'U1');
    assert.equal(store.recordReply('C1', '100.1', 'U1'), 'already-confirmed');
  });

  it('대상자가 아닌 사람의 답글은 확인하지 않는다', () => {
    assert.equal(store.recordReply('C1', '100.1', 'U9'), 'not-target');
  });

  it('봇이 보내지 않은 스레드의 답글은 무시한다', () => {
    assert.equal(store.recordReply('C1', '999.9', 'U1'), 'unknown-thread');
  });

  it('같은 ts라도 다른 채널이면 다른 스레드로 본다', () => {
    assert.equal(store.recordReply('C2', '100.1', 'U1'), 'unknown-thread');
  });

  it('reset 후에는 이전 날의 스레드를 인정하지 않는다', () => {
    store.reset();
    assert.equal(store.recordReply('C1', '100.1', 'U1'), 'unknown-thread');
  });
});
