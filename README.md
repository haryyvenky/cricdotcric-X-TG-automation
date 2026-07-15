# cricdotcric-X-TG-automation

Automated X/Twitter posting for the `@cricdotcric` cricket account: **headless
Claude drafts the tweets, you approve them in Telegram, and they post to X** —
running locally on a Mac via `launchd`, on a Claude Pro subscription (no API key).

- a curated series watchlist (`content/coverage.json`) — opt-in, not blanket
  live cricket
- a `cricdotcric-post` skill + subagent that encodes the editorial rules
- headless Claude (Sonnet) that finds fixtures, writes copy, and sources a
  rule-compliant match photo via the Brave image API
- a real-time Telegram bot for one-tap approval and phone-driven ad-hoc posts
- durable posting state for idempotent, no-double-post runs

## How it runs (two modes)

**1. Daily automatic (2 PM SGT).** `launchd` job `com.cricdotcric.draft` runs
`scripts/agent-run.sh draft` → headless `claude -p` invokes the `cricdotcric-post`
skill: finds a due fixture for an `active` series (WebSearch), drafts a preview or
review tweet, sources + verifies an image (`scripts/find-image.js`, Brave), queues
it `pending`, and sends the draft to Telegram.

**2. Ad-hoc from your phone.** Message the bot `/draft <topic>` → the always-on
daemon (`com.cricdotcric.bot`) fires the same headless drafting for that topic and
sends the draft to Telegram.

Either way, you reply **✅ Approved** in Telegram and the bot daemon posts to X
within ~1s and confirms with the live link. Nothing posts without your approval.

## Repository Layout

- `.claude/skills/cricdotcric-post/SKILL.md` — the editorial brain (workflow + strict rules)
- `.claude/agents/cricdotcric.md` — subagent that runs the skill
- `scripts/`
  - `agent-run.sh` — headless-Claude runner (modes: `draft`, `adhoc "<topic>"`, `check-and-post`)
  - `telegram-bot.js` — always-on daemon: real-time approvals + `/draft`
  - `find-image.js` — Brave image search + download validation
  - `x-post.js` — X API client (OAuth1, media upload)
  - `post-queue.js` / `check-and-post.js` — batch + one-shot posters (manual/backup)
  - `telegram.js` — Telegram CLI (send / poll / message / selftest)
  - `config.js` + `lib/` — secrets, validation, state, dates, telegram-parse, shared posting
- `content/` — `coverage.json` (watchlist), `queue.json` (draft/approval buffer)
- `deploy/launchd/` — the launchd plists + install/ops notes
- `docs/` — editorial rules, architecture, scheduler, **RUNBOOK (operations/handoff)**
- `state/` — posting history + Telegram offset + logs (gitignored)

## Secrets

Not in the repo. `scripts/config.js` reads from `CRICDOTCRIC_SECRETS_FILE`, else
`~/.cricdotcric/secrets.json`:

```json
{
  "twitterAccounts": {
    "cricdotcric": { "apiKey": "...", "apiSecret": "...", "accessToken": "...", "accessTokenSecret": "..." }
  },
  "telegram": { "botToken": "...", "chatId": "..." },
  "brave": { "apiKey": "..." }
}
```

Headless Claude auth uses a long-lived token from `claude setup-token`, stored at
`~/.cricdotcric/claude-oauth-token` and loaded by `scripts/agent-run.sh`.

## Usage (manual commands)

```bash
npm run verify        # verify X auth (@cricdotcric)
npm run tg:selftest   # verify Telegram bot → your chat
npm run post:due:dry  # dry-run the poster against the queue
npm test              # node --test
```

Trigger a draft immediately (same as the 2 PM job):
```bash
launchctl kickstart -k "gui/$(id -u)/com.cricdotcric.draft"
```

## Scheduling

macOS `launchd`, not cron or a webhook. `com.cricdotcric.draft` fires the daily
2 PM SGT draft (catches up on wake if the Mac was off); `com.cricdotcric.bot` is an
always-on (`KeepAlive`) long-polling daemon that handles approvals in real time.
Install/ops: `deploy/launchd/README.md`. Day-to-day operations + troubleshooting:
`docs/RUNBOOK.md`.

## Notes

- `@cricdotcric` is X Premium — tweets may exceed 280 chars (validator caps at 25,000).
- Drafting model is pinned to Sonnet in `scripts/agent-run.sh` (`MODEL="sonnet"`).
- Runs on the Claude Pro subscription; heavy days can hit a usage/session limit
  (not an error — the job catches up on the next wake).

## Best Files To Review

- `docs/RUNBOOK.md`, `docs/architecture.md`, `docs/editorial-template.md`
- `.claude/skills/cricdotcric-post/SKILL.md`, `.claude/agents/cricdotcric.md`
- `scripts/agent-run.sh`, `scripts/telegram-bot.js`, `scripts/find-image.js`
- `deploy/launchd/README.md`, `content/coverage.json`
