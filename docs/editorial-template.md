# Editorial Template — @cricdotcric

## Account
- Twitter/X: @cricdotcric (https://x.com/cricdotcric)
- Posting flow:
  - the Claude agent drafts queued posts for watchlisted series and sends them to Telegram for approval
  - only operator-approved drafts are published by the local posting scripts

## Workflow
- **Preview tweet** → Drafted + image sourced for the match day queue or approval flow
- **Review tweet** → Drafted + image sourced for the next-morning queue or approval flow
- **Format:** Single tweet only (no threads). @cricdotcric is X Premium — up to 25,000 chars allowed, so >280 is fine when detail earns it (e.g. a rich review); keep it punchy otherwise
- **Images:** Source fresh per tweet — Getty, AP Photo, PTI, AFP, Sky Sports, ESPNCricinfo galleries
- **No hashtags**

## Approval Workflow (MANDATORY — no tweet posts without approval)
Every draft goes through this Telegram approval loop before posting.
1. Draft sent to Telegram with image as caption in this format:
   ```
   📋 DRAFT [PREVIEW/REVIEW] — [Match]
   [tweet text]
   ---
   ✅ Approved — post as is
   ✏️ Approved with corrections: [notes]
   ❌ Rejected
   ```
2. The operator replies with one of the three options
3. **Approved** → post immediately to @cricdotcric, then send a copy of the posted tweet (image + text + live link) to Telegram as confirmation
4. **Approved with corrections** → revise, resend revised draft for final proofread → operator approves → post
5. **Rejected: [reason]** → redo whatever was flagged (bad copy / bad photo / both), resend revised draft for approval. Never discard on rejection — always redo and resubmit.
6. Draft state should be stored outside the committed repository while awaiting approval

## Queue Workflow
- The series watchlist (what to cover) lives in `content/coverage.json`
- Draft items are appended to `content/queue.json` with `status: "pending"`
- Posting state is recorded in repo-local `state/*.json`
- Queue items should be complete and production-ready before they are allowed to post

## Tone
- Fun, hype-driven, virality-focused
- Funny and punchy — like a fan who also knows the stats
- Stats = occasional spice, not the main dish

## STRICT RULES (never violate)
1. **Voice:** funny, eccentric, editorial — never bland or boring.
2. **Image = live action:** always players/teams IN ACTION on the cricket field — no posed portraits, headshots, or off-field/ceremony photos.
3. **Format-correct kit:** jersey must match the format covered — Test → whites; ODI → coloured ODI kit; T20I → T20 kit; franchise (IPL/BBL/PSL/etc.) → that franchise's jersey. Wrong-format kit = reject and re-source.
4. **Right teams, recent:** image must be from the ongoing match, or a prior match between the SAME two teams, within the last 3 years. Never feature a third team (e.g. India-v-Pakistan shot for an England-v-India post).

---

## PREVIEW TWEET TEMPLATE

```
[Team A emoji] vs [Team B emoji] — [punchy one-liner about the matchup]

[One spicy storyline, rivalry angle, or player narrative — 1-2 lines]

[1 stat that adds context or hype]

[Venue]. [Time IST]. [Hype closer]. 🔥
```

**Example (Match 1 — RCB vs SRH, 28 Mar):**
```
🔴 RCB vs 🟠 SRH — IPL 2026 kicks off TONIGHT.

Virat's back on home turf. SRH's batting lineup hit 287 last season. RCB's bowling has questions. This could be carnage.

Last 5 IPL openers have averaged 190+ runs. Expect fireworks.

Bengaluru. 7:30 PM. Buckle up. 🔥
```

---

## REVIEW TWEET TEMPLATE

**Mandatory elements for every IPL review post:**
- Match result
- Key performances from both sides
- Turning point / decisive phase
- Player of the Match
- Strong closer with personality

```
[Winner emoji] [Winner] [result headline / what they pulled off].

[Key batting and/or bowling performances that defined the game — include the main numbers]

[Turning point / decisive partnership / spell / collapse].

[Winner] won by [margin]. Player of the Match: [name]. [Sharp closer]. 🔥
```

**Example (MI vs KKR, 29 Mar 2026):**
```
🔵 MI pulled off a 221 chase and broke their opening-night curse.

Rohit Sharma (78 off 38) and Ryan Rickelton (81 off 43) blew this game open with a 148-run stand. KKR had 220/4 after Ajinkya Rahane's 67 and Angkrish Raghuvanshi's 51, but Shardul's 3/39 kept it just gettable.

Mumbai won by 6 wickets with 5 balls left. Player of the Match: Shardul Thakur. Wankhede got the drama it ordered. 🔥
```

---

## Team Emojis
| Team | Emoji |
|------|-------|
| RCB | 🔴 |
| SRH | 🟠 |
| MI | 🔵 |
| CSK | 🟡 |
| KKR | 🟣 |
| RR | 🩷 |
| GT | 🔷 |
| DC | 🔵 |
| PBKS | 🔴 |
| LSG | 🟢 |

---

## Image Sourcing Rules (MANDATORY)
- **Use WebSearch/WebFetch** to find images — be comprehensive, run multiple searches
- ICC Cloudinary generic images = BAD. Low-effort thumbnails, interview stills, cropped TV grabs, and generic banners = BAD.
- **Priority sources:** Getty Images, AP Photo, PTI, AFP, Sky Sports match galleries, ESPNCricinfo photo galleries, Outlook India photo galleries, BBC Sport, Sportstar (The Hindu), official team/IPL photography
- **Search strategy:** Run 2-3 targeted searches per image — vary keywords:
  - "[Player name] [specific action] [match] [venue] photo"
  - "[Team A] vs [Team B] [tournament] [date] pictures"
  - "[Player name] [tournament year] [innings/wickets] image"
- Scrape actual image URLs from the results pages, not just article links
- Every tweet needs a **UNIQUE, SPECIFIC** image — never reuse same image across tweets
- The image must be **directly relevant to the tweet**:
  - batting tweet → batting photo
  - bowling tweet → bowling photo
  - team preview → players/teams from that fixture
  - venue/stat post → image must still connect clearly to the subject
- Prefer **high-resolution, sharp, professional** images. Avoid visibly soft, tiny, pixelated, or awkwardly cropped images.
- Prefer the correct **team jersey / tournament context** when the tweet is about a player’s IPL moment.
- Verify image relevance BEFORE sending — check page context, filename/URL context, and visible content.
- If no strong image is found after exhaustive search → flag it to the operator. Do **not** post with a mediocre or generic fallback.
- **Image quality is reviewed after every send. Standard must be high.**
