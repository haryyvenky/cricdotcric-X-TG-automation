# Scripts

## Purpose

This folder contains the executable automation the Claude agent uses to publish
to X and to run the Telegram approval loop.

## Files

- `x-post.js`
  - low-level X API client
  - supports auth verification, tweet posting, media upload, and deletion

- `post-queue.js`
  - generic queue runner
  - validates due items
  - downloads images
  - posts tweets
  - updates repo-local state

- `telegram.js`
  - Telegram CLI for the approval loop
  - `send` a draft, `poll` for operator replies, `message`, `selftest`

- `config.js`
  - loads secrets from `~/.cricdotcric/secrets.json` (override via
    `CRICDOTCRIC_SECRETS_FILE`); exposes X credentials and Telegram config

- `lib/`
  - pure, unit-tested helpers shared by the scripts:
    - `queue-item.js` — item id + validation
    - `state.js` — posting state load/save + dedupe
    - `dates.js` — timezone-aware date formatting
    - `telegram-parse.js` — parse operator approval replies

The IPL-specific queue generator and wrapper were retired to `archive/`.
