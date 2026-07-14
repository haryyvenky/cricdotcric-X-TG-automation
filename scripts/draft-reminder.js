#!/usr/bin/env node
// Pure-Node daily nudge: at 2 PM SGT, Telegram a reminder to draft today's post.
// (Drafting is AI work done in an interactive Claude session; posting of the
// approved result is handled unattended by check-and-post.js.)
const { loadSecrets, getTelegramConfig } = require('./config');

(async () => {
  const cfg = getTelegramConfig(loadSecrets());
  const text = "⏰ Time to draft today's @cricdotcric post.\n\nOpen Claude and run the drafting agent — it will send the draft here for your approval. Reply ✅ Approved and it posts automatically.";
  const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.chatId, text }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendMessage failed: ${JSON.stringify(json)}`);
  console.log(JSON.stringify({ ok: true, messageId: json.result.message_id }));
})().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
