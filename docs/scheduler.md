# Scheduler

## Scheduling Model

Scheduling is handled by two Claude Code scheduled routines, not by macOS
`cron` or any hosted webhook service. Both routines invoke the same
`cricdotcric` subagent (`.claude/agents/cricdotcric.md`), passing the mode as
part of the prompt:

- **draft** — runs once a day. Finds fixtures for `active` series in
  `content/coverage.json` via WebSearch, drafts preview/review tweets, sources
  images, appends them to `content/queue.json`, and sends each draft to the
  operator over Telegram for approval.
- **check-and-post** — runs roughly every 15 minutes. Polls Telegram for
  operator replies (approve / request corrections / reject) using the offset
  saved in `state/telegram-offset.json`, and posts any newly approved item via
  `scripts/post-queue.js`.

Both routines execute the same `cricdotcric-post` skill
(`.claude/skills/cricdotcric-post/SKILL.md`), just in different modes.

## Approval Loop, Not a Webhook

Because operator approval is driven by `scripts/telegram.js poll` (Telegram's
`getUpdates` long/short polling), this system needs no hosted webhook, no
public endpoint, and no always-on server process. The check-and-post routine
simply needs to run periodically on a machine with network access and the
Telegram bot token — it can run Mac-local. This keeps the operational surface
small:

- there is nothing listening for inbound requests
- approval state lives in `content/queue.json` and `state/telegram-offset.json`,
  both plain files
- a missed or delayed check-and-post run just means approval is picked up on
  the next poll, with no lost messages (Telegram retains updates until they
  are acknowledged by offset)

## Why This Matters

This model is operationally cleaner than a bespoke server:

- the two routines are the entire schedule — no extra process supervision
- runtime state is centralized under `state/`
- there is no webhook infrastructure to secure or keep alive

## Portable Use

The same two-routine model — a daily draft pass and a frequent
check-and-post pass, both invoking the `cricdotcric` subagent — can run
anywhere Claude Code scheduled routines can run, not just on a single Mac.
The scripts themselves are plain Node and do not depend on macOS-specific
behavior; only the scheduling of the two routines needs to move if you
relocate the deployment.
