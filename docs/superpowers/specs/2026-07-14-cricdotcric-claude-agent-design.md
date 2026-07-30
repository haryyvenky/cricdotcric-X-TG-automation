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

The system is live and posting to @cricdotcric — **fully automatic, on the Claude
Pro subscription, no API key**. This section is the source of truth; see also
`docs/RUNBOOK.md`, `docs/architecture.md`, `docs/scheduler.md`.

## What shipped vs. the original design

- **Runtime = headless Claude, scheduled by macOS launchd** (not Claude Code
  routines — those were disabled via `CLAUDE_CODE_DISABLE_CRON` in this environment;
  not cloud — operator declined hosting/cost).
- **Two ways to draft, both headless Claude (Sonnet):**
  - **Daily 2 PM SGT** — `com.cricdotcric.draft` → `scripts/agent-run.sh draft`.
  - **Ad-hoc `/draft <topic>`** — the bot daemon spawns `agent-run.sh adhoc`.
- **Approval + posting = real-time Telegram bot daemon** (`scripts/telegram-bot.js`,
  launchd `KeepAlive`): `✅ Approved` posts within ~1s; `❌`/`✏️` get instant acks;
  `/draft` triggers drafting. Pure Node, no AI in the posting path.
- **Images via the Brave Search Image API** (`scripts/find-image.js`); the drafter
  VIEWS candidates and verifies them against the rules before use.
- **X Premium** — the 280-char validator was raised to 25,000 (`lib/queue-item.js`).

## Components (as built)

- `scripts/agent-run.sh` — headless-Claude runner. Modes: `draft`, `adhoc "<topic>"`,
  `revise <id> "<feedback>"` (added; see Addendum 2), `check-and-post` (backup).
  Loads `CLAUDE_CODE_OAUTH_TOKEN`; `MODEL="sonnet"`.
- `scripts/telegram-bot.js` — real-time daemon (approvals + `/draft`).
- `scripts/find-image.js` — Brave image search + validation.
- `scripts/config.js` (+ Brave key), `scripts/lib/{queue-item,state,dates,telegram-parse,posting}.js`.
- `scripts/x-post.js`, `scripts/post-queue.js`, `scripts/check-and-post.js` (manual/backup),
  `scripts/telegram.js`, `scripts/draft-reminder.js` (retained, unwired).
- `.claude/skills/cricdotcric-post/SKILL.md`, `.claude/agents/cricdotcric.md`.
- `content/coverage.json` (watchlist), `content/queue.json` (draft buffer).

## launchd jobs (installed + loaded)

- `com.cricdotcric.draft` — 14:00 SGT → `agent-run.sh draft` (headless Claude).
- `com.cricdotcric.bot` — always-on daemon (`KeepAlive`, `RunAtLoad`).
- (`com.cricdotcric.checkpost` retired — superseded by the daemon.)

## Strict content rules (enforced; in the skill, editorial-template, memory)

1. Funny/eccentric/editorial voice. 2. Image = live on-field action.
3. Format-correct kit. 4. Same two teams, ongoing or within 3 years.

## Fixes that made it work (2026-07-15)

- **Headless auth (was 401):** the CLI was using an EXPIRED keychain credential
  (`Claude Code-credentials`) and the token file held a superseded `setup-token`.
  Fixed: `claude update` (2.1.161→2.1.209), `security delete-generic-password -s
  "Claude Code-credentials"`, re-ran `setup-token` once, saved to
  `~/.cricdotcric/claude-oauth-token`. Now works. (Pro plan has usage/session
  limits — "session limit · resets <time>" is not an auth error.)
- **`spawnSync node ENOENT`:** launchd's minimal `PATH` lacks `node`. Fixed by using
  `process.execPath` in `lib/posting.js` and `post-queue.js`.
- **280-char rejection:** raised to 25,000 for the Premium account.

# Implementation Addendum 2 — hardening (2026-07-16 → 07-30)

Changes after the initial launch, driven by real operational issues:

- **Missed-job silent no-op (fixed).** When launchd fired the missed 2 PM draft on
  wake, headless Claude could run the drafting agent as a *background subtask* and
  `claude -p` killed it at a 600s wait ceiling, exiting `0` with nothing produced.
  Fix: `agent-run.sh` exports `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` (wait
  indefinitely). See DESIGN_NOTES quirk #1.
- **Approval lost to a race (fixed).** The drafter sent the Telegram draft *before*
  writing the pending item to `queue.json`; an operator who approved within seconds
  hit "Nothing pending". Skill now mandates **persist-to-queue first, notify second.**
- **Approval-options footer moved into code.** The `✅/✏️/❌` reminder was hand-typed
  by the AI and sometimes omitted. Now `telegram.js send` appends a constant
  `APPROVAL_FOOTER` to every draft caption — identical every time, never forgotten.
- **Corrections/rejections now auto-revise.** Previously the bot only acknowledged and
  the operator's notes were discarded ("next Claude session" = a manual step). Now on
  `❌ Rejected`/`✏️ corrections` the bot persists the feedback (`revisionNote`) and
  spawns `agent-run.sh revise <id> "<feedback>"` (new **REVISE** mode) → headless
  Claude redoes the draft and resends it for approval, mirroring the `/draft` flow.
- **Trivia prefix for evergreen posts.** Evergreen/trivia posts open with
  `🏏 Trivia of the Day`; previews/reviews never do. Enforced in the skill and
  guaranteed by a deterministic `triviaPrefixed()` backstop (`lib/queue-item.js`,
  applied in `postApproved`). +3 unit tests (26 total).
- **Watchlist is curated, multi-series.** `content/coverage.json` now holds several
  series with `active` toggles; finished series are set `active:false` (kept as
  history) and current ones activated. The 2 PM job drafts only ONE fixture/day, so
  overlapping active series are covered via `/draft` on the extra ones.

## Known open issue (not yet fixed)

- **Transient network failure mid-run is a silent no-op.** If headless Claude loses
  connectivity during a scheduled run (`API Error: ENOTFOUND` / "Connection closed
  mid-response"), it prints the error but still exits `0`, so the wrapper can't tell
  success from failure and no post is produced (cost the 2026-07-29 post). A guard
  that detects the failure and alerts/retries via Telegram is the next improvement.

## Operational note

`scripts/telegram-bot.js` is a long-running daemon — **after editing it, restart** so
the new code loads: `launchctl kickstart -k gui/$(id -u)/com.cricdotcric.bot`.
