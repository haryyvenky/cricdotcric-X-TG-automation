#!/usr/bin/env node
const fs = require('fs');
const { loadSecrets, getTelegramConfig } = require('./config');
const { parseApproval } = require('./lib/telegram-parse');

const API = 'https://api.telegram.org';
const args = process.argv.slice(2);
const cmd = args[0];

// Stamped automatically onto every draft-for-approval message so the operator
// always sees their reply options. Kept in code (not left to the drafting agent
// to type) so it can never be forgotten or worded inconsistently.
const APPROVAL_FOOTER =
  '\n\n———\n✅ Approved — post as is\n✏️ Approved with corrections: [notes]\n❌ Rejected';

function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function tg(cfg, method, body) {
  const res = await fetch(`${API}/bot${cfg.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(json)}`);
  return json.result;
}

async function main() {
  const cfg = getTelegramConfig(loadSecrets());

  if (cmd === 'selftest') {
    const r = await tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text: '✅ cricdotcric agent connected.' });
    console.log(JSON.stringify({ ok: true, messageId: r.message_id }, null, 2));
    return;
  }

  if (cmd === 'message') {
    const text = getArg('--text');
    if (!text) throw new Error('message requires --text');
    const r = await tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text });
    console.log(JSON.stringify({ ok: true, messageId: r.message_id }, null, 2));
    return;
  }

  if (cmd === 'send') {
    const textFile = getArg('--text-file');
    const image = getArg('--image');
    if (!textFile) throw new Error('send requires --text-file');
    const caption = fs.readFileSync(textFile, 'utf8').replace(/\s+$/, '') + APPROVAL_FOOTER;
    let r;
    if (image) {
      r = await tg(cfg, 'sendPhoto', { chat_id: cfg.chatId, photo: image, caption });
    } else {
      r = await tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text: caption });
    }
    console.log(JSON.stringify({ ok: true, messageId: r.message_id }, null, 2));
    return;
  }

  if (cmd === 'poll') {
    const offset = getArg('--offset');
    const body = { timeout: 0, allowed_updates: ['message'] };
    if (offset) body.offset = Number(offset);
    const updates = await tg(cfg, 'getUpdates', body);
    let newOffset = offset ? Number(offset) : 0;
    const replies = [];
    for (const u of updates) {
      newOffset = u.update_id + 1;
      const msg = u.message;
      if (!msg || !msg.text) continue;
      const parsed = parseApproval(msg.text);
      replies.push({
        messageId: msg.message_id,
        replyToMessageId: msg.reply_to_message ? msg.reply_to_message.message_id : null,
        text: msg.text,
        ...parsed,
      });
    }
    console.log(JSON.stringify({ ok: true, newOffset, replies }, null, 2));
    return;
  }

  console.error('Usage: node scripts/telegram.js <selftest|message --text <t>|send --text-file <path> [--image <url>]|poll [--offset <n>]>');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
