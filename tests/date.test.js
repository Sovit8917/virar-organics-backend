const test = require('node:test');
const assert = require('node:assert/strict');
const { getIstDateString, getIstDayBounds, getIstMonthStart } = require('../src/utils/date');

test('getIstDateString converts UTC instant across IST midnight boundary', () => {
  // 2026-11-27T18:29:59.999Z is 2026-11-27 23:59:59.999 IST
  assert.equal(getIstDateString(new Date('2026-11-27T18:29:59.999Z')), '2026-11-27');
  // 2026-11-27T18:30:00.000Z is 2026-11-28 00:00:00.000 IST
  assert.equal(getIstDateString(new Date('2026-11-27T18:30:00.000Z')), '2026-11-28');
});

test('getIstDayBounds returns UTC timestamps for 00:00:00.000 to 23:59:59.999 IST', () => {
  const { start, end } = getIstDayBounds(new Date('2026-11-28T10:00:00.000Z'));
  assert.equal(start.toISOString(), '2026-11-27T18:30:00.000Z');
  assert.equal(end.toISOString(), '2026-11-28T18:29:59.999Z');
});

test('getIstMonthStart returns UTC timestamp for 1st of IST month at 00:00:00.000 IST', () => {
  // 2026-11-30T18:30:00.000Z is 2026-12-01 00:00:00.000 IST (already December in IST)
  const decStart = getIstMonthStart(new Date('2026-11-30T18:30:00.000Z'));
  assert.equal(decStart.toISOString(), '2026-11-30T18:30:00.000Z');

  // 2026-11-30T18:29:59.999Z is 2026-11-30 23:59:59.999 IST (still November in IST)
  const novStart = getIstMonthStart(new Date('2026-11-30T18:29:59.999Z'));
  assert.equal(novStart.toISOString(), '2026-10-31T18:30:00.000Z');
});
