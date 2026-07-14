#!/usr/bin/env node
// Long-polling Telegram daemon: replies to approvals/rejections in REAL TIME.
// Run persistently via launchd (KeepAlive). Uses getUpdates long-polling so it
// reacts within ~1s of your reply — no schedule, no webhook, no cloud.
//
//   ✅ Approved            → posts immediately, replies with the live link
//   ❌ Rejected: <reason>  → acknowledges immediately (redo happens in Claude)
//   ✏️ Approved with corrections: <notes> → acknowledges immediately
const { loadSecrets, getTelegramConfig } = require('./config');
const { parseApproval } = require('./lib/telegram-parse');
const { getItemId } = require('./lib/queue-item');
const { loadState } = require('./lib/state');
const P = require('./lib/posting');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function handle(cfg, msg) {
  const { decision, notes, reason } = parseApproval(msg.text);
  if (decision === 'unknown') return; // ignore chatter, don't spam replies

  const queue = P.loadQueue();
  const state = loadState(P.statePath);
  const item = P.findItem(queue, msg);

  if (decision === 'approved') {
    if (!item) { await P.sendMessage(cfg, '🤔 Nothing pending to approve right now.'); return; }
    if (state.postedById[getItemId(item)]) { item.status = 'posted'; P.saveQueue(queue); await P.sendMessage(cfg, '✅ That one is already posted.'); return; }
    await P.sendMessage(cfg, '⏳ Posting…');
    try {
      await P.postApproved(cfg, item, state); // sends the ✅ POSTED + link
      P.saveQueue(queue);
    } catch (e) {
      await P.sendMessage(cfg, `⚠️ Post failed: ${e.message}. Left pending.`);
    }
  } else if (decision === 'rejected') {
    await P.sendMessage(cfg, `❌ Rejection noted${reason ? `: ${reason}` : ''}. I'll redo it in the next Claude session (revisions need AI).`);
  } else if (decision === 'corrections') {
    await P.sendMessage(cfg, `✏️ Corrections noted${notes ? `: ${notes}` : ''}. I'll revise it in the next Claude session.`);
  }
}

(async () => {
  const cfg = getTelegramConfig(loadSecrets());
  let offset = P.loadOffset();
  console.log(`[${new Date().toISOString()}] cricdotcric telegram bot started (offset ${offset})`);
  for (;;) {
    try {
      const body = { timeout: 30, allowed_updates: ['message'] };
      if (offset) body.offset = offset;
      const updates = await P.tg(cfg, 'getUpdates', body);
      for (const u of updates) {
        offset = u.update_id + 1;
        P.saveOffset(offset);
        const msg = u.message;
        if (!msg || !msg.text) continue;
        try { await handle(cfg, msg); } catch (e) { console.error('handle error:', e.message); }
      }
    } catch (e) {
      console.error('poll error:', e.message);
      await sleep(3000);
    }
  }
})();
