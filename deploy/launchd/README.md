# Scheduling (macOS launchd)

Two launchd jobs on your Mac. No cloud, no cron, no webhook.

- **`com.cricdotcric.draft`** — daily at **14:00 local (2 PM SGT)**: runs
  `scripts/agent-run.sh draft`, which invokes **headless Claude (Sonnet)** to find a
  due fixture for an `active` series, draft the tweet, source a rule-compliant image
  (Brave), and send the draft to Telegram. `StartCalendarInterval`, so a missed fire
  runs at next wake.
- **`com.cricdotcric.bot`** — an **always-on daemon** (`RunAtLoad` + `KeepAlive`):
  `scripts/telegram-bot.js` long-polls Telegram and reacts in real time — posts on
  `✅ Approved`, acknowledges rejects/corrections, and runs `/draft <topic>`
  (spawns `agent-run.sh adhoc`).

## How the day works

1. **2 PM** — a draft lands in your Telegram automatically.
2. **Or anytime** — text the bot `/draft <topic>` for an ad-hoc draft.
3. **Approve** — reply `✅ Approved`; the daemon posts it within ~1s and confirms
   with the live link.

## Prerequisite: headless Claude auth

The draft job runs `claude -p` non-interactively, which needs its own credential.
Run `claude setup-token` **once** (in a normal Terminal), copy the token it prints,
and save it:

```bash
IFS= read -rs TOK && printf '%s' "$TOK" > ~/.cricdotcric/claude-oauth-token && unset TOK
chmod 600 ~/.cricdotcric/claude-oauth-token
```

`agent-run.sh` loads it as `CLAUDE_CODE_OAUTH_TOKEN`. If headless 401s, see the
keychain gotcha in `docs/RUNBOOK.md` (an expired `Claude Code-credentials` keychain
entry can shadow the token).

## Install / activate

```bash
cp deploy/launchd/com.cricdotcric.bot.plist   ~/Library/LaunchAgents/
cp deploy/launchd/com.cricdotcric.draft.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.cricdotcric.bot.plist
launchctl load ~/Library/LaunchAgents/com.cricdotcric.draft.plist
launchctl list | grep cricdotcric
```

## Trigger / restart

```bash
launchctl kickstart -k "gui/$(id -u)/com.cricdotcric.draft"  # run a draft now
launchctl kickstart -k "gui/$(id -u)/com.cricdotcric.bot"    # restart the daemon (reload code)
```

## Logs

- Draft run: `state/logs/agent-draft.log` (headless Claude output)
- Ad-hoc run: `state/logs/agent-adhoc.log`
- Daemon: `state/logs/bot.out` / `bot.err`
- launchd: `state/logs/launchd-draft.{out,err}`

## Disable / remove

```bash
launchctl unload ~/Library/LaunchAgents/com.cricdotcric.bot.plist
launchctl unload ~/Library/LaunchAgents/com.cricdotcric.draft.plist
rm ~/Library/LaunchAgents/com.cricdotcric.{bot,draft}.plist
```

## Notes

- Mac must be awake/online at 2 PM (missed calendar jobs run on wake; the daemon
  resumes polling on wake and `KeepAlive` relaunches it after logout/crash).
- Mac is UTC+8 == SGT, so `Hour 14` == 2 PM SGT. Adjust the draft plist `Hour` if
  the timezone changes.
- `draft-reminder.js` (a pure-Node 2 PM nudge) is retained but no longer wired —
  the draft job now does the full Claude-driven drafting.
