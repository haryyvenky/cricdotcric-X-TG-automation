# cricdotcric Claude Agent — Design Spec

**Date:** 2026-07-14
**Status:** Approved for planning
**Author:** brainstorming session (Claude Code)

## Purpose

Migrate the `@cricdotcric` X/Twitter posting automation off OpenClaw and onto a
Claude-native runtime. The current repository contains only the deterministic
posting harness plus stale IPL-2026 content; the "agent" behavior (drafting copy,
sourcing images, the Telegram approval loop, and scheduling) lived inside OpenClaw
and must be rebuilt on Claude Code.

The relaunched system is a **Claude Code scheduled agent** that covers a
**curated watchlist of cricket series** (not all live cricket), drafts
preview/review tweets under a human **Telegram approval loop**, and posts approved
items through the existing Node scripts.

## Background / Current State

- `scripts/x-post.js` — self-contained OAuth1 X API client (post, media upload,
  verify, delete). No dependencies, native `fetch`, Node >= 20. **Solid — keep.**
- `scripts/post-queue.js` — idempotent queue runner (validate → dedupe via
  `state/` → download image → post → record state). **Keep, with one fix.**
- `scripts/build-ipl-daily-queue.js` — builds an IPL queue from an S3 feed.
  IPL-specific, and its generated copy is rejected by the runner. **Archive.**
- `scripts/post-ipl-queue.js` — thin IPL wrapper. **Archive.**
- `content/ipl-daily-queue.json` — 124 items, **zero `imageUrl` fields**, dates in
  the past. **Archive.**
- `content/ipl-hype-queue.json` — postable format but stale March-2026 dates.
  **Archive.**
- `content/t20wc2026-thread.md` — long-form editorial artifact. **Keep as reference.**
- `docs/editorial-template.md` — editorial rules, tone, templates, image rules.
  **Keep; source of the skill.**
- `docs/cto-review-guide.md`, `docs/interview-qa.md` — portfolio framing, not
  runtime. **Move to `archive/`.**
- `docs/ipl-2026-schedule.md` — IPL fallback schedule. **Archive.**
- Telegram ("TG" in the repo name) — **no code exists**; only described as a manual
  step. Must be built.

### Known bugs being fixed

1. `post-queue.js` `validateItem` blocks copy matching placeholder regexes
   (`IPL today:`, `New day, new noise`, etc.) — which are exactly the strings the
   IPL generator produced. Combined with the mandatory `imageUrl` check against a
   queue that has no images, **the daily queue can never post.** The placeholder
   blocklist is removed; structural validation stays.
2. Secrets default to `~/.openclaw/secrets.json` and User-Agent strings say
   `OpenClaw`. Both are de-coupled from OpenClaw.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Scope | Full Claude agent: Claude drafts copy, sources images, drafts posts |
| Approval | Telegram human approval loop (draft → approve → post) |
| Scheduling | Claude Code scheduled routines |
| Runtime model | The agent **is** a Claude Code scheduled session; reuses `scripts/` as tools |
| Content scope | Curated **watchlist of series**, not all live cricket |
| Watchlist control | User provides series as text in chat; assistant persists to `content/coverage.json` (source of truth for scheduled runs) |
| Approval loop mechanics | Two-phase, poll-based (draft run + separate check-and-post run), Mac-local via Telegram `getUpdates` |
| Fixtures source | Claude WebSearch (replaces the dead IPL S3 feed) |
| Image source | Claude WebSearch/WebFetch (replaces the Brave Search API dependency) |

## Architecture

Two scheduled phases, both Claude Code sessions so drafting **and** revisions can
use the model.

### Phase 1 — Draft run (daily, configurable time)

1. Read `content/coverage.json` → active series.
2. WebSearch fixtures for those series: upcoming matches (for previews) and
   recently completed matches (for reviews).
3. For each due preview/review not already drafted or posted (dedupe via `state/`):
   - Draft copy following the editorial skill (tone, preview/review templates,
     ≤ 280 chars, no hashtags, single tweet).
   - Source an image via WebSearch/WebFetch; validate the URL is reachable and
     relevant. **If no acceptable image is found, do not draft-to-post — flag to
     the operator via Telegram instead.**
   - Append the item to `content/queue.json` with `status: pending`.
   - Send the draft to Telegram in the DRAFT format; record the
     draft-id ↔ Telegram-message-id mapping in `state/`.
4. Exit.

### Phase 2 — Check-and-post run (every ~10–15 min)

1. `scripts/telegram.js` polls `getUpdates` using the persisted offset in `state/`.
2. Match each reply back to a `pending` draft:
   - **Approved** → download image, post via `x-post.js`, record posting state,
     set item `posted`, send a Telegram confirmation with the live link.
   - **Approved with corrections** → Claude revises per the notes, resend revised
     draft, keep `pending`.
   - **Rejected** → Claude redoes the flagged part (copy/photo/both), resend,
     keep `pending`. **Never discard on rejection — always redo and resubmit.**
3. Persist the new Telegram offset and updated draft statuses.
4. Exit.

## Components

| Component | Type | Notes |
| --- | --- | --- |
| `.claude/skills/cricdotcric-post/SKILL.md` | new | Editorial brain: workflow, tone, preview/review templates, image rules. Distilled from `docs/editorial-template.md`. |
| `.claude/agents/cricdotcric.md` | new | Subagent with a tight toolset: WebSearch, WebFetch, Bash, Read, Write. |
| `scripts/x-post.js` | keep | Only change: secrets path/config. |
| `scripts/post-queue.js` | keep + fix | Remove placeholder-copy blocklist; keep structural validation. Generalize IPL-specific naming where trivial. |
| `scripts/telegram.js` | new | `send` a draft, `poll` (`getUpdates`), `confirm` a post. Only substantial new code. |
| `content/coverage.json` | new | Watchlist / source of truth. |
| `content/queue.json` | new | Generalized draft buffer; items carry `status: pending\|approved\|posted\|rejected`. |
| `state/*.json` | keep | Posting history, draft/approval state, Telegram offset. Gitignored. |
| `archive/` | new | Top-level dir for retired code + content + docs: IPL generator, IPL wrapper, old queues, `ipl-2026-schedule.md`, `cto-review-guide.md`, `interview-qa.md`. |

## Data Flow & State

```
coverage.json ──▶ Draft run ──▶ queue.json (pending) + Telegram draft
                                     │  (draft-id ↔ message-id map in state/)
                    your reply ──────┘
                          │
                          ▼
                 Check-and-post run ──▶ post via x-post.js ──▶ state/ posting history
                                                            └─▶ queue.json (posted)
                                                            └─▶ Telegram confirmation (live link)
```

**Idempotency guarantees:**
- Dedupe by draft id before posting.
- Persist the Telegram `getUpdates` offset so replies are never processed twice.
- Check posting state before every send so nothing double-posts.

## Secrets / Config

Move off OpenClaw to `~/.cricdotcric/secrets.json`, overridable via
`CRICDOTCRIC_SECRETS_FILE`:

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

### `content/coverage.json` shape (draft)

```json
{
  "series": [
    {
      "id": "ind-aus-t20i-2026",
      "name": "India vs Australia T20I Series 2026",
      "teams": ["IND", "AUS"],
      "format": "T20I",
      "active": true,
      "startDate": "2026-07-20",
      "endDate": "2026-08-05"
    }
  ]
}
```

## Error Handling

- **No image found** after search → do not post; flag to the operator via Telegram.
- **No fixtures** for watched series on a given day → clean no-op run, logged.
- **Telegram send failure** → item stays `pending`, retried next cycle.
- **X post failure** → item stays `pending`, operator alerted via Telegram.
- **Rejection** → always redo and resend; never discard.
- All posting paths check state first to prevent double-posting.

## Testing

- `node --test` unit coverage for pure logic:
  - `validateItem` (structural rules, 280-char limit, date format, image URL)
  - Telegram reply parsing (Approved / Approved-with-corrections / Rejected)
  - dedupe / state transitions
  - date & timezone handling
- Retain `post-queue.js --dry-run`.
- Add a Telegram dry-run / self-test (send a test message to the configured chat).
- Reuse `x-post.js --account cricdotcric --verify` for auth verification.
- Full-stack manual run after build; fix errors as they surface (per user).

## Scheduling

Two Claude Code scheduled routines:
- **Draft routine** — once daily at a configurable time.
- **Check-and-post routine** — every ~10–15 minutes during active windows.

## Housekeeping Summary

**Keep:** `x-post.js`, `post-queue.js` (fixed), `state/`, `assets/`,
`editorial-template.md`.
**Archive** (to top-level `archive/`): IPL generator, IPL wrapper, stale
queues, `ipl-2026-schedule.md`, `cto-review-guide.md`, `interview-qa.md`.
**Add:** skill, subagent, `telegram.js`, `coverage.json`, generalized `queue.json`.
**Update:** `README.md`, `docs/architecture.md`, `docs/scheduler.md` to describe the
Claude-native design.

## Out of Scope

- Telegram command-based watchlist management (config file + chat is the mechanism).
- Webhook-based approval (poll-based only).
- Engagement management, analytics, multi-user concurrency, general social CMS.
- Programmatic Anthropic API service (runtime is Claude Code sessions).

## Open Items (needed before relaunch, not before planning)

1. The actual **series list** to seed `coverage.json`.
2. **Credentials**: X API keys + Telegram bot token + operator chat ID.

---

# Implementation Addendum — as built (2026-07-15)

The system is live and posting to @cricdotcric. What actually shipped differs from
the original design in a few important ways; this section is the source of truth.

## What changed vs. the original design

- **Runtime is NOT a headless Claude agent.** Headless `claude -p` will not
  authenticate on the operator's Mac — a persistent `401 Invalid authentication
  credentials`, even with a valid Claude Pro/Max `claude setup-token` (fresh token,
  correct account, clean shell all verified). So the "Claude does everything on a
  schedule" model is not achievable here yet. See "Headless auth blocker" below.
- **Semi-automatic split instead:**
  - **Drafting (the only AI step)** — done in an interactive Claude session
    (operator asks; Claude drafts copy + sources/verifies an image + sends the draft
    to Telegram). Uses the working interactive subscription; no extra cost.
  - **Posting — fully automated, pure Node, no AI.** A real-time Telegram bot daemon
    posts approved drafts within ~1s and confirms with the live link.
- **Scheduling is local macOS launchd, not cloud** (operator declined cloud to avoid
  cost; cloud would also need the repo + secrets hosted off-machine).
- **Images via the Brave Search Image API** (`scripts/find-image.js`), not
  WebSearch/WebFetch — needed to meet the strict image rules with real match photos.
  The drafter VIEWS candidates and verifies them against the rules before use.

## Components (as built)

- `scripts/config.js` — secrets loader: X creds, Telegram, **Brave API key**.
- `scripts/lib/{queue-item,state,dates,telegram-parse,posting}.js` — pure helpers
  (`posting.js` holds the shared approve→post logic).
- `scripts/x-post.js` — X client. `scripts/post-queue.js` — batch queue runner.
- `scripts/telegram.js` — Telegram CLI (send/poll/message/selftest).
- `scripts/find-image.js` — Brave image search + download validation.
- `scripts/telegram-bot.js` — **real-time long-polling daemon** (approve→post,
  reject/corrections → instant ack). Run via launchd `KeepAlive`.
- `scripts/check-and-post.js` — one-shot poller (manual/backup; don't run alongside
  the daemon — Telegram allows one long-poller).
- `scripts/draft-reminder.js` — 2 PM SGT Telegram nudge to draft.
- `scripts/agent-run.sh` — claude-headless runner, retained for if/when headless
  auth is fixed (would re-enable fully-unattended drafting).
- `.claude/skills/cricdotcric-post/SKILL.md`, `.claude/agents/cricdotcric.md`.
- `content/coverage.json` (watchlist: England v India ODI series 2026),
  `content/queue.json` (draft buffer).

## launchd jobs (installed + loaded)

- `com.cricdotcric.bot` — always-on daemon (`KeepAlive`, `RunAtLoad`).
- `com.cricdotcric.draft` — 14:00 local (2 PM SGT) draft reminder.
- (`com.cricdotcric.checkpost` was retired — superseded by the daemon.)

## Strict content rules (enforced; also in the skill, editorial-template, memory)

1. Voice: funny, eccentric, editorial — never bland.
2. Image = live action on the field (no posed/portrait/off-field shots).
3. Format-correct kit (Test whites / ODI kit / T20 kit / franchise jersey).
4. Same two teams, ongoing match or within the last 3 years (never a third team).

## Ad-hoc posting

Operator asks in Claude → draft + Brave image (verified) → Telegram → approve → the
daemon posts. A phone-only "instruct the bot to draft" flow is blocked by the same
headless-auth wall (bot is pure Node; drafting needs an AI it can invoke).

## Headless auth blocker (open)

`claude -p ... --dangerously-skip-permissions` → `401 Invalid authentication
credentials`. Ruled out: token file format, env pollution (`ANTHROPIC_BASE_URL`/key),
wrong account, stale token. Root cause not yet identified. Fixing it (or using a
metered `ANTHROPIC_API_KEY`) would unlock fully-unattended drafting and a bot
`/draft <topic>` command.
