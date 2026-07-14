---
name: cricdotcric-post
description: Use when running a @cricdotcric drafting or check-and-post cycle - drafts cricket preview/review tweets for watchlisted series under a Telegram approval loop and posts approved items.
---

# cricdotcric posting workflow

You draft and publish cricket tweets for the `@cricdotcric` X account. Two run
modes: **draft** and **check-and-post**. The mode is given in your prompt.

## Shared context
- Watchlist: `content/coverage.json` (only cover `active: true` series).
- Draft buffer: `content/queue.json` (items carry `status`).
- Editorial rules (tone, templates, image standards): `docs/editorial-template.md` — read it before drafting.
- Posting tools: `scripts/post-queue.js`, `scripts/x-post.js`, `scripts/telegram.js`.
- Never post without operator approval. Never double-post (check `state/`).

## DRAFT mode
1. Read `content/coverage.json`. For each `active` series, WebSearch fixtures:
   - upcoming matches in the next ~24h → `preview`
   - matches that finished in the last ~18h → `review`
2. Skip anything whose id is already in `content/queue.json` or `state/queue-state.json`.
3. For each new fixture, draft ONE tweet (≤280 chars, no hashtags) following the
   preview/review template in `docs/editorial-template.md`.
4. Source ONE specific, relevant, high-res image via WebSearch/WebFetch. Validate
   the URL loads. If no acceptable image is found, DO NOT queue it — send a
   Telegram message flagging that the fixture needs a manual image, and skip.
5. Append the item to `content/queue.json` with `status: "pending"` and a unique
   `id` (e.g. `<series-id>-m<N>-preview`).
6. Send the draft to Telegram:
   `node scripts/telegram.js send --text-file <tmpfile> --image <imageUrl>`
   Record the returned `messageId` on the queue item as `telegramMessageId`.

## CHECK-AND-POST mode
1. Read the saved Telegram offset from `state/telegram-offset.json` (default 0).
2. Poll: `node scripts/telegram.js poll --offset <offset>`. You own persistence:
   write the returned `newOffset` back to `state/telegram-offset.json` so replies
   are never re-processed.
3. For each reply, match `replyToMessageId` (or nearest pending item) to a
   `pending` queue item and act on `decision`:
   - `approved` → post it: `node scripts/post-queue.js queue.json --now <ISO>`
     targets due items; or post the single item by ensuring its `date`/`scheduledFor`
     are due. On success set `status: "posted"` and send a Telegram confirmation
     with the live link.
   - `corrections` → revise the tweet/image per `notes`, update the queue item,
     resend the draft, keep `status: "pending"`.
   - `rejected` → redo the flagged part (copy/photo/both) per `reason`, resend,
     keep `status: "pending"`. Never discard.
   - `unknown` → ignore (it was not an approval reply).
4. Never post an item already recorded in `state/queue-state.json`.

## Guardrails
- One tweet per fixture side (one preview, one review). No threads.
- Image must match the tweet subject. Generic/low-res images are rejected.
- If X or Telegram calls fail, leave the item `pending` and report the error.

## Verify
- Confirm the file exists and its frontmatter is intact: `head -4 .claude/skills/cricdotcric-post/SKILL.md` should show the `---` / `name:` / `description:` / `---` lines.
- `node --test` should still pass (21 tests) — unaffected by this doc.

## Commit
```bash
git add .claude/skills/cricdotcric-post/SKILL.md
git commit -m "feat: add cricdotcric-post skill (editorial brain)"
```

## Report Format
Report: Status (DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT), the `head -4` output confirming frontmatter, files changed, final commit SHA. Do not create anything beyond this one file.
