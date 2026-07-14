const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadState, saveState, itemAlreadyPosted } = require('../scripts/lib/state');

test('loadState returns empty shape when file missing', () => {
  const p = path.join(os.tmpdir(), `nope-${Date.now()}.json`);
  assert.deepStrictEqual(loadState(p), { posted: {}, postedById: {} });
});

test('saveState then loadState round-trips', () => {
  const p = path.join(os.tmpdir(), `state-${Date.now()}.json`);
  const s = { posted: { '2026-07-20': { id: 'a' } }, postedById: { a: { id: 'a' } } };
  saveState(p, s);
  assert.deepStrictEqual(loadState(p), s);
  fs.unlinkSync(p);
});

test('itemAlreadyPosted true when id recorded', () => {
  const state = { posted: {}, postedById: { x1: {} } };
  assert.strictEqual(itemAlreadyPosted({ id: 'x1', date: '2026-07-20' }, state), true);
});

test('itemAlreadyPosted true when date recorded (no id)', () => {
  const state = { posted: { '2026-07-20': {} }, postedById: {} };
  assert.strictEqual(itemAlreadyPosted({ date: '2026-07-20' }, state), true);
});

test('itemAlreadyPosted false when unseen', () => {
  assert.strictEqual(itemAlreadyPosted({ id: 'new', date: '2026-07-20' }, { posted: {}, postedById: {} }), false);
});
