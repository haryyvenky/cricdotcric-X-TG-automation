# cricdotcric-X-TG-automation

Queue-driven X/Twitter automation for the `@cricdotcric` cricket account, run
by a Claude Code subagent under a Telegram approval loop.

This project packages the working core of a cricket social media agent into a
clean, reviewable repository:

- editorial rules for preview and review tweets
- a curated series watchlist (`content/coverage.json`) instead of blanket live
  coverage
- a Claude subagent + skill that drafts tweets, sources images via WebSearch,
  and waits for Telegram approval before posting
- queue-based publishing with image attachment support
- durable posting state for idempotent runs
- clear separation between implementation, content, docs, and runtime state

## What This Demonstrates

This repository is useful as an engineering sample because it combines:

- workflow automation
- external API integration
- content validation and operational safeguards
- scheduler-aware design
- separation of code, config, content, and runtime state

It is intentionally small enough to review quickly while still showing real
system design decisions.

## What It Does

Coverage is opt-in, not blanket live cricket: the agent only works on series
listed with `active: true` in `content/coverage.json`, a curated watchlist. For
each active series it drafts:

- match-day **preview** posts
- next-morning **review** posts

Two Claude Code scheduled routines drive the workflow:

- a daily **draft** run that finds fixtures (via Claude WebSearch — there is no
  more schedule feed to poll), writes drafts to a queue, and sends them to
  Telegram for approval
- an every-~15-minute **check-and-post** run that polls Telegram for operator
  replies and posts approved drafts to X

Both routines invoke the `cricdotcric` subagent, which uses the
`cricdotcric-post` skill for the actual editorial and posting steps. A runner
validates due items, downloads the selected image, posts to X, and records
what was published so duplicate posting is avoided.

## Repository Layout

- `.claude/agents/cricdotcric.md`
  - the subagent invoked by both scheduled routines
- `.claude/skills/cricdotcric-post/SKILL.md`
  - the skill defining the draft and check-and-post workflows
- `scripts/`
  - implementation layer for posting, queue processing, and Telegram
- `content/`
  - `coverage.json` (series watchlist), `queue.json` (draft/approval buffer),
    and editorial artifacts
- `docs/`
  - editorial rules, architecture, and scheduler notes
- `state/`
  - local runtime state for queue posting history and Telegram poll offset
- `assets/`
  - optional local visual assets

## Core Flow

1. `.claude/agents/cricdotcric.md` + `.claude/skills/cricdotcric-post/SKILL.md`
   - drives both the draft and check-and-post modes end to end
2. `content/coverage.json`
   - the watchlist of series the agent is allowed to cover
3. `scripts/post-queue.js`
   - validates and posts due items from `content/queue.json`
4. `scripts/x-post.js`
   - low-level X posting client with media upload support
5. `scripts/telegram.js`
   - sends drafts to Telegram and polls for operator approval replies
6. `scripts/config.js` + `scripts/lib/`
   - shared secrets loading, queue-item validation, state, date, and
     Telegram-reply-parsing helpers
7. `state/*.json`
   - stores posting history and the Telegram poll offset so both runs are
     safe to execute repeatedly

## Secrets

This repository does not contain live credentials.

`scripts/config.js` reads credentials from:

1. `CRICDOTCRIC_SECRETS_FILE`, if set
2. otherwise `~/.cricdotcric/secrets.json`

Expected structure:

```json
{
  "twitterAccounts": {
    "cricdotcric": {
      "apiKey": "...",
      "apiSecret": "...",
      "accessToken": "...",
      "accessTokenSecret": "..."
    }
  },
  "telegram": {
    "botToken": "...",
    "chatId": "..."
  }
}
```

## Usage

Verify X account auth:

```bash
npm run verify
```

Verify Telegram connectivity:

```bash
npm run tg:selftest
```

Dry-run the poster against the current queue:

```bash
npm run post:due:dry
```

Post due items for real:

```bash
npm run post:due
```

Run the test suite:

```bash
npm test
```

## Scheduler Model

This repo does not depend on macOS `cron` or any hosted webhook.

Scheduling is handled by two Claude Code scheduled routines: a daily **draft**
run and an every-~15-minute **check-and-post** run, both invoking the
`cricdotcric` subagent. Operator approval happens over Telegram using a
poll-based loop (`scripts/telegram.js poll`), so no inbound webhook or public
endpoint is required. See `docs/scheduler.md`.

## Best Files To Review

- `.claude/agents/cricdotcric.md`
- `.claude/skills/cricdotcric-post/SKILL.md`
- `docs/architecture.md`
- `docs/editorial-template.md`
- `docs/scheduler.md`
- `scripts/post-queue.js`
- `scripts/telegram.js`
- `scripts/x-post.js`
- `content/coverage.json`
