const { test } = require('node:test');
const assert = require('node:assert');
const { getItemId, validateItem } = require('../scripts/lib/queue-item');

const valid = {
  id: 'x1', account: 'cricdotcric', tweet: 'A real tweet',
  date: '2026-07-20', imageUrl: 'https://example.com/a.jpg',
};

test('getItemId prefers id, falls back to date', () => {
  assert.strictEqual(getItemId({ id: 'a', date: '2026-01-01' }), 'a');
  assert.strictEqual(getItemId({ date: '2026-01-01' }), '2026-01-01');
});

test('validateItem accepts a well-formed item', () => {
  assert.doesNotThrow(() => validateItem(valid, 'queue'));
});

test('validateItem allows long (Premium) tweets but rejects absurdly long', () => {
  assert.doesNotThrow(() => validateItem({ ...valid, tweet: 'x'.repeat(1000) }, 'queue'));
  assert.throws(() => validateItem({ ...valid, tweet: 'x'.repeat(25001) }, 'queue'), /25000/);
});

test('validateItem rejects missing image url', () => {
  assert.throws(() => validateItem({ ...valid, imageUrl: undefined }, 'queue'), /imageUrl/);
});

test('validateItem rejects bad date', () => {
  assert.throws(() => validateItem({ ...valid, date: '20-07-2026' }, 'queue'), /invalid date/);
});

test('validateItem no longer blocks old placeholder copy', () => {
  assert.doesNotThrow(() => validateItem({ ...valid, tweet: 'IPL today: RCB vs SRH.' }, 'queue'));
});
