#!/usr/bin/env node
// One-shot check-and-post: poll Telegram once, post any approved drafts, exit.
// Kept as a manual/backup tool; the real-time path is telegram-bot.js (daemon).
const { loadSecrets, getTelegramConfig } = require('./config');
const { parseApproval } = require('./lib/telegram-parse');
const { getItemId } = require('./lib/queue-item');
const { loadState } = require('./lib/state');
const P = require('./lib/posting');

(async () => {
  const cfg = getTelegramConfig(loadSecrets());
  const offset = P.loadOffset();
  const body = { timeout: 0, allowed_updates: ['message'] };
  if (offset) body.offset = offset;
  const updates = await P.tg(cfg, 'getUpdates', body);

  const queue = P.loadQueue();
  const state = loadState(P.statePath);
  let newOffset = offset;
  const posted = [];

  for (const u of updates) {
    newOffset = u.update_id + 1;
    const msg = u.message;
    if (!msg || !msg.text) continue;
    const { decision } = parseApproval(msg.text);
    if (decision === 'unknown') continue;
    const item = P.findItem(queue, msg);
    if (!item) continue;
    if (state.postedById[getItemId(item)]) { item.status = 'posted'; continue; }
    if (decision === 'approved') {
      try { posted.push(await P.postApproved(cfg, item, state)); }
      catch (e) { await P.sendMessage(cfg, `⚠️ Post failed for ${getItemId(item)}: ${e.message}. Left pending.`); }
    } else {
      await P.sendMessage(cfg, `✏️ Noted "${decision}" for ${getItemId(item)}. Revisions need a Claude session.`);
    }
  }

  P.saveOffset(newOffset);
  P.saveQueue(queue);
  console.log(JSON.stringify({ ok: true, offset: newOffset, posted }, null, 2));
})().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
