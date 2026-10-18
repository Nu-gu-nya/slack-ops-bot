import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatReport, validateReportRows, type RawReportRow } from './report.service.js';

const EMPTY: RawReportRow = { time: null, task: null, status: null };

describe('업무 보고 입력 검증', () => {
  it('완전히 비운 줄은 무시하고 채운 줄만 항목으로 만든다', () => {
    const result = validateReportRows([
      { time: '09:00', task: 'A업무', status: '완료' },
      EMPTY,
      { time: '', task: '  ', status: null },
    ]);
    assert.deepEqual(result, { ok: true, entries: [{ time: '09:00', task: 'A업무', status: '완료' }] });
  });

  it('일부만 채운 줄은 비어 있는 칸마다 오류를 낸다', () => {
    const result = validateReportRows([
      { time: '09:00', task: 'A업무', status: '완료' },
      { time: '10:00', task: null, status: null },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(
        result.errors.map((e) => [e.rowIndex, e.field]),
        [
          [1, 'task'],
          [1, 'status'],
        ],
      );
    }
  });

  it('정해진 값이 아닌 상태는 거부한다', () => {
    const result = validateReportRows([{ time: '09:00', task: 'A업무', status: '보류' }]);
    assert.equal(result.ok, false);
  });

  it('모든 줄이 비어 있으면 거부한다', () => {
    assert.equal(validateReportRows([EMPTY, EMPTY]).ok, false);
  });
});

describe('업무 보고 포맷팅', () => {
  it('"09:00 A업무 (완료)" 형식으로 시간순 정렬한다', () => {
    const text = formatReport([
      { time: '13:00', task: 'B업무', status: '지연' },
      { time: '09:00', task: 'A업무', status: '완료' },
    ]);
    assert.equal(text, '09:00 A업무 (완료)\n13:00 B업무 (지연)');
  });
});
