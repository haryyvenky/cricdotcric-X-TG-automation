// Shared posting + Telegram helpers used by check-and-post.js (one-shot) and
// telegram-bot.js (long-polling daemon). Keeps the approve→post logic in one place.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { getItemId, validateItem } = require('./queue-item');
const { saveState } = require('./state');

const repoRoot = path.resolve(__dirname, '..', '..');
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

function sendMessage(cfg, text) {
  return tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text });
}

function loadOffset() {
  if (!fs.existsSync(offsetPath)) return 0;
  try { return JSON.parse(fs.readFileSync(offsetPath, 'utf8')).offset || 0; } catch { return 0; }
}
function saveOffset(o) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(offsetPath, JSON.stringify({ offset: o }) + '\n');
}
function loadQueue() { return fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, 'utf8')) : []; }
function saveQueue(q) { fs.writeFileSync(queuePath, JSON.stringify(q, null, 2) + '\n'); }

function replyToId(msg) {
  return msg && msg.reply_to_message ? msg.reply_to_message.message_id : null;
}

function findItem(queue, msg) {
  const rid = replyToId(msg);
  if (rid) {
    const byReply = queue.find((i) => i.telegramMessageId === rid && i.status === 'pending');
    if (byReply) return byReply;
  }
  return [...queue].reverse().find((i) => i.status === 'pending') || null;
}

async function downloadImage(item) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const p = path.join(tmpDir, `${getItemId(item)}.jpg`);
  const r = await fetch(item.imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 cricdotcric-agent' } });
  if (!r.ok) throw new Error(`Image download failed: ${r.status}`);
  fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  return p;
}

// Posts an approved item, records state, marks it posted, and sends a Telegram
// confirmation with the live link. Returns { id, link }.
async function postApproved(cfg, item, state) {
  validateItem(item, 'queue.json');
  const imagePath = await downloadImage(item);
  const textPath = path.join(tmpDir, `${getItemId(item)}.txt`);
  fs.writeFileSync(textPath, item.tweet + '\n');
  const out = execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts', 'x-post.js'),
    '--account', item.account,
    '--text-file', textPath,
    '--media-file', imagePath,
  ], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  if (!parsed.ok) throw new Error(`Tweet post failed: ${out}`);
  const tweetId = parsed.json && parsed.json.data && parsed.json.data.id;
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
  await sendMessage(cfg, `✅ POSTED: ${getItemId(item)}\n${link}`);
  return { id: getItemId(item), link };
}

module.exports = {
  statePath, tg, sendMessage, loadOffset, saveOffset,
  loadQueue, saveQueue, findItem, downloadImage, postApproved,
};
