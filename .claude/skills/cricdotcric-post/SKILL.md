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
7. **Guarantee one post per day (evergreen fallback).** If, after steps 1–6, no
   fixture-based draft was produced for today (no watched match is upcoming or just
   finished), draft ONE evergreen cricket post instead — a stat, record, milestone,
   trivia, or nostalgia angle (prefer something tied to a watched team/series when
   possible). Source + validate an image the same way, queue it with a
   `type: "evergreen"` and a unique `id` (e.g. `evergreen-<YYYY-MM-DD>`), and send it
   to Telegram for approval. The account should never go a day without a post.

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

## Strict content rules (NEVER violate)
1. **Voice:** funny, eccentric, editorial — never bland or boring.
2. **Image = live action:** always players/teams IN ACTION on the cricket field.
   No posed portraits, headshots, or off-field/handshake/ceremony photos.
3. **Format-correct kit:** the players' jersey MUST match the format being covered —
   Test → whites; ODI → coloured ODI kit; T20I → T20 kit; franchise (IPL/BBL/PSL/etc.)
   → that franchise's jersey. Wrong-format kit (e.g. Test whites on an ODI post) =
   reject and re-source the image.

## Guardrails
- One tweet per fixture side (one preview, one review). No threads.
- Image must match the tweet subject. Generic/low-res images are rejected.
- If X or Telegram calls fail, leave the item `pending` and report the error.
- At least one post per day: if no fixture is due, use the evergreen fallback (DRAFT step 7).
