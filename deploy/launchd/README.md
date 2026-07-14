# Scheduling (macOS launchd)

Two launchd jobs run the agent on your Mac:

- `com.cricdotcric.draft` — daily at **14:00 local (2 PM SGT)**: drafts today's post
  (fixture preview/review, or an evergreen post if no game) and sends it to Telegram.
- `com.cricdotcric.checkpost` — a few afternoon/evening times: polls Telegram for your
  approval and posts approved drafts.

Both invoke `scripts/agent-run.sh`, which runs the `cricdotcric-post` skill headlessly
via the `claude` CLI.

## Prerequisite: authenticate the CLI for non-interactive use

launchd runs `claude -p` as a background process, which needs its own credentials
(the interactive app login does **not** carry over — headless runs 401 without this).
Do ONE of:

```bash
claude setup-token           # long-lived token for Claude Pro/Max subscribers
# or
export ANTHROPIC_API_KEY=... # API-billed; put in your shell profile / launchd env
```

Verify it works headlessly:

```bash
claude -p "Reply with exactly: HEADLESS OK" --dangerously-skip-permissions
```

You should see `HEADLESS OK`. If you see `401 Invalid authentication credentials`,
the token isn't set up yet.

## Install / activate

```bash
cp deploy/launchd/com.cricdotcric.draft.plist    ~/Library/LaunchAgents/
cp deploy/launchd/com.cricdotcric.checkpost.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.cricdotcric.draft.plist
launchctl load ~/Library/LaunchAgents/com.cricdotcric.checkpost.plist
launchctl list | grep cricdotcric   # confirm both are registered
```

## Logs

- Agent run logs: `state/logs/agent-draft.log`, `state/logs/agent-check-and-post.log`
- launchd stdout/stderr: `state/logs/launchd-*.out` / `.err`

## Disable / remove

```bash
launchctl unload ~/Library/LaunchAgents/com.cricdotcric.draft.plist
launchctl unload ~/Library/LaunchAgents/com.cricdotcric.checkpost.plist
rm ~/Library/LaunchAgents/com.cricdotcric.{draft,checkpost}.plist
```

## Notes

- Jobs only fire while the Mac is awake and online. Missed jobs (lid closed) run at
  next wake if the window hasn't passed.
- The Mac is currently UTC+8, so 14:00 local == 2 PM SGT. If you change timezone,
  adjust the `Hour` in the plists.
