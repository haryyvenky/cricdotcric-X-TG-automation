# Architecture

## Overview

This project is a queue-driven social publishing system for cricket content on
X, orchestrated by a Claude Code subagent under a two-phase Telegram approval
loop rather than a fully autonomous poster.

It separates responsibilities into five layers:

1. coverage watchlist
2. editorial rules
3. the Claude subagent + skill (drafting and approval orchestration)
4. posting automation
5. runtime state

## Components

### 1. Coverage Watchlist

- `content/coverage.json`

A curated list of series with an `active` flag. The agent only drafts content
for series marked `active: true` — this is deliberately not "all live
cricket." Fixtures for active series are discovered at run time via Claude
WebSearch; there is no schedule feed shipped with or polled by the repo.

### 2. Editorial Rules

- `docs/editorial-template.md`

This document defines:

- preview tweet structure
- review tweet structure
- mandatory review elements
- tone and quality rules
- image sourcing standards

### 3. Claude Subagent + Skill

- `.claude/agents/cricdotcric.md`
- `.claude/skills/cricdotcric-post/SKILL.md`

The `cricdotcric` subagent is invoked in one of two modes, **draft** or
**check-and-post**, and always executes via the `cricdotcric-post` skill:

- **draft**: for each `active` series in `content/coverage.json`, WebSearch
  upcoming/finished fixtures, draft a preview or review tweet per
  `docs/editorial-template.md`, source an image via WebSearch/WebFetch, append
  the item to `content/queue.json` with `status: "pending"`, and send the
  draft to the operator via `scripts/telegram.js send`.
- **check-and-post**: poll Telegram for operator replies
  (`scripts/telegram.js poll`), match replies to pending queue items, and act
  on the parsed decision — `approved` triggers a post via
  `scripts/post-queue.js`, `corrections`/`rejected` send a revised draft back
  for another round, `unknown` is ignored.

The skill never posts without an explicit operator approval reply, and never
double-posts an item already recorded in state.

### 4. Posting Automation

- `content/queue.json` — the draft/approval buffer; items carry a `status`
  (`pending` / `posted`) alongside the usual tweet fields
- `scripts/post-queue.js`
- `scripts/x-post.js`
- `scripts/telegram.js`
- `scripts/config.js`
- `scripts/lib/queue-item.js`, `scripts/lib/state.js`, `scripts/lib/dates.js`,
  `scripts/lib/telegram-parse.js`

`post-queue.js` is the main operational entry point. It:

- loads `content/queue.json`
- filters due and unposted items (`scripts/lib/queue-item.js`,
  `scripts/lib/dates.js`)
- validates item quality
- downloads the image
- posts via `x-post.js`
- updates local posting state (`scripts/lib/state.js`)

`scripts/telegram.js` sends drafts (`send`), sends plain messages (`message`),
polls for operator replies (`poll`), and verifies connectivity (`selftest`).
`scripts/lib/telegram-parse.js` turns a raw reply into a structured decision
(`approved` / `corrections` / `rejected` / `unknown`). `scripts/config.js`
centralizes secrets loading (X credentials and the Telegram bot token/chat
id) for all scripts.

### 5. Runtime State

- `state/queue-state.json`
- `state/telegram-offset.json`

These files are intentionally local and excluded from Git.
`state/queue-state.json` makes the runner idempotent by recording what has
already been published; `state/telegram-offset.json` tracks the last Telegram
update processed so the check-and-post run never re-handles the same reply.

## Design Choices

- queue files are simple JSON so they are easy to inspect and edit
- state is stored separately from content so publishing remains traceable
- scripts use repo-relative paths so the project is portable
- credentials are externalized from the repository
- coverage is an explicit, editable watchlist rather than an implicit "all
  live cricket" scope, keeping editorial quality and API usage bounded
- posting always passes through an operator approval step; the agent drafts
  and proposes, it does not autonomously publish
