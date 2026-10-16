import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AttendanceRecord } from '../types/domain.js';
import { groupByDepartment, parseAttendanceRows, selectTodayTargets } from './attendance.service.js';

const TODAY = '2026-09-14';

function record(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    date: TODAY,
    department: 'CS',
    name: 'James',
    slackUserId: 'U1',
    status: '출근',
    startTime: '09:00',
    endTime: '18:00',
    ...overrides,
  };
}

describe('시트 행 → AttendanceRecord 변환', () => {
  it('정상 행을 도메인 레코드로 바꾸고 날짜·시간 형식을 맞춘다', () => {
    const { records, invalidRows } = parseAttendanceRows([
      ['2026. 9. 14', 'CS', 'James', 'U1', '출근', '9:00', '18:00'],
    ]);
    assert.deepEqual(invalidRows, []);
    assert.deepEqual(records, [record({})]);
  });

  it('끝쪽 빈 칸이 잘려 들어와도 시간은 null로 채운다', () => {
    const { records } = parseAttendanceRows([['2026-09-14', 'CS', 'Kane', 'U2', '결근']]);
    assert.equal(records[0]?.startTime, null);
    assert.equal(records[0]?.endTime, null);
  });

  it('알 수 없는 상태나 날짜는 건너뛰고 시트 행 번호와 사유를 남긴다', () => {
    const { records, invalidRows } = parseAttendanceRows([
      ['2026-09-14', 'CS', 'James', 'U1', '출근'],
      ['2026-09-14', 'CS', 'Kane', 'U2', '휴가'],
      ['내일', 'CS', 'Denis', 'U3', '출근'],
    ]);
    assert.equal(records.length, 1);
    assert.deepEqual(
      invalidRows.map((row) => row.rowNumber),
      [3, 4],
    );
  });

  it('완전히 빈 행은 오류로 보지 않고 무시한다', () => {
    const { records, invalidRows } = parseAttendanceRows([['', '', ''], []]);
    assert.deepEqual(records, []);
    assert.deepEqual(invalidRows, []);
  });
});

describe('오늘 근무 대상자 계산', () => {
  it('결근인 사람은 대상에서 제외한다', () => {
    const { targets } = selectTodayTargets(
      [record({ name: 'James' }), record({ name: 'Kane', slackUserId: 'U2', status: '결근' })],
      TODAY,
    );
    assert.deepEqual(
      targets.map((t) => t.name),
      ['James'],
    );
  });

  it('리모트 근무자는 대상에 포함한다', () => {
    const { targets } = selectTodayTargets([record({ status: '리모트' })], TODAY);
    assert.equal(targets.length, 1);
  });

  it('다른 날짜의 행은 제외한다', () => {
    const { targets } = selectTodayTargets([record({ date: '2026-09-15' })], TODAY);
    assert.deepEqual(targets, []);
  });

  it('slackUserId가 없는 행은 대상에서 빼고 경고 목록에 담는다', () => {
    const { targets, missingSlackId } = selectTodayTargets(
      [record({ name: 'Denis', slackUserId: '' })],
      TODAY,
    );
    assert.deepEqual(targets, []);
    assert.deepEqual(
      missingSlackId.map((r) => r.name),
      ['Denis'],
    );
  });

  it('오늘 행이 하나도 없으면 빈 배열을 반환한다', () => {
    assert.deepEqual(selectTodayTargets([], TODAY), { targets: [], missingSlackId: [] });
  });
});

describe('부서별 그룹핑', () => {
  it('같은 부서끼리 묶는다', () => {
    const groups = groupByDepartment([
      record({ name: 'A', department: 'CS' }),
      record({ name: 'B', department: 'PD' }),
      record({ name: 'C', department: 'CS' }),
    ]);
    assert.deepEqual(
      groups.get('CS')?.map((r) => r.name),
      ['A', 'C'],
    );
    assert.equal(groups.get('PD')?.length, 1);
  });
});
