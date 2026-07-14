const { test } = require('node:test');
const assert = require('node:assert');
const { getTwitterCreds, getTelegramConfig } = require('../scripts/config');

const secrets = {
  twitterAccounts: { cricdotcric: { apiKey: 'k', apiSecret: 's', accessToken: 't', accessTokenSecret: 'ts' } },
  telegram: { botToken: 'bot', chatId: '123' },
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
