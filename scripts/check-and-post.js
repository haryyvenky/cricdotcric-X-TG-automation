#!/usr/bin/env node
// Pure-Node check-and-post: polls Telegram for approval replies and posts
// approved drafts from content/queue.json. No `claude` CLI needed — this is the
// deterministic half of the workflow, safe to run unattended from launchd.
//
// Approve/reject in Telegram by REPLYING to the draft message:
//   ✅ Approved            → posts it
//   ✏️ Approved with corrections: ...  → flagged (needs a Claude session to revise)
//   ❌ Rejected: ...       → flagged (needs a Claude session to redo)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { loadSecrets, getTelegramConfig } = require('./config');
const { getItemId, validateItem } = require('./lib/queue-item');
const { loadState, saveState } = require('./lib/state');
const { parseApproval } = require('./lib/telegram-parse');

const repoRoot = path.resolve(__dirname, '..');
const queuePath = path.join(repoRoot, 'content', 'queue.json');
const stateDir = path.join(repoRoot, 'state');
const statePath = path.join(stateDir, 'queue-state.json');
const offsetPath = path.join(stateDir, 'telegram-offset.json');
const tmpDir = path.join(os.tmpdir(), 'cricdotcric-x-tg-automation');

async function tg(cfg, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(json)}`);
  return json.result;
}

function loadOffset() {
  if (!fs.existsSync(offsetPath)) return 0;
  try { return JSON.parse(fs.readFileSync(offsetPath, 'utf8')).offset || 0; } catch { return 0; }
}
function saveOffset(o) { fs.writeFileSync(offsetPath, JSON.stringify({ offset: o }) + '\n'); }
function loadQueue() { return fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, 'utf8')) : []; }
function saveQueue(q) { fs.writeFileSync(queuePath, JSON.stringify(q, null, 2) + '\n'); }

async function downloadImage(item) {
  const p = path.join(tmpDir, `${getItemId(item)}.jpg`);
  const r = await fetch(item.imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 cricdotcric-agent' } });
  if (!r.ok) throw new Error(`Image download failed: ${r.status}`);
  fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  return p;
}

function findItem(queue, replyToId) {
  if (replyToId) {
    const byReply = queue.find((i) => i.telegramMessageId === replyToId && i.status === 'pending');
    if (byReply) return byReply;
  }
  // Fallback: the most recent still-pending draft.
  return [...queue].reverse().find((i) => i.status === 'pending') || null;
}

async function postApproved(cfg, item, state) {
  validateItem(item, 'queue.json');
  const imagePath = await downloadImage(item);
  const textPath = path.join(tmpDir, `${getItemId(item)}.txt`);
  fs.writeFileSync(textPath, item.tweet + '\n');
  const out = execFileSync('node', [
    path.join(repoRoot, 'scripts', 'x-post.js'),
    '--account', item.account,
    '--text-file', textPath,
    '--media-file', imagePath,
  ], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  if (!parsed.ok) throw new Error(`Tweet post failed: ${out}`);
  const tweetId = parsed.json?.data?.id;
  const link = tweetId ? `https://x.com/${item.account}/status/${tweetId}` : undefined;
  item.status = 'posted';
  item.tweetId = tweetId;
  item.link = link;
  state.postedById[getItemId(item)] = {
    id: getItemId(item), type: item.type, date: item.date,
    tweetId, link, postedAt: new Date().toISOString(),
    tweet: item.tweet, imageUrl: item.imageUrl,
  };
  saveState(statePath, state);
  await tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text: `✅ POSTED: ${getItemId(item)}\n${link}` });
  return { id: getItemId(item), link };
}

(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  const cfg = getTelegramConfig(loadSecrets());
  const offset = loadOffset();
  const body = { timeout: 0, allowed_updates: ['message'] };
  if (offset) body.offset = offset;
  const updates = await tg(cfg, 'getUpdates', body);

  const queue = loadQueue();
  const state = loadState(statePath);
  let newOffset = offset;
  const posted = [];

  for (const u of updates) {
    newOffset = u.update_id + 1;
    const msg = u.message;
    if (!msg || !msg.text) continue;
    const { decision } = parseApproval(msg.text);
    if (decision === 'unknown') continue;
    const replyToId = msg.reply_to_message ? msg.reply_to_message.message_id : null;
    const item = findItem(queue, replyToId);
    if (!item) continue;
    if (state.postedById[getItemId(item)]) { item.status = 'posted'; continue; } // never double-post

    if (decision === 'approved') {
      try {
        posted.push(await postApproved(cfg, item, state));
      } catch (e) {
        await tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text: `⚠️ Post failed for ${getItemId(item)}: ${e.message}. Left pending.` });
      }
    } else { // corrections | rejected
      await tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text: `✏️ Noted "${decision}" for ${getItemId(item)}. Revisions need a Claude session — open Claude to redo it.` });
    }
  }

  saveOffset(newOffset);
  saveQueue(queue);
  console.log(JSON.stringify({ ok: true, offset: newOffset, posted }, null, 2));
})().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
