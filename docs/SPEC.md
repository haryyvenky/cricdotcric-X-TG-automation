# cricdotcric — Master Spec

**System:** Autonomous cricket-tweeting agent for [@cricdotcric](https://x.com/cricdotcric)
**Status:** Live & production-proven
**Runtime:** Local macOS Mac, Claude Pro subscription (no API key, no cloud)

> This is the single, current source of truth for the system as built. It
> consolidates the original design spec and its two as-built addenda (kept as the
> historical design record in `docs/superpowers/specs/`).

## 1. Purpose

Run a real, live X/Twitter cricket account end-to-end: a headless Claude agent
drafts tweets for a curated watchlist of series, sources a rule-compliant match
photo, and routes each draft through a human Telegram approval gate before a
deterministic Node poster publishes it. Migrated off a prior "OpenClaw" system.

## 2. Core principle

**The AI proposes; deterministic code disposes.** The model has the power to
*draft* (write copy, pick + verify an image) but **never** to *publish*. The
irreversible action — posting to a public account — is done only by boring,
testable Node code, and only after a human approves. The boundary is structural
(the model never holds the X keys at post time), not a matter of instructing it
politely.

## 3. Architecture (as built)

```
coverage.json ──▶ headless Claude (Sonnet) via cricdotcric-post skill
   (watchlist)         │  finds fixture · writes copy · Brave image + VIEW-verify
                       ▼
              queue.json (status: pending) ──▶ Telegram draft (+ approval footer)
                       │                              │
                       │                    operator: ✅ / ✏️ / ❌
                       ▼                              ▼
             telegram-bot.js (always-on daemon, pure Node)
               ✅ approved     → validate → download img → x-post.js → state → ✅ link
               ✏️/❌ feedback   → save note → spawn agent-run.sh revise → redraft → resend
```

**Two ways to draft, both headless Claude (Sonnet):**

- **Scheduled** — `launchd com.cricdotcric.draft` at 14:00 SGT → `agent-run.sh
  draft`. Finds a due fixture (preview ≤24h ahead, review ≤18h after); if none, an
  **evergreen/trivia** fallback guarantees ≥1 post/day.
- **Ad-hoc** — text the bot `/draft <topic>` → daemon spawns `agent-run.sh adhoc`.

**Approval + posting = pure-Node daemon** (`telegram-bot.js`, launchd `KeepAlive`),
long-polls Telegram `getUpdates`, reacts in ~1s. No AI in the posting path.

## 4. Editorial rules (STRICT — enforced in skill + memory)

1. **Voice:** funny, eccentric, editorial — never bland.
2. **Image = live on-field action** — no posed/portrait/ceremony shots.
3. **Format-correct kit** — Test whites / ODI colours / T20 / franchise jersey must
   match the format covered.
4. **Right teams, recent** — image from the ongoing match or a prior match between
   the *same two teams* within 3 years; never a third team.
5. **Trivia prefix** — evergreen/trivia posts open with `🏏 Trivia of the Day` + a
   blank line; previews/reviews never do. (Skill rule **plus** a deterministic
   `triviaPrefixed()` backstop applied at post time.)

Account is **X Premium** → char limit 25,000 (not 280).

## 5. State & idempotency

Plain JSON files (no DB):

- `content/coverage.json` — watchlist (series with `active` toggles).
- `content/queue.json` — draft buffer; items carry `status: pending|posted` and an
  optional `revisionNote`.
- `state/queue-state.json` — posting history (dedupe → never double-post).
- `state/telegram-offset.json` — persisted `getUpdates` offset (approvals never
  reprocessed).

## 6. Component map

| Path | Role |
|---|---|
| `.claude/skills/cricdotcric-post/SKILL.md` | Editorial brain: DRAFT / REVISE workflows + strict rules |
| `.claude/agents/cricdotcric.md` | Subagent (Bash, Read, Write, WebSearch, WebFetch, Skill) |
| `scripts/agent-run.sh` | Headless-Claude runner. Modes: `draft`, `adhoc "<topic>"`, `revise <id> "<fb>"`, `check-and-post` |
| `scripts/telegram-bot.js` | Always-on daemon: approvals + `/draft` + auto-revise |
| `scripts/telegram.js` | Telegram CLI (`send` stamps the approval footer, `poll`, `message`, `selftest`) |
| `scripts/find-image.js` | Brave image search + download validation |
| `scripts/x-post.js` | X API v2 client, hand-rolled OAuth 1.0a, zero deps |
| `scripts/post-queue.js` / `check-and-post.js` | Batch / one-shot posters (manual backup) |
| `scripts/config.js` | Secrets loader |
| `scripts/lib/{queue-item,state,dates,telegram-parse,posting}.js` | Pure, unit-tested helpers |
| `deploy/launchd/` | The two launchd jobs + install notes |
| `docs/{RUNBOOK,architecture,DESIGN_NOTES,scheduler,editorial-template}.md` | Ops + design docs |
| `test/` | `node --test` unit suite |

## 7. Auth & secrets (never committed)

- `~/.cricdotcric/secrets.json` — X keys, Telegram botToken/chatId, Brave apiKey.
- `~/.cricdotcric/claude-oauth-token` — long-lived `claude setup-token` for headless
  auth. Exported as `CLAUDE_CODE_OAUTH_TOKEN`; `ANTHROPIC_BASE_URL` / `API_KEY`
  unset so nothing overrides the token.
- Operator-specific memory (e.g. the Telegram chat id) lives **outside** the repo.

## 8. Hardening fixes (the operational lessons)

- **Headless 401** — an expired keychain credential shadowed the token → delete it,
  re-token.
- **`spawnSync node ENOENT`** — launchd's minimal PATH lacks `node` → use
  `process.execPath`.
- **Missed-job silent no-op** — a background subtask was killed at a 600s wait
  ceiling → `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`.
- **Approval race** — draft was sent before the queue item was persisted → skill
  mandates **persist-first, notify-second**.
- **Footer forgotten** — moved the approval-options footer from AI-typed to
  code-stamped (`telegram.js send`).
- **Corrections lost** — now persist the feedback and spawn `revise` mode
  (auto-redraft & resend), instead of only acknowledging.

## 9. Known open issue

**Transient network drop mid-run = silent no-op.** If headless Claude loses
connectivity during a scheduled run (`ENOTFOUND` / "Connection closed
mid-response"), it prints the error but still exits `0`; no post is produced and
nothing alerts. **Next improvement:** detect the failure and alert/retry via
Telegram. *(Not yet built.)*

## 10. Operating quick reference

- **Trigger a manual draft:** `launchctl kickstart -k gui/$(id -u)/com.cricdotcric.draft`
- **After editing `telegram-bot.js`, restart the daemon:**
  `launchctl kickstart -k gui/$(id -u)/com.cricdotcric.bot`
- **Curate coverage:** edit `content/coverage.json` — only `active: true` series are
  drafted by the 2 PM job; overlapping active series are covered via `/draft`.
- **Tests:** `npm test`. **Verify X auth:** `npm run verify`. **Telegram check:**
  `npm run tg:selftest`.

Full operations and troubleshooting: `docs/RUNBOOK.md`.
