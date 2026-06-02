# cricdotcric-X-TG-automation

Queue-driven X/Twitter automation for the `@cricdotcric` cricket account.

This project packages the working core of a cricket social media agent into a
clean, reviewable repository:

- editorial rules for preview and review tweets
- queue generation from the IPL schedule
- queue-based publishing with image attachment support
- durable posting state for idempotent runs
- clear separation between implementation, content, docs, and runtime state

## What It Does

The system manages two types of publishing flows:

- `IPL daily queue`
  - match-day preview posts
  - next-morning review posts
- `IPL hype queue`
  - preseason or campaign-style supporting posts

Publishing is driven by JSON queues. A runner validates due items, downloads the
selected image, posts to X, and records what was published so duplicate posting
is avoided.

## Repository Layout

- `scripts/`
  - implementation layer for posting and queue processing
- `content/`
  - production content queues and long-form editorial artifacts
- `docs/`
  - editorial rules, schedule fallback, architecture, and scheduler notes
- `state/`
  - local runtime state for queue posting history
- `assets/`
  - optional local visual assets

## Core Flow

1. `scripts/build-ipl-daily-queue.js`
   - builds the IPL queue from the official schedule feed, with markdown fallback
2. `scripts/post-queue.js`
   - validates and posts due items from a queue
3. `scripts/x-post.js`
   - low-level X posting client with media upload support
4. `state/*.json`
   - stores posting history so the runner is safe to execute repeatedly

## Secrets

This repository does not contain live credentials.

`scripts/x-post.js` reads credentials from:

1. `CRICDOTCRIC_SECRETS_FILE`, if set
2. otherwise `~/.openclaw/secrets.json`

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
  }
}
```

## Usage

Verify account auth:

```bash
node scripts/x-post.js --account cricdotcric --verify
```

Build the IPL queue:

```bash
node scripts/build-ipl-daily-queue.js
```

Dry-run the daily queue:

```bash
node scripts/post-queue.js ipl-daily-queue.json --dry-run
```

Post due daily IPL items:

```bash
node scripts/post-ipl-queue.js
```

## Scheduler Model

This repo does not depend on macOS `cron`.

In the original deployment, scheduling is handled by the OpenClaw internal cron
subsystem, while macOS `launchd` is used only to keep the OpenClaw gateway
alive. See `docs/scheduler.md`.

## Best Files To Review

- `docs/architecture.md`
- `docs/editorial-template.md`
- `docs/scheduler.md`
- `scripts/x-post.js`
- `scripts/post-queue.js`
- `content/ipl-daily-queue.json`
