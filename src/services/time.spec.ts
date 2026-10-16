import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeDate, normalizeTime, todayInSeoul } from './time.js';

describe('서울 기준 오늘 날짜', () => {
  it('UTC로는 전날이어도 서울 기준 날짜를 반환한다', () => {
    // 2026-10-15 23:30 UTC is 2026-10-16 08:30 in Seoul.
    assert.equal(todayInSeoul(new Date('2026-10-15T23:30:00Z')), '2026-10-16');
  });
});

describe('시트 날짜·시간 정규화', () => {
  it('로케일별 날짜 표기를 YYYY-MM-DD로 맞춘다', () => {
    assert.equal(normalizeDate('2026-10-16'), '2026-10-16');
    assert.equal(normalizeDate('2026. 10. 6'), '2026-10-06');
    assert.equal(normalizeDate('2026/1/6'), '2026-01-06');
  });

  it('날짜가 아니면 null을 반환한다', () => {
    assert.equal(normalizeDate(''), null);
    assert.equal(normalizeDate('2026-13-01'), null);
  });

  it('시간을 HH:mm으로 맞추고 잘못된 값은 null로 둔다', () => {
    assert.equal(normalizeTime('9:00'), '09:00');
    assert.equal(normalizeTime('25:00'), null);
    assert.equal(normalizeTime(''), null);
  });
});
