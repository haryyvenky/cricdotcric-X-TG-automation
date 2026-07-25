---
name: cricdotcric-post
description: Use when running a @cricdotcric drafting or check-and-post cycle - drafts cricket preview/review tweets for watchlisted series under a Telegram approval loop and posts approved items.
---

# cricdotcric posting workflow

You draft and publish cricket tweets for the `@cricdotcric` X account. Run modes:
**draft**, **revise**, and **check-and-post**. The mode is given in your prompt.

## Shared context
- Watchlist: `content/coverage.json` (only cover `active: true` series).
- Draft buffer: `content/queue.json` (items carry `status`).
- Editorial rules (tone, templates, image standards): `docs/editorial-template.md` — read it before drafting.
- Posting tools: `scripts/post-queue.js`, `scripts/x-post.js`, `scripts/telegram.js`.
- Image sourcing: `scripts/find-image.js` (Brave). Never post without operator approval. Never double-post (check `state/`).
- A pure-Node daemon (`scripts/telegram-bot.js`) handles approvals in real time and
  posts approved drafts — so in DRAFT mode you only need to draft + send to Telegram.

## DRAFT mode
1. Read `content/coverage.json`. For each `active` series, WebSearch fixtures:
   - upcoming matches in the next ~24h → `preview`
   - matches that finished in the last ~18h → `review`
2. Skip anything whose id is already in `content/queue.json` or `state/queue-state.json`.
3. For each new fixture, draft ONE tweet (no hashtags) following the preview/review
   template in `docs/editorial-template.md`. @cricdotcric is X Premium, so going over
   280 chars is fine when the extra detail earns it (e.g. a rich review) — but stay
   punchy; brevity is a feature, don't pad.
4. Source ONE image with `node scripts/find-image.js "<query>"` (Brave image
   search; e.g. query `"England vs India ODI 2026 <player> batting"`). It returns
   candidates that already download cleanly. **VIEW the top candidates (Read the
   image) and pick one that satisfies ALL strict rules** (live action, format-correct
   kit, same two teams, within 3 years). If none qualify, DO NOT queue it — send a
   Telegram message flagging that the item needs a manual image, and skip.
5. **FIRST** append the item to `content/queue.json` with `status: "pending"` and a
   unique `id` (e.g. `<series-id>-m<N>-preview`), and SAVE the file. This MUST happen
   and be flushed to disk **before** step 6 — never treat it as end-of-run cleanup.
   Why: the always-on bot posts the instant the operator replies "approved", and they
   often approve within seconds of the draft arriving. If the pending item isn't in
   the queue yet, the bot sees nothing to approve ("Nothing pending to approve right
   now") and the approval is lost. Persist first, notify second.
6. **ONLY AFTER** the queue write is saved, send the draft to Telegram:
   `node scripts/telegram.js send --text-file <tmpfile> --image <imageUrl>`
   Record the returned `messageId` on the queue item as `telegramMessageId`.
   The tweet body is the ONLY thing in `<tmpfile>` — do NOT add an
   "Approved / Approved with corrections / Rejected" options footer yourself.
   `telegram.js send` stamps that footer onto every draft automatically, so
   typing your own would duplicate it.
7. **Guarantee one post per day (evergreen fallback).** If, after steps 1–6, no
   fixture-based draft was produced for today (no watched match is upcoming or just
   finished), draft ONE evergreen cricket post instead — a stat, record, milestone,
   trivia, or nostalgia angle (prefer something tied to a watched team/series when
   possible). Source + validate an image the same way, queue it with a
   `type: "evergreen"` and a unique `id` (e.g. `evergreen-<YYYY-MM-DD>`), and send it
   to Telegram for approval. The account should never go a day without a post.
   **Evergreen/trivia posts MUST begin with the line `🏏 Trivia of the Day`, then a
   blank line, then the post** (this prefix is trivia-only — never on previews/reviews).

## REVISE mode
Given a specific pending item `id` and the operator's feedback (corrections or a
rejection), edit that EXISTING item — do not create a new one.
1. Find the item by `id` in `content/queue.json` (its feedback is also on `revisionNote`).
2. Apply the feedback: rewrite the copy and/or re-source the image (only re-source if
   the feedback is about the image), always honouring ALL strict content rules. For a
   `rejected` item, redo the specific flagged part; never discard the item.
3. Keep the SAME `id` and `status: "pending"`. If `type` is `evergreen`, keep the
   `🏏 Trivia of the Day` prefix.
4. SAVE `content/queue.json` FIRST (persist before notifying — same reason as DRAFT
   step 5), then re-send via `node scripts/telegram.js send --text-file <tmpfile>
   --image <imageUrl>` and update `telegramMessageId` to the new message id. Do NOT
   post to X — the operator approves the revised draft the normal way.

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
4. **Right teams, recent:** the image must be from the ONGOING match, or a previous
   match between the SAME two teams, within the last 3 years. Never use a photo that
   features a third team (e.g. an India-v-Pakistan shot for an England-v-India post).
5. **Trivia prefix:** every evergreen/trivia post opens with `🏏 Trivia of the Day`
   on its own line, then a blank line, then the copy. Previews and reviews never use it.

## Guardrails
- One tweet per fixture side (one preview, one review). No threads.
- Image must match the tweet subject. Generic/low-res images are rejected.
- If X or Telegram calls fail, leave the item `pending` and report the error.
- At least one post per day: if no fixture is due, use the evergreen fallback (DRAFT step 7).
