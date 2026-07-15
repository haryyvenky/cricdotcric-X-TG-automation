#!/bin/bash
# cricdotcric agent runner — invoked by launchd (see deploy/launchd/).
# Usage: agent-run.sh [draft|check-and-post|adhoc "<topic>"]
#
# Runs the drafting/posting agent headlessly via the `claude` CLI. Requires the
# CLI to be authenticated for NON-INTERACTIVE use (run `claude setup-token` once,
# or export ANTHROPIC_API_KEY) — otherwise runs fail with HTTP 401.
set -uo pipefail

REPO="/Users/haryyvenky/cricdotcric-X-TG-automation"
CLAUDE="/Users/haryyvenky/.local/bin/claude"
# Drafting model. "sonnet" is light on Pro usage limits; switch to "opus" for wittier copy.
MODEL="sonnet"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Non-interactive auth for the claude CLI. Token comes from `claude setup-token`
# and is stored (600) at ~/.cricdotcric/claude-oauth-token — never in the repo.
TOKEN_FILE="$HOME/.cricdotcric/claude-oauth-token"
if [ -f "$TOKEN_FILE" ]; then
  export CLAUDE_CODE_OAUTH_TOKEN="$(cat "$TOKEN_FILE")"
fi
# Make sure no inherited gateway/key overrides the token.
unset ANTHROPIC_BASE_URL ANTHROPIC_API_KEY 2>/dev/null || true

MODE="${1:-draft}"
TOPIC="${2:-}"
cd "$REPO" || exit 1
mkdir -p "$REPO/state/logs"
LOG="$REPO/state/logs/agent-${MODE}.log"

if [ "$MODE" = "draft" ]; then
  PROMPT="Invoke the cricdotcric-post skill and run DRAFT mode: read content/coverage.json; find fixtures due today for active series (preview for matches upcoming in ~24h, review for matches finished in the last ~18h). If no fixture is due, use the evergreen daily-post fallback. Draft ONE tweet (no hashtags; punchy), source and validate ONE rule-compliant image, append it to content/queue.json with status pending, and send it to Telegram for approval. Do NOT post to X in this run."
elif [ "$MODE" = "adhoc" ]; then
  PROMPT="Invoke the cricdotcric-post skill. Draft ONE ad-hoc @cricdotcric tweet about: ${TOPIC}. Follow ALL the skill's strict rules (funny/eccentric/editorial voice; image = live on-field action; format-correct kit; same two teams within 3 years). WebSearch for any current facts you need. Source ONE image with scripts/find-image.js and VIEW it to confirm it meets the rules. Append the item to content/queue.json with a unique id like adhoc-<short-slug>-$(date +%Y-%m-%d) and status pending, then send the draft to Telegram for approval. Do NOT post to X."
else
  PROMPT="Invoke the cricdotcric-post skill and run CHECK-AND-POST mode: read state/telegram-offset.json (default 0), poll Telegram for approval replies, persist the new offset. For each approved pending item in content/queue.json, post it via the scripts, record state, set status posted, and send a Telegram confirmation with the live link. Handle corrections/rejections by revising and resending. Never double-post."
fi

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') : ${MODE} start ==="
  "$CLAUDE" -p "$PROMPT" --model "$MODEL" --dangerously-skip-permissions
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') : ${MODE} end (exit $?) ==="
} >> "$LOG" 2>&1
