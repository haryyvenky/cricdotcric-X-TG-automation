#!/bin/bash
# cricdotcric agent runner — invoked by launchd (see deploy/launchd/).
# Usage: agent-run.sh [draft|check-and-post]
#
# Runs the drafting/posting agent headlessly via the `claude` CLI. Requires the
# CLI to be authenticated for NON-INTERACTIVE use (run `claude setup-token` once,
# or export ANTHROPIC_API_KEY) — otherwise runs fail with HTTP 401.
set -uo pipefail

REPO="/Users/haryyvenky/cricdotcric-X-TG-automation"
CLAUDE="/Users/haryyvenky/.local/bin/claude"
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
cd "$REPO" || exit 1
mkdir -p "$REPO/state/logs"
LOG="$REPO/state/logs/agent-${MODE}.log"

if [ "$MODE" = "draft" ]; then
  PROMPT="Invoke the cricdotcric-post skill and run DRAFT mode: read content/coverage.json; find fixtures due today for active series (preview for matches upcoming in ~24h, review for matches finished in the last ~18h). If no fixture is due, use the evergreen daily-post fallback. Draft ONE tweet (<=280 chars, no hashtags), source and validate ONE relevant image, append it to content/queue.json with status pending, and send it to Telegram for approval. Do NOT post to X in this run."
else
  PROMPT="Invoke the cricdotcric-post skill and run CHECK-AND-POST mode: read state/telegram-offset.json (default 0), poll Telegram for approval replies, persist the new offset. For each approved pending item in content/queue.json, post it via the scripts, record state, set status posted, and send a Telegram confirmation with the live link. Handle corrections/rejections by revising and resending. Never double-post."
fi

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') : ${MODE} start ==="
  "$CLAUDE" -p "$PROMPT" --dangerously-skip-permissions
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') : ${MODE} end (exit $?) ==="
} >> "$LOG" 2>&1
