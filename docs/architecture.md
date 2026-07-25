# Architecture

## Overview

A cricket X/Twitter posting system for `@cricdotcric` where **headless Claude
drafts, a human approves over Telegram, and a pure-Node daemon posts**. It runs
locally on a Mac via `launchd`, on a Claude Pro subscription.

Responsibilities separate into five layers:

1. coverage watchlist
2. editorial rules (skill + template)
3. drafting — headless Claude (Sonnet)
4. approval + posting — real-time Telegram bot daemon (pure Node)
5. runtime state

## 1. Coverage Watchlist

`content/coverage.json` — a curated list of series with an `active` flag. The
daily draft only covers series marked `active: true` (deliberately not "all live
cricket"). Fixtures are discovered at run time via Claude WebSearch — no schedule
feed is shipped or polled. Ad-hoc `/draft` posts are not restricted to the watchlist.

## 2. Editorial Rules

- `.claude/skills/cricdotcric-post/SKILL.md` — the workflow + the **strict rules**
- `docs/editorial-template.md` — tone, preview/review templates, image standards

**Strict rules (enforced on every tweet):** (1) funny/eccentric/editorial voice;
(2) image = live on-field action; (3) format-correct kit (Test whites / ODI kit /
T20 kit / franchise jersey); (4) same two teams, ongoing match or within the last
3 years. `@cricdotcric` is X Premium, so length may exceed 280 chars when detail
earns it.

## 3. Drafting — headless Claude

`scripts/agent-run.sh` runs `claude -p --model sonnet --dangerously-skip-permissions`
with a prompt that invokes the `cricdotcric-post` skill. Modes:

- **draft** (the 2 PM job): find a due fixture for an `active` series (preview for
  ~24h ahead, review for a match finished in the last ~18h; evergreen fallback if
  none), draft the tweet, source + VIEW-verify an image via `scripts/find-image.js`
  (Brave), append to `content/queue.json` as `pending`, and send the draft to
  Telegram.
- **adhoc "<topic>"** (triggered by the bot's `/draft`): same, for an arbitrary topic.
- **check-and-post**: retained legacy mode; real-time posting is now handled by the
  daemon (below), so this is a backup path.

Auth: a long-lived `claude setup-token` value at `~/.cricdotcric/claude-oauth-token`,
exported as `CLAUDE_CODE_OAUTH_TOKEN` by the runner (which also unsets any inherited
`ANTHROPIC_BASE_URL`).

## 4. Approval + Posting — the bot daemon

`scripts/telegram-bot.js` (launchd `com.cricdotcric.bot`, `KeepAlive`) long-polls
Telegram `getUpdates` and reacts in real time:

- **`/draft <topic>`** → spawns `agent-run.sh adhoc "<topic>"` (headless Claude).
- **✅ Approved** (reply to a draft) → posts the pending item via the shared
  `scripts/lib/posting.js` (validate → download image → `x-post.js` → record state →
  Telegram confirmation with the live link).
- **❌ Rejected / ✏️ corrections** → saves the feedback onto the item, then spawns
  `agent-run.sh revise <id> "<feedback>"` (headless Claude) to redo the draft and
  resend it for approval. Same LLM-does-the-judgment split as `/draft`: the daemon is
  pure Node, so anything needing revision is handed to the model, not faked.

Every draft the daemon-adjacent flow sends carries a fixed `✅ / ✏️ / ❌` options
footer, appended in code by `telegram.js send` (not hand-typed by the model, so it is
never omitted). Trivia (evergreen) posts additionally open with `🏏 Trivia of the Day`,
enforced in the skill and guaranteed by a `triviaPrefixed` backstop at post time.

Supporting posting scripts (`post-queue.js` batch runner, `check-and-post.js`
one-shot poller) share the same `lib/` and remain as manual/backup tools. Child
processes use `process.execPath` (not the bare name `node`) so they work under
launchd's minimal `PATH`.

## 5. Runtime State

- `state/queue-state.json` — posting history (idempotency / no double-post)
- `state/telegram-offset.json` — last Telegram update processed (owned by the daemon)
- `state/logs/` — agent + launchd logs

All gitignored.

## Key modules

- `scripts/config.js` — secrets: X creds, Telegram, Brave key
- `scripts/lib/queue-item.js` — `getItemId`, `validateItem` (image required; ≤25,000 chars)
- `scripts/lib/state.js` — load/save posting state + dedupe
- `scripts/lib/dates.js` — timezone-aware date formatting
- `scripts/lib/telegram-parse.js` — reply → decision (approved/corrections/rejected/unknown)
- `scripts/lib/posting.js` — shared approve→post logic (daemon + one-shot poller)

## Design Choices

- coverage is an explicit, editable watchlist — bounded editorial quality and usage
- posting always passes through operator approval; the agent proposes, never
  autonomously publishes
- state is separate from content so publishing is traceable and idempotent
- real-time approval via a long-polling daemon — no webhook, no public endpoint,
  no cloud; everything local on the Mac
- drafting model pinned (Sonnet) so behaviour/usage is deterministic
