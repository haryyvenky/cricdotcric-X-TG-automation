# Scheduling (macOS launchd)

Two **pure-Node** launchd jobs on your Mac — no `claude` CLI / no API auth, no cloud:

- `com.cricdotcric.bot` — an **always-on** long-polling Telegram daemon
  (`scripts/telegram-bot.js`). It watches Telegram continuously and reacts to your
  approval **in real time (~1s)**: `✅ Approved` posts immediately and replies with
  the live link; `❌ Rejected` / `✏️ corrections` get an instant acknowledgement.
  `KeepAlive` restarts it if it ever exits; `RunAtLoad` starts it at login.
- `com.cricdotcric.draft` — daily at **14:00 local (2 PM SGT)**: Telegrams a reminder
  to draft today's post (`scripts/draft-reminder.js`).

`scripts/check-and-post.js` is kept as a one-shot manual/backup poller. Do NOT run it
while the daemon is loaded — Telegram allows only one long-poller at a time (a second
`getUpdates` returns HTTP 409).

## How the day works

1. **2 PM** — Telegram nudge to draft.
2. **Draft (AI)** — open Claude, run the drafting agent (`cricdotcric-post` skill). It
   finds the fixture (or an evergreen angle), writes the tweet, uses `find-image.js`
   (Brave) for a rule-compliant photo, and sends the draft to Telegram.
3. **Approve** — reply `✅ Approved`. The daemon posts it within ~1s and confirms.

## Install / activate

```bash
cp deploy/launchd/com.cricdotcric.bot.plist   ~/Library/LaunchAgents/
cp deploy/launchd/com.cricdotcric.draft.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.cricdotcric.bot.plist
launchctl load ~/Library/LaunchAgents/com.cricdotcric.draft.plist
launchctl list | grep cricdotcric
```

## Logs
- Daemon: `state/logs/bot.out`, `state/logs/bot.err`
- Draft reminder: `state/logs/launchd-draft.{out,err}`

## Disable / remove
```bash
launchctl unload ~/Library/LaunchAgents/com.cricdotcric.bot.plist
launchctl unload ~/Library/LaunchAgents/com.cricdotcric.draft.plist
rm ~/Library/LaunchAgents/com.cricdotcric.{bot,draft}.plist
```

## Notes
- The daemon runs while your Mac is on. If the Mac sleeps, it resumes polling on wake;
  `KeepAlive` also relaunches it after crashes/logouts.
- Mac is UTC+8, so 14:00 local == 2 PM SGT. Adjust the draft plist `Hour` if you move.
- `scripts/agent-run.sh` (claude-headless runner) is retained for if headless `claude`
  auth ever works, to fully automate drafting too.
