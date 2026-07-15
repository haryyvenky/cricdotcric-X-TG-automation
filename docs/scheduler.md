# Scheduler

## Scheduling Model

Scheduling is macOS **`launchd`** — not `cron`, not a hosted webhook, not Claude
Code's built-in routines (those were unavailable in this environment). Two jobs,
both defined in `deploy/launchd/`:

- **`com.cricdotcric.draft`** — fires daily at **14:00 local (2 PM SGT)**. Runs
  `scripts/agent-run.sh draft` → headless Claude drafts a preview/review (or an
  evergreen post) for an `active` series and sends it to Telegram. Uses
  `StartCalendarInterval`, so a missed fire (Mac asleep/off at 2 PM) runs at the
  next wake, and the dedupe state prevents double-drafting.

- **`com.cricdotcric.bot`** — an **always-on daemon** (`RunAtLoad` + `KeepAlive`),
  `scripts/telegram-bot.js`. It long-polls Telegram continuously and reacts in real
  time (~1s): posts on `✅ Approved`, acknowledges rejections/corrections, and
  handles `/draft <topic>` by spawning `agent-run.sh adhoc`. `KeepAlive` restarts
  it after crashes/logout.

There is no separate "check-and-post" schedule anymore — the daemon replaces it,
so approvals are instant rather than polled on an interval.

## Approval Loop, Not a Webhook

Approval runs over Telegram `getUpdates` long-polling inside the daemon, so the
system needs no public endpoint and no inbound server. Approval state lives in
`content/queue.json` and `state/telegram-offset.json` (plain files); Telegram
retains updates until acknowledged by offset, so nothing is lost across restarts.

## Prerequisites

- **X Premium** account (`@cricdotcric`) — allows long posts.
- **Secrets** at `~/.cricdotcric/secrets.json` (X + Telegram + Brave key).
- **Headless Claude auth** — a long-lived token from `claude setup-token` at
  `~/.cricdotcric/claude-oauth-token` (see `docs/RUNBOOK.md` for the setup and the
  keychain gotcha that can cause a 401).
- The Mac must be awake/online at 2 PM (or it catches up on wake).

## Install / manage

See `deploy/launchd/README.md` for `cp` + `launchctl load`, and `docs/RUNBOOK.md`
for day-to-day operations (trigger a draft now, restart the daemon, change the
model, handle a usage limit).

## Portability

The scripts are plain Node + a `bash` runner; only the two launchd plists are
macOS-specific. To relocate, reproduce the two jobs (a daily draft trigger + an
always-on bot process) on the target host.
