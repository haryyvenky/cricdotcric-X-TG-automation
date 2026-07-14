const fs = require('fs');
const path = require('path');

function secretsPath() {
  return process.env.CRICDOTCRIC_SECRETS_FILE
    || path.join(process.env.HOME, '.cricdotcric', 'secrets.json');
}

function loadSecrets() {
  const p = secretsPath();
  if (!fs.existsSync(p)) throw new Error(`Secrets file not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function getTwitterCreds(secrets, account) {
  return secrets.twitterAccounts?.[account]
    || (secrets.twitter?.handle === account ? secrets.twitter : null);
}

function getTelegramConfig(secrets) {
  const tg = secrets.telegram;
  if (!tg || !tg.botToken || !tg.chatId) {
    throw new Error('Telegram config missing botToken or chatId');
  }
  return tg;
}

function getBraveKey(secrets) {
  const k = (secrets.brave && secrets.brave.apiKey) || secrets.braveApiKey;
  if (!k) throw new Error('Brave API key missing (secrets.brave.apiKey)');
  return k;
}

module.exports = { secretsPath, loadSecrets, getTwitterCreds, getTelegramConfig, getBraveKey };
