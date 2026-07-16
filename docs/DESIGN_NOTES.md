# Design Notes, Quirks & Known Limitations

An honest tour of the non-obvious characteristics of this system — the trade-offs,
the sharp edges, and one core design principle. Written to be understood without
deep cricket or infra knowledge, but precise enough for an engineer.

The guiding trade-off throughout: **free, private, and simple** (runs on a personal
Mac and a Claude Pro subscription) in exchange for **not being a hardened, always-on
cloud service.** Every limitation below flows from that deliberate choice.

---

## Operational limitations (things that affect running it)

### 1. It only runs while the Mac is awake

Scheduling is macOS `launchd` — a timer local to the laptop. If the Mac is off or
asleep at 2 PM, the daily draft doesn't fire then; `StartCalendarInterval` runs a
missed job on the next wake, but a machine closed all day means no post that day.
The always-on alternative is a cloud server, deliberately skipped to keep the system
free and to keep secrets on-device.

**A subtle failure mode learned in practice:** when the missed job *does* fire on
wake, the drafting agent can spawn its work as a background subtask. `claude -p`
otherwise terminates that subtask at a 600-second wait ceiling and exits `0` — a
missed draft that *looks* like a success in the log. The fix is to make the runner
wait for the work: `agent-run.sh` exports `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`
so the process blocks until the draft actually completes rather than giving up early.

### 2. It runs on a Claude *subscription*, which has usage caps

Drafting uses headless Claude on a Claude Pro plan, which has session/usage limits.
On a heavy day a run can return `session limit · resets <time>` — **not an error**,
just the plan's ceiling. The job catches up after the reset. A metered API key would
remove the cap but adds per-use cost; the subscription path was chosen for zero
marginal cost.

### 3. The headless login token needs occasional maintenance

Non-interactive Claude authenticates with a long-lived token from `claude
setup-token`, stored at `~/.cricdotcric/claude-oauth-token`. Two gotchas learned in
practice:
- The token **expires roughly yearly** — re-run `setup-token` and re-save when it does.
- An **expired credential in the macOS keychain can silently shadow** the token,
  producing a confusing `401`. Fix: `security delete-generic-password -s "Claude
  Code-credentials"`, then re-token. (Full steps in `RUNBOOK.md`.)

### 4. Image sourcing is the fragile part; human approval is the accuracy check

Writing copy is easy for the model; the hard problem is a photo that is the correct
two teams, in the correct **format kit** (Test whites vs ODI colours vs T20 vs
franchise), showing live action, from a URL that actually loads. It's handled by
Brave image search plus the model **viewing** candidates and self-rejecting off-brief
ones — but this is the most likely place for a miss, and image URLs from news sites
can expire. Separately, the model pulls match facts (scores, figures) from web search
and can occasionally get a detail wrong. **This is precisely why every tweet passes a
human approval gate before publishing** — the approval is a correctness safeguard, not
a formality.

---

## Design notes (technical characteristics worth knowing)

### 5. Zero dependencies — including hand-rolled OAuth

The Node code uses **no third-party packages** — no `node_modules`, native `fetch`,
and the built-in `node --test` runner. Even Twitter/X's OAuth 1.0a request signing
(HMAC-SHA1 over a canonicalized request) is implemented from scratch in
`scripts/x-post.js`. Benefits: a tiny auditable codebase, no supply-chain risk, and
nothing that breaks when an upstream library changes. Cost: a bit more code we own
(e.g. the OAuth signing), which is a fair trade for a system this size.

### 6. "The AI proposes, deterministic code disposes" — the core principle

See the deep-dive section below. In short: the model has the power to *draft*, never
to *publish*. The irreversible action (posting to a public account) is performed only
by boring, testable, deterministic code, and only after a human approves. The safety
is **structural** — the model has no path to the publish button — not merely a matter
of instructing it politely.

### 7. Exactly one process may listen to Telegram

Telegram's `getUpdates` allows a single long-poller at a time; two would collide with
HTTP 409. So the architecture has exactly one always-running listener
(`scripts/telegram-bot.js`) and routes everything through it. An earlier design with a
separate scheduled "check-and-post" poller was removed for exactly this reason — a
concrete case of designing around a platform constraint.

### 8. State is plain JSON files, not a database

Coordination between the processes is done through simple, human-readable files: the
drafter writes an item to `content/queue.json`; the bot reads your approval and posts
from that same file; `state/telegram-offset.json` remembers which Telegram messages
were already handled so approvals are never double-processed; `state/queue-state.json`
records what's posted so nothing double-posts. Transparent and right-sized for a
single-account, single-machine deployment — and correctly limiting if it ever needed
to scale to concurrency or multiple machines (which would call for a real datastore).

---

## Deep dive: "the AI proposes, deterministic code disposes"

This one sentence is the spine of the design. It's worth unpacking because it's the
difference between "I wired an AI to an API" and "I designed a safe agent."

**An LLM and plain code fail in opposite ways.**
A large language model is a probabilistic generator: superb at open-ended judgment
(writing, choosing, reasoning), but non-deterministic and occasionally wrong in
unpredictable ways — it can hallucinate a fact, misread context, or be nudged by
text it reads (e.g. a prompt-injection buried in a match report online). Plain,
deterministic code is the mirror image: it can't invent anything, but given the same
input it does the exact same thing every time. It's verifiable and testable.

**Match the tool to the reversibility of the task.**
- *Drafting* a tweet or *choosing* an image is low-stakes and reversible — a bad
  draft is simply rejected, at zero cost. That's exactly where you want the model:
  you're paying for its creativity, and its mistakes are cheap and caught.
- *Publishing* to a live public account is high-stakes and effectively irreversible —
  once it's out, it's seen, screenshotted, indexed. That is the last place you want an
  unpredictable actor. You want something boring, exact, and auditable.

So the rule falls out naturally: **put the model where mistakes are cheap and caught;
put deterministic code where mistakes are expensive and permanent.**

**The boundary is physical, not just polite.**
In this system the model literally cannot post. Its entire "output" is: write a draft
to a file and send a Telegram message. It never holds the X API keys at posting time;
it never calls the posting endpoint. The publish is done later, by a separate program,
and only after a human approves. So even if the model went completely off the rails,
it has **no mechanism** to publish — the capability isn't wired to it. The safety is
enforced by architecture (least privilege), not by trusting the model to behave.

**Contrast with the naive build.**
The obvious version is: hand the model the Twitter keys and say "post this." It works
95% of the time — and then one day it publishes a half-finished draft, posts to the
wrong account, double-posts after losing track, or acts on an injected instruction it
read on the web. Taking the keys out of the model's hands and routing through
deterministic code plus a human makes that entire class of "the AI did something dumb,
publicly, permanently" failures **structurally impossible**, not just unlikely.

**A bug that proves the seam is real.**
The deterministic posting code runs in a genuinely different execution context (the
minimal `launchd` environment) than an interactive shell — so different that it
couldn't find the `node` binary and posting failed until we pointed it at the exact
path (`process.execPath`). That sharp edge is a feature of the design, not a
coincidence: the risky action lives in an isolated, boring, testable place, separate
from where a human tinkers.

**The principle in one line:** least privilege + separation of concerns +
human-in-the-loop for irreversible actions. The model gets the power to *propose*; it
never gets the power to *dispose*.
