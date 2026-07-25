# cricdotcric — Runbook / Handoff

Operations guide for the `@cricdotcric` posting system. For architecture see
`docs/architecture.md`; for scheduling see `docs/scheduler.md`.

## What it is (one line)

Headless Claude (Sonnet) drafts cricket tweets → you approve in Telegram → a
real-time bot daemon posts to X. Runs locally on the Mac via `launchd`, on a Claude
Pro subscription (no API key). Every tweet is human-approved.

## Daily flow

- **2 PM SGT**: `com.cricdotcric.draft` auto-drafts a post for an `active` series in
  `content/coverage.json` and sends it to Telegram.
- **Anytime**: text the bot `/draft <topic>` for an ad-hoc draft.
- **You reply `✅ Approved`** (or `❌ Rejected: <why>` / `✏️ Approved with corrections: <notes>`).
  On approval the daemon posts within ~1s and replies with the live link.
  On a rejection or corrections it saves your feedback to the item and spawns
  headless Claude (`agent-run.sh revise`) to redo the draft and resend it here for
  approval — a few minutes, no manual step. Every draft message ends with the
  `✅ / ✏️ / ❌` options footer (stamped by `telegram.js send`, not the AI).
- **Trivia posts** (the evergreen daily fallback) open with `🏏 Trivia of the Day`;
  match previews/reviews do not. Enforced in the skill and as a code backstop
  (`triviaPrefixed` in `lib/queue-item.js`, applied at post time).

## Managing what gets covered

Edit `content/coverage.json` — the watchlist. Only `active: true` series are drafted
by the 2 PM job. Item shape:

```json
{ "id": "eng-v-ind-odi-2026", "name": "England vs India ODI Series 2026",
  "teams": ["ENG","IND"], "format": "ODI", "active": true,
  "startDate": "2026-07-14", "endDate": "2026-07-19" }
```

Add a series → new object with `active: true`. Stop covering → set `active: false`
(or remove it). Ad-hoc `/draft` is not limited to the watchlist.

## The strict tweet rules (enforced)

1. Funny / eccentric / editorial voice — never bland.
2. Image = live on-field action (no posed/portrait/off-field shots).
3. Format-correct kit: Test whites / ODI kit / T20 kit / franchise jersey.
4. Same two teams, ongoing match or within the last 3 years (never a third team).

Codified in `.claude/skills/cricdotcric-post/SKILL.md`, `docs/editorial-template.md`,
and agent memory. `@cricdotcric` is X Premium, so >280 chars is allowed (validator
caps at 25,000).

## Secrets & auth (all local, never in the repo)

- `~/.cricdotcric/secrets.json` — X keys, `telegram` (botToken/chatId), `brave.apiKey`.
- `~/.cricdotcric/claude-oauth-token` — long-lived headless Claude token.

## Common operations

```bash
# From the repo dir:
npm run verify                 # X auth OK? (expects @cricdotcric)
npm run tg:selftest            # Telegram bot → your chat OK?
npm test                       # unit tests

launchctl kickstart -k "gui/$(id -u)/com.cricdotcric.draft"   # draft now (test the 2 PM job)
launchctl kickstart -k "gui/$(id -u)/com.cricdotcric.bot"     # restart daemon (after a code change)
launchctl list | grep cricdotcric                             # both jobs registered?
tail -f state/logs/agent-draft.log                            # watch a draft run
tail -f state/logs/bot.out                                    # watch the daemon
```

## Change the drafting model

`scripts/agent-run.sh` → `MODEL="sonnet"` → `"opus"` for wittier copy (heavier on
Pro usage). No other change needed. Restart the daemon isn't required (agent-run.sh
is re-read each run), but the daily job picks it up automatically.

## Troubleshooting

**Draft never arrives / log shows `session limit · resets <time>`.**
Not an error — you hit the Pro usage cap. It resets at the stated time; the daily
job catches up on the next wake, or `kickstart` the draft after reset.

**Headless Claude 401 (`Invalid authentication credentials` / `Invalid bearer token`).**
Cause seen before: (a) an **expired keychain credential** shadowing the token, and/or
(b) the token file holding a *superseded* `setup-token`. Fix:
```bash
claude update                                              # keep the CLI current
security delete-generic-password -s "Claude Code-credentials"   # clear stale keychain login
claude setup-token                                        # run ONCE; copy the token
IFS= read -rs TOK && printf '%s' "$TOK" > ~/.cricdotcric/claude-oauth-token && unset TOK
# verify (clean env == what launchd gives it):
env -i HOME="$HOME" PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" USER="$USER" \
  CLAUDE_CODE_OAUTH_TOKEN="$(cat ~/.cricdotcric/claude-oauth-token)" \
  claude -p "say HEADLESS OK" --dangerously-skip-permissions
```
(Clearing the keychain may make a plain `claude` ask you to `/login` again — expected.)

**`Post failed: spawnSync node ENOENT`.** launchd's `PATH` lacks `node`. Already
fixed (scripts shell out via `process.execPath`); if it recurs, that's the place to
look.

**`tweet exceeds N chars`.** The Premium limit is 25,000 (`scripts/lib/queue-item.js`).

**Bad image (wrong teams / posed / wrong kit).** Reject in Telegram with a reason;
the drafter re-sources via Brave (`scripts/find-image.js`) and re-verifies by viewing.

**Two pollers conflict (Telegram 409).** Only the bot daemon should long-poll. Don't
run `check-and-post.js` or `agent-run.sh check-and-post` while the daemon is loaded.

## Key files

- `scripts/agent-run.sh` — headless-Claude runner (draft / adhoc / check-and-post)
- `scripts/telegram-bot.js` — always-on daemon (approvals + `/draft`)
- `scripts/find-image.js` — Brave image search
- `scripts/lib/posting.js` — shared approve→post logic
- `content/coverage.json` — the watchlist
- `deploy/launchd/` — the two plists + install notes
