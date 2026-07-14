const { test } = require('node:test');
const assert = require('node:assert');
const { getTwitterCreds, getTelegramConfig, getBraveKey } = require('../scripts/config');

const secrets = {
  twitterAccounts: { cricdotcric: { apiKey: 'k', apiSecret: 's', accessToken: 't', accessTokenSecret: 'ts' } },
  telegram: { botToken: 'bot', chatId: '123' },
  brave: { apiKey: 'bk' },
};

test('getTwitterCreds returns creds for a known account', () => {
  assert.deepStrictEqual(getTwitterCreds(secrets, 'cricdotcric'), secrets.twitterAccounts.cricdotcric);
});

test('getTwitterCreds returns null for unknown account', () => {
  assert.strictEqual(getTwitterCreds(secrets, 'nope'), null);
});

test('getTelegramConfig returns telegram block', () => {
  assert.deepStrictEqual(getTelegramConfig(secrets), secrets.telegram);
});

test('getTelegramConfig throws when incomplete', () => {
  assert.throws(() => getTelegramConfig({ telegram: { botToken: 'x' } }), /chatId/);
});

test('getBraveKey returns the key', () => {
  assert.strictEqual(getBraveKey(secrets), 'bk');
  assert.strictEqual(getBraveKey({ braveApiKey: 'flat' }), 'flat');
});

test('getBraveKey throws when missing', () => {
  assert.throws(() => getBraveKey({}), /Brave API key/);
});
