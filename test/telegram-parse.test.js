const { test } = require('node:test');
const assert = require('node:assert');
const { parseApproval } = require('../scripts/lib/telegram-parse');

test('plain approval', () => {
  assert.strictEqual(parseApproval('✅ Approved — post as is').decision, 'approved');
  assert.strictEqual(parseApproval('approve').decision, 'approved');
});

test('corrections captures notes and beats plain approve', () => {
  const r = parseApproval('✏️ Approved with corrections: tighten the closer');
  assert.strictEqual(r.decision, 'corrections');
  assert.strictEqual(r.notes, 'tighten the closer');
});

test('rejection captures reason', () => {
  const r = parseApproval('❌ Rejected: wrong photo');
  assert.strictEqual(r.decision, 'rejected');
  assert.strictEqual(r.reason, 'wrong photo');
});

test('rejection without reason', () => {
  assert.strictEqual(parseApproval('Rejected').decision, 'rejected');
});

test('unrelated text is unknown', () => {
  assert.strictEqual(parseApproval('what time is the match').decision, 'unknown');
});
