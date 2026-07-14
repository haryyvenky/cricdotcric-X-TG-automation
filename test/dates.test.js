const { test } = require('node:test');
const assert = require('node:assert');
const { currentDateInZone } = require('../scripts/lib/dates');

test('currentDateInZone formats YYYY-MM-DD in the given zone', () => {
  // 2026-07-20T20:00Z is 2026-07-21 in Asia/Singapore (+08)
  const now = new Date('2026-07-20T20:00:00Z');
  assert.strictEqual(currentDateInZone(now, 'Asia/Singapore'), '2026-07-21');
  assert.strictEqual(currentDateInZone(now, 'UTC'), '2026-07-20');
});
