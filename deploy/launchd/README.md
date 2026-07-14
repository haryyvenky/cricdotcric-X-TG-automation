# Scheduling (macOS launchd)

Two **pure-Node** launchd jobs run on your Mac — no `claude` CLI / no API auth
needed, so they run reliably unattended:

- `com.cricdotcric.draft` — daily at **14:00 local (2 PM SGT)**: Telegrams you a
  reminder to draft today's post (`scripts/draft-reminder.js`).
- `com.cricdotcric.checkpost` — several afternoon/evening times **and on every
  login/wake**: polls Telegram for your approval replies and posts approved drafts
  (`scripts/check-and-post.js`).

## How the day works (semi-automatic)

1. **2 PM** — you get a Telegram nudge.
2. **Drafting (AI)** — open Claude and run the drafting agent (the `cricdotcric-post`
   skill). It finds the fixture (or picks an evergreen angle), writes the tweet,
   sources an image, appends it to `content/queue.json` as `pending`, and sends the
   draft to Telegram.
3. **Approve** — reply to the Telegram draft with `✅ Approved`.
4. **Posting (automatic)** — the check-post job posts it (next scheduled run, or the
   moment you next wake/log in) and confirms with the live link.

> Why drafting isn't scheduled: headless `claude -p` would not authenticate on this
> machine (persistent 401 even with a valid Pro/Max `setup-token`). `scripts/agent-run.sh`
> is kept for the day that's resolved — if headless auth ever works, point the plists
> back at it to fully automate drafting too.

## Install / activate

```bash
cp deploy/launchd/com.cricdotcric.draft.plist     ~/Library/LaunchAgents/
cp deploy/launchd/com.cricdotcric.checkpost.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.cricdotcric.draft.plist
launchctl load ~/Library/LaunchAgents/com.cricdotcric.checkpost.plist
launchctl list | grep cricdotcric   # confirm both are registered
```

## Logs

- launchd stdout/stderr: `state/logs/launchd-draft.{out,err}`, `state/logs/launchd-checkpost.{out,err}`

## Disable / remove

```bash
launchctl unload ~/Library/LaunchAgents/com.cricdotcric.draft.plist
launchctl unload ~/Library/LaunchAgents/com.cricdotcric.checkpost.plist
rm ~/Library/LaunchAgents/com.cricdotcric.{draft,checkpost}.plist
```

## Notes

- Jobs only fire while the Mac is awake/online; a missed calendar job runs at next
  wake if its window hasn't passed. check-post also runs on every login/wake.
- Mac is UTC+8, so 14:00 local == 2 PM SGT. If you change timezone, adjust the
  `Hour` values in the plists.
