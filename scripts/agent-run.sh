#!/bin/bash
# cricdotcric agent runner — invoked by launchd (see deploy/launchd/).
# Usage: agent-run.sh [draft|check-and-post|adhoc "<topic>"]
#
# Runs the drafting/posting agent headlessly via the `claude` CLI. Requires the
# CLI to be authenticated for NON-INTERACTIVE use (run `claude setup-token` once,
# or export ANTHROPIC_API_KEY) — otherwise runs fail with HTTP 401.
set -uo pipefail

# Resolve the repo root from this script's own location — no hard-coded paths.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
CLAUDE="$(command -v claude || echo "$HOME/.local/bin/claude")"
# Drafting model. "sonnet" is light on Pro usage limits; switch to "opus" for wittier copy.
MODEL="sonnet"

# Non-interactive auth for the claude CLI. Token comes from `claude setup-token`
# and is stored (600) at ~/.cricdotcric/claude-oauth-token — never in the repo.
TOKEN_FILE="$HOME/.cricdotcric/claude-oauth-token"
if [ -f "$TOKEN_FILE" ]; then
  export CLAUDE_CODE_OAUTH_TOKEN="$(cat "$TOKEN_FILE")"
fi
# Make sure no inherited gateway/key overrides the token.
unset ANTHROPIC_BASE_URL ANTHROPIC_API_KEY 2>/dev/null || true

# If the drafting agent spawns background tasks, `claude -p` otherwise terminates
# them at a 600s wait ceiling and exits 0 with nothing produced (a missed draft
# that looks like a success). 0 = wait indefinitely for the work to finish.
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0

MODE="${1:-draft}"
TOPIC="${2:-}"
cd "$REPO" || exit 1
mkdir -p "$REPO/state/logs"
LOG="$REPO/state/logs/agent-${MODE}.log"

if [ "$MODE" = "draft" ]; then
  PROMPT="Invoke the cricdotcric-post skill and run DRAFT mode: read content/coverage.json; find fixtures due today for active series (preview for matches upcoming in ~24h, review for matches finished in the last ~18h). If no fixture is due, use the evergreen daily-post fallback. Draft ONE tweet (no hashtags; punchy), source and validate ONE rule-compliant image, append it to content/queue.json with status pending, and send it to Telegram for approval. Do NOT post to X in this run."
elif [ "$MODE" = "adhoc" ]; then
  PROMPT="Invoke the cricdotcric-post skill. Draft ONE ad-hoc @cricdotcric tweet about: ${TOPIC}. Follow ALL the skill's strict rules (funny/eccentric/editorial voice; image = live on-field action; format-correct kit; same two teams within 3 years). WebSearch for any current facts you need. Source ONE image with scripts/find-image.js and VIEW it to confirm it meets the rules. Append the item to content/queue.json with a unique id like adhoc-<short-slug>-$(date +%Y-%m-%d) and status pending, then send the draft to Telegram for approval. Do NOT post to X."
elif [ "$MODE" = "revise" ]; then
  ITEM_ID="${2:-}"
  FEEDBACK="${3:-}"
  PROMPT="Invoke the cricdotcric-post skill and run REVISE mode on the EXISTING pending item whose id is \"${ITEM_ID}\" in content/queue.json. Operator feedback to apply: ${FEEDBACK}. Rewrite the tweet copy and/or replace the image so it satisfies the feedback AND all strict editorial rules. Keep the SAME id and status pending. If the item's type is evergreen, the tweet MUST begin with the line '🏏 Trivia of the Day' followed by a blank line. Only re-source/verify the image (scripts/find-image.js) if the feedback concerns the image. SAVE the updated item to content/queue.json BEFORE notifying, then re-send the revised draft to Telegram via 'node scripts/telegram.js send' (which stamps the approval footer) and record the new messageId as telegramMessageId. Do NOT post to X."
else
  PROMPT="Invoke the cricdotcric-post skill and run CHECK-AND-POST mode: read state/telegram-offset.json (default 0), poll Telegram for approval replies, persist the new offset. For each approved pending item in content/queue.json, post it via the scripts, record state, set status posted, and send a Telegram confirmation with the live link. Handle corrections/rejections by revising and resending. Never double-post."
fi

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') : ${MODE} start ==="
  "$CLAUDE" -p "$PROMPT" --model "$MODEL" --dangerously-skip-permissions
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') : ${MODE} end (exit $?) ==="
} >> "$LOG" 2>&1
