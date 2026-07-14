# cricdotcric Claude Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `@cricdotcric` X automation off OpenClaw to a Claude Code scheduled agent that covers a curated series watchlist, drafts tweets under a Telegram approval loop, and posts approved items through the existing Node scripts.

**Architecture:** Two Claude Code scheduled sessions. A *draft run* reads `content/coverage.json`, WebSearches fixtures, drafts copy + sources images, writes `pending` items to `content/queue.json`, and sends Telegram drafts. A *check-and-post run* polls Telegram, and on approval posts via the existing scripts. Pure logic is extracted into `scripts/lib/*` modules so it is unit-testable; I/O stays in the CLI scripts.

**Tech Stack:** Node.js >= 20 (verified v24), zero runtime dependencies (native `fetch`), `node --test` for tests, Telegram Bot API, X API v2 (OAuth1), Claude Code skills + subagents + scheduled routines.

---

## File Structure

**New pure-logic modules (unit-tested):**
- `scripts/config.js` — secrets/config loader (X creds + Telegram)
- `scripts/lib/queue-item.js` — `getItemId`, `validateItem`
- `scripts/lib/state.js` — `loadState`, `saveState`, `itemAlreadyPosted`
- `scripts/lib/dates.js` — `currentDateInZone`
- `scripts/lib/telegram-parse.js` — `parseApproval`

**New I/O script:**
- `scripts/telegram.js` — CLI: `send`, `poll`, `message`, `selftest`

**Modified:**
- `scripts/x-post.js` — use `config.js`; de-OpenClaw strings
- `scripts/post-queue.js` — use `lib/*`; remove placeholder blocklist; de-OpenClaw UA

**New content/config:**
- `content/coverage.json` — series watchlist
- `content/queue.json` — draft buffer with `status`

**New Claude-native:**
- `.claude/skills/cricdotcric-post/SKILL.md`
- `.claude/agents/cricdotcric.md`

**Tests:** `test/*.test.js`

**Archived (moved, not deleted):** `archive/` ← IPL generator, IPL wrapper, stale queues, `ipl-2026-schedule.md`, `cto-review-guide.md`, `interview-qa.md`

---

## Task 1: Housekeeping — archive stale files, wire test runner

**Files:**
- Create: `archive/` (via git mv)
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: Move retired files into `archive/` preserving names**

```bash
mkdir -p archive
git mv scripts/build-ipl-daily-queue.js archive/build-ipl-daily-queue.js
git mv scripts/post-ipl-queue.js archive/post-ipl-queue.js
git mv content/ipl-daily-queue.json archive/ipl-daily-queue.json
git mv content/ipl-hype-queue.json archive/ipl-hype-queue.json
git mv docs/ipl-2026-schedule.md archive/ipl-2026-schedule.md
git mv docs/cto-review-guide.md archive/cto-review-guide.md
git mv docs/interview-qa.md archive/interview-qa.md
```

- [ ] **Step 2: Add an archive README explaining why these are frozen**

Create `archive/README.md`:

```markdown
# Archive

Retired artifacts from the OpenClaw / IPL-2026-specific version of this project,
kept for reference. Nothing here is executed by the live agent.

- `build-ipl-daily-queue.js` / `post-ipl-queue.js` — IPL-schedule-specific queue
  generator and wrapper. Superseded by the Claude draft run + `content/coverage.json`.
- `ipl-daily-queue.json` / `ipl-hype-queue.json` — stale IPL 2026 content.
- `ipl-2026-schedule.md` — IPL fallback schedule.
- `cto-review-guide.md` / `interview-qa.md` — portfolio framing docs, not runtime.
```

- [ ] **Step 3: Update `package.json` scripts + add test runner**

Replace the `scripts` block in `package.json` with:

```json
  "scripts": {
    "verify": "node scripts/x-post.js --account cricdotcric --verify",
    "post:due:dry": "node scripts/post-queue.js queue.json --dry-run",
    "post:due": "node scripts/post-queue.js queue.json",
    "tg:selftest": "node scripts/telegram.js selftest",
    "test": "node --test"
  },
```

- [ ] **Step 4: Update `.gitignore` for new state files**

Ensure the `state/` block covers all runtime JSON (it already does via `state/*.json`). Add scratch dir used by the draft run. Append:

```gitignore

# Agent runtime scratch
tmp/
```

(If `tmp/` already present, skip.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: archive IPL-specific artifacts, wire node --test runner"
```

---

## Task 2: `scripts/config.js` — secrets/config loader

**Files:**
- Create: `scripts/config.js`
- Test: `test/config.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/config.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { getTwitterCreds, getTelegramConfig } = require('../scripts/config');

const secrets = {
  twitterAccounts: { cricdotcric: { apiKey: 'k', apiSecret: 's', accessToken: 't', accessTokenSecret: 'ts' } },
  telegram: { botToken: 'bot', chatId: '123' },
};

test('getTwitterCreds returns creds for a known account', () => {
  assert.deepStrictEqual(getTwitterCreds(secrets, 'cricdotcric'), secrets.twitterAccounts.cricdotcric);
});

test('getTwitterCreds returns null for unknown account', () => {
  assert.strictEqual(getTwitterCreds(secrets, 'nope'), null);
});

test('getTelegramConfig returns telegram block', () => {
  assert.deepStrictEqual(getTelegramConfig(secrets), secrets.telegram);
});

test('getTelegramConfig throws when incomplete', () => {
  assert.throws(() => getTelegramConfig({ telegram: { botToken: 'x' } }), /chatId/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.js`
Expected: FAIL — `Cannot find module '../scripts/config'`

- [ ] **Step 3: Write the implementation**

Create `scripts/config.js`:

```js
const fs = require('fs');
const path = require('path');

function secretsPath() {
  return process.env.CRICDOTCRIC_SECRETS_FILE
    || path.join(process.env.HOME, '.cricdotcric', 'secrets.json');
}

function loadSecrets() {
  const p = secretsPath();
  if (!fs.existsSync(p)) throw new Error(`Secrets file not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function getTwitterCreds(secrets, account) {
  return secrets.twitterAccounts?.[account]
    || (secrets.twitter?.handle === account ? secrets.twitter : null);
}

function getTelegramConfig(secrets) {
  const tg = secrets.telegram;
  if (!tg || !tg.botToken || !tg.chatId) {
    throw new Error('Telegram config missing botToken or chatId');
  }
  return tg;
}

module.exports = { secretsPath, loadSecrets, getTwitterCreds, getTelegramConfig };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/config.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/config.js test/config.test.js
git commit -m "feat: add config.js secrets loader (cricdotcric secrets path)"
```

---

## Task 3: `scripts/lib/queue-item.js` — validation (blocklist removed)

**Files:**
- Create: `scripts/lib/queue-item.js`
- Test: `test/queue-item.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/queue-item.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { getItemId, validateItem } = require('../scripts/lib/queue-item');

const valid = {
  id: 'x1', account: 'cricdotcric', tweet: 'A real tweet',
  date: '2026-07-20', imageUrl: 'https://example.com/a.jpg',
};

test('getItemId prefers id, falls back to date', () => {
  assert.strictEqual(getItemId({ id: 'a', date: '2026-01-01' }), 'a');
  assert.strictEqual(getItemId({ date: '2026-01-01' }), '2026-01-01');
});

test('validateItem accepts a well-formed item', () => {
  assert.doesNotThrow(() => validateItem(valid, 'queue'));
});

test('validateItem rejects tweet over 280 chars', () => {
  assert.throws(() => validateItem({ ...valid, tweet: 'x'.repeat(281) }, 'queue'), /280/);
});

test('validateItem rejects missing image url', () => {
  assert.throws(() => validateItem({ ...valid, imageUrl: undefined }, 'queue'), /imageUrl/);
});

test('validateItem rejects bad date', () => {
  assert.throws(() => validateItem({ ...valid, date: '20-07-2026' }, 'queue'), /invalid date/);
});

test('validateItem no longer blocks old placeholder copy', () => {
  assert.doesNotThrow(() => validateItem({ ...valid, tweet: 'IPL today: RCB vs SRH.' }, 'queue'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/queue-item.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/queue-item.js`:

```js
function getItemId(item) {
  return item.id || item.date;
}

function validateItem(item, queueBaseName) {
  if (!item || typeof item !== 'object') {
    throw new Error(`Invalid queue item in ${queueBaseName}: expected object`);
  }
  if (!item.account) {
    throw new Error(`Invalid queue item ${getItemId(item)} in ${queueBaseName}: missing account`);
  }
  if (!item.tweet || typeof item.tweet !== 'string' || !item.tweet.trim()) {
    throw new Error(`Invalid queue item ${getItemId(item)} in ${queueBaseName}: missing tweet text`);
  }
  if (item.tweet.length > 280) {
    throw new Error(`Invalid queue item ${getItemId(item)} in ${queueBaseName}: tweet exceeds 280 chars`);
  }
  if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    throw new Error(`Invalid queue item ${getItemId(item)} in ${queueBaseName}: invalid date`);
  }
  if (item.scheduledFor && Number.isNaN(new Date(item.scheduledFor).getTime())) {
    throw new Error(`Invalid queue item ${getItemId(item)} in ${queueBaseName}: invalid scheduledFor`);
  }
  if (!item.imageUrl || typeof item.imageUrl !== 'string' || !item.imageUrl.startsWith('http')) {
    throw new Error(`Invalid queue item ${getItemId(item)} in ${queueBaseName}: missing production imageUrl`);
  }
}

module.exports = { getItemId, validateItem };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/queue-item.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/queue-item.js test/queue-item.test.js
git commit -m "feat: extract queue-item validation, drop placeholder blocklist"
```

---

## Task 4: `scripts/lib/state.js` — state + dedupe

**Files:**
- Create: `scripts/lib/state.js`
- Test: `test/state.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/state.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadState, saveState, itemAlreadyPosted } = require('../scripts/lib/state');

test('loadState returns empty shape when file missing', () => {
  const p = path.join(os.tmpdir(), `nope-${Date.now()}.json`);
  assert.deepStrictEqual(loadState(p), { posted: {}, postedById: {} });
});

test('saveState then loadState round-trips', () => {
  const p = path.join(os.tmpdir(), `state-${Date.now()}.json`);
  const s = { posted: { '2026-07-20': { id: 'a' } }, postedById: { a: { id: 'a' } } };
  saveState(p, s);
  assert.deepStrictEqual(loadState(p), s);
  fs.unlinkSync(p);
});

test('itemAlreadyPosted true when id recorded', () => {
  const state = { posted: {}, postedById: { x1: {} } };
  assert.strictEqual(itemAlreadyPosted({ id: 'x1', date: '2026-07-20' }, state), true);
});

test('itemAlreadyPosted true when date recorded (no id)', () => {
  const state = { posted: { '2026-07-20': {} }, postedById: {} };
  assert.strictEqual(itemAlreadyPosted({ date: '2026-07-20' }, state), true);
});

test('itemAlreadyPosted false when unseen', () => {
  assert.strictEqual(itemAlreadyPosted({ id: 'new', date: '2026-07-20' }, { posted: {}, postedById: {} }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/state.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/state.js`:

```js
const fs = require('fs');
const { getItemId } = require('./queue-item');

function loadState(filePath) {
  if (!fs.existsSync(filePath)) return { posted: {}, postedById: {} };
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { posted: parsed.posted || {}, postedById: parsed.postedById || {} };
}

function saveState(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
}

function itemAlreadyPosted(item, state) {
  const id = getItemId(item);
  return Boolean(state.postedById[id] || state.posted[item.date]);
}

module.exports = { loadState, saveState, itemAlreadyPosted };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/state.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/state.js test/state.test.js
git commit -m "feat: extract posting state + dedupe helpers"
```

---

## Task 5: `scripts/lib/dates.js` — timezone date helper

**Files:**
- Create: `scripts/lib/dates.js`
- Test: `test/dates.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/dates.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { currentDateInZone } = require('../scripts/lib/dates');

test('currentDateInZone formats YYYY-MM-DD in the given zone', () => {
  // 2026-07-20T20:00Z is 2026-07-21 in Asia/Singapore (+08)
  const now = new Date('2026-07-20T20:00:00Z');
  assert.strictEqual(currentDateInZone(now, 'Asia/Singapore'), '2026-07-21');
  assert.strictEqual(currentDateInZone(now, 'UTC'), '2026-07-20');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dates.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/dates.js`:

```js
function currentDateInZone(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

module.exports = { currentDateInZone };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dates.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/dates.js test/dates.test.js
git commit -m "feat: extract timezone date helper"
```

---

## Task 6: `scripts/lib/telegram-parse.js` — approval reply parser

**Files:**
- Create: `scripts/lib/telegram-parse.js`
- Test: `test/telegram-parse.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/telegram-parse.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseApproval } = require('../scripts/lib/telegram-parse');

test('plain approval', () => {
  assert.strictEqual(parseApproval('✅ Approved — post as is').decision, 'approved');
  assert.strictEqual(parseApproval('approve').decision, 'approved');
});

test('corrections captures notes and beats plain approve', () => {
  const r = parseApproval('✏️ Approved with corrections: tighten the closer');
  assert.strictEqual(r.decision, 'corrections');
  assert.strictEqual(r.notes, 'tighten the closer');
});

test('rejection captures reason', () => {
  const r = parseApproval('❌ Rejected: wrong photo');
  assert.strictEqual(r.decision, 'rejected');
  assert.strictEqual(r.reason, 'wrong photo');
});

test('rejection without reason', () => {
  assert.strictEqual(parseApproval('Rejected').decision, 'rejected');
});

test('unrelated text is unknown', () => {
  assert.strictEqual(parseApproval('what time is the match').decision, 'unknown');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/telegram-parse.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/telegram-parse.js`:

```js
function afterColon(raw) {
  const i = raw.indexOf(':');
  return i >= 0 ? raw.slice(i + 1).trim() : '';
}

function parseApproval(text) {
  const raw = (text || '').trim();
  if (/approved\s+with\s+corrections|^corrections\b/i.test(raw)) {
    return { decision: 'corrections', notes: afterColon(raw) };
  }
  if (/^(❌|x)?\s*reject/i.test(raw)) {
    return { decision: 'rejected', reason: afterColon(raw) };
  }
  if (/^(✅|✔)?\s*approv/i.test(raw) || raw === '✅' || /^ok$/i.test(raw)) {
    return { decision: 'approved' };
  }
  return { decision: 'unknown' };
}

module.exports = { parseApproval };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/telegram-parse.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/telegram-parse.js test/telegram-parse.test.js
git commit -m "feat: add Telegram approval reply parser"
```

---

## Task 7: Refactor `scripts/x-post.js` onto `config.js`

**Files:**
- Modify: `scripts/x-post.js:24-34` (secrets loading), `scripts/x-post.js:87` (boundary string)

- [ ] **Step 1: Replace the secrets-loading block**

Replace lines 24–34 (from `const secretsPath = ...` through the `if (!creds) { ... }` block) with:

```js
const { loadSecrets, getTwitterCreds } = require('./config');

let secrets;
try {
  secrets = loadSecrets();
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
const creds = getTwitterCreds(secrets, account);
if (!creds) {
  console.error(`No credentials found for account: ${account}`);
  process.exit(2);
}
```

Note: the existing `const apiKey = creds.apiKey;` … lines below stay unchanged.

- [ ] **Step 2: De-OpenClaw the multipart boundary (line 87)**

Change:

```js
  const boundary = '----openclaw' + crypto.randomBytes(8).toString('hex');
```
to:
```js
  const boundary = '----cricdotcric' + crypto.randomBytes(8).toString('hex');
```

- [ ] **Step 3: Verify it still parses and shows usage**

Run: `node scripts/x-post.js`
Expected: prints the `Usage:` line and exits non-zero (no secrets access on the usage path).

- [ ] **Step 4: Commit**

```bash
git add scripts/x-post.js
git commit -m "refactor: x-post.js uses config.js; drop openclaw strings"
```

---

## Task 8: Refactor `scripts/post-queue.js` onto `lib/*`, remove blocklist

**Files:**
- Modify: `scripts/post-queue.js` (imports, remove inlined helpers + placeholder block, UA string)

- [ ] **Step 1: Add lib imports at the top**

After the existing `const os = require('os');` line, add:

```js
const { getItemId, validateItem } = require('./lib/queue-item');
const { loadState, saveState, itemAlreadyPosted } = require('./lib/state');
const { currentDateInZone } = require('./lib/dates');
```

- [ ] **Step 2: Delete the now-duplicated inline helpers**

Remove these function definitions from `post-queue.js` (they now live in `lib/`):
- `loadState(...)`
- `saveState(...)`
- `getItemId(...)`
- `itemAlreadyPosted(...)`
- the entire `validateItem(...)` function **including** the `placeholderPatterns` array and its `.some(...)` throw.

- [ ] **Step 3: Replace the inline SGT date formatter**

Change the block:

```js
  const currentDateSGT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
```
to:
```js
  const currentDateSGT = currentDateInZone(now, 'Asia/Singapore');
```

- [ ] **Step 4: De-OpenClaw the image download UA**

Change the `maybeDownloadImage` fetch header:
```js
  const r = await fetch(item.imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 OpenClaw' } });
```
to:
```js
  const r = await fetch(item.imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 cricdotcric-agent' } });
```

- [ ] **Step 5: Verify the full test suite still passes and script loads**

Run: `node --test`
Expected: PASS (all suites from Tasks 2–6).

Run: `node scripts/post-queue.js`
Expected: prints `Usage: node scripts/post-queue.js ...` and exits non-zero.

- [ ] **Step 6: Commit**

```bash
git add scripts/post-queue.js
git commit -m "refactor: post-queue.js uses lib/*, removes placeholder blocklist"
```

---

## Task 9: `scripts/telegram.js` — Telegram CLI

**Files:**
- Create: `scripts/telegram.js`

- [ ] **Step 1: Write the implementation**

Create `scripts/telegram.js`:

```js
#!/usr/bin/env node
const fs = require('fs');
const { loadSecrets, getTelegramConfig } = require('./config');
const { parseApproval } = require('./lib/telegram-parse');

const API = 'https://api.telegram.org';
const args = process.argv.slice(2);
const cmd = args[0];

function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function tg(cfg, method, body) {
  const res = await fetch(`${API}/bot${cfg.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(json)}`);
  return json.result;
}

async function main() {
  const cfg = getTelegramConfig(loadSecrets());

  if (cmd === 'selftest') {
    const r = await tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text: '✅ cricdotcric agent connected.' });
    console.log(JSON.stringify({ ok: true, messageId: r.message_id }, null, 2));
    return;
  }

  if (cmd === 'message') {
    const text = getArg('--text');
    if (!text) throw new Error('message requires --text');
    const r = await tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text });
    console.log(JSON.stringify({ ok: true, messageId: r.message_id }, null, 2));
    return;
  }

  if (cmd === 'send') {
    const textFile = getArg('--text-file');
    const image = getArg('--image');
    if (!textFile) throw new Error('send requires --text-file');
    const caption = fs.readFileSync(textFile, 'utf8');
    let r;
    if (image) {
      r = await tg(cfg, 'sendPhoto', { chat_id: cfg.chatId, photo: image, caption });
    } else {
      r = await tg(cfg, 'sendMessage', { chat_id: cfg.chatId, text: caption });
    }
    console.log(JSON.stringify({ ok: true, messageId: r.message_id }, null, 2));
    return;
  }

  if (cmd === 'poll') {
    const offset = getArg('--offset');
    const body = { timeout: 0, allowed_updates: ['message'] };
    if (offset) body.offset = Number(offset);
    const updates = await tg(cfg, 'getUpdates', body);
    let newOffset = offset ? Number(offset) : 0;
    const replies = [];
    for (const u of updates) {
      newOffset = u.update_id + 1;
      const msg = u.message;
      if (!msg || !msg.text) continue;
      const parsed = parseApproval(msg.text);
      replies.push({
        messageId: msg.message_id,
        replyToMessageId: msg.reply_to_message ? msg.reply_to_message.message_id : null,
        text: msg.text,
        ...parsed,
      });
    }
    console.log(JSON.stringify({ ok: true, newOffset, replies }, null, 2));
    return;
  }

  console.error('Usage: node scripts/telegram.js <selftest|message --text <t>|send --text-file <path> [--image <url>]|poll [--offset <n>]>');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
```

- [ ] **Step 2: Verify usage path works without credentials**

Run: `node scripts/telegram.js`
Expected: prints the `Usage:` line and exits non-zero (usage branch runs before any network call; note it still calls `loadSecrets()` first, so if no secrets file exists it will instead print `Secrets file not found:` — either is acceptable at this stage).

- [ ] **Step 3: Commit**

```bash
git add scripts/telegram.js
git commit -m "feat: add telegram.js CLI (send/poll/message/selftest)"
```

---

## Task 10: Seed `content/coverage.json` and `content/queue.json`

**Files:**
- Create: `content/coverage.json`, `content/queue.json`
- Modify: `content/README.md`

- [ ] **Step 1: Create `content/coverage.json` (empty watchlist)**

```json
{
  "series": []
}
```

(The operator's series list is added later — see Relaunch checklist. One example item, commented in the README below, documents the shape.)

- [ ] **Step 2: Create `content/queue.json` (empty draft buffer)**

```json
[]
```

- [ ] **Step 3: Rewrite `content/README.md`**

```markdown
# Content

Runtime inputs for the Claude posting agent.

## Files

- `coverage.json` — the **series watchlist** (source of truth). The agent only
  drafts fixtures belonging to a listed, `active: true` series. Managed by the
  operator (given as text; the assistant writes it here).
- `queue.json` — the **draft buffer**. The draft run appends items here with
  `status: "pending"`; the check-and-post run moves them to `posted` / `rejected`.
- `t20wc2026-thread.md` — long-form editorial reference artifact.

## coverage.json item shape

```json
{
  "series": [
    {
      "id": "ind-aus-t20i-2026",
      "name": "India vs Australia T20I Series 2026",
      "teams": ["IND", "AUS"],
      "format": "T20I",
      "active": true,
      "startDate": "2026-07-20",
      "endDate": "2026-08-05"
    }
  ]
}
```

## queue.json item shape

```json
{
  "id": "ind-aus-t20i-2026-m1-preview",
  "type": "preview",
  "date": "2026-07-20",
  "scheduledFor": "2026-07-20T12:15:00+08:00",
  "account": "cricdotcric",
  "tweet": "…",
  "imageUrl": "https://…",
  "imageSource": "…",
  "status": "pending",
  "telegramMessageId": 123
}
```
```

- [ ] **Step 4: Commit**

```bash
git add content/coverage.json content/queue.json content/README.md
git commit -m "feat: seed coverage watchlist + generalized queue buffer"
```

---

## Task 11: Skill — `.claude/skills/cricdotcric-post/SKILL.md`

**Files:**
- Create: `.claude/skills/cricdotcric-post/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `.claude/skills/cricdotcric-post/SKILL.md`:

```markdown
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
2. Poll: `node scripts/telegram.js poll --offset <offset>`. Save `newOffset` back.
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
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/cricdotcric-post/SKILL.md
git commit -m "feat: add cricdotcric-post skill (editorial brain)"
```

---

## Task 12: Subagent — `.claude/agents/cricdotcric.md`

**Files:**
- Create: `.claude/agents/cricdotcric.md`

- [ ] **Step 1: Write the subagent definition**

Create `.claude/agents/cricdotcric.md`:

```markdown
---
name: cricdotcric
description: Runs a @cricdotcric drafting or check-and-post cycle end to end. Invoke with a prompt stating the mode (draft or check-and-post).
tools: Bash, Read, Write, WebSearch, WebFetch, Skill
---

You are the @cricdotcric cricket social posting agent.

On invocation:
1. Invoke the `cricdotcric-post` skill.
2. Determine the mode from your prompt: **draft** or **check-and-post**.
3. Execute that mode's steps from the skill exactly.
4. Return a concise summary: what you drafted/sent, what you posted (with links),
   and anything flagged for the operator (e.g. fixtures missing an image).

Work only on series marked `active` in `content/coverage.json`. Never post
without an approval reply. Never double-post.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/cricdotcric.md
git commit -m "feat: add cricdotcric subagent"
```

---

## Task 13: Update project docs

**Files:**
- Modify: `README.md`, `docs/architecture.md`, `docs/scheduler.md`

- [ ] **Step 1: Update `README.md`**

Replace the "Secrets", "Usage", and "Scheduler Model" sections so they describe:
- secrets at `~/.cricdotcric/secrets.json` (X creds + `telegram` block), override via `CRICDOTCRIC_SECRETS_FILE`;
- the agent runs as two Claude Code scheduled routines (draft + check-and-post) driven by `.claude/agents/cricdotcric.md` and the `cricdotcric-post` skill;
- coverage is controlled by `content/coverage.json`;
- manual commands: `npm run verify`, `npm run tg:selftest`, `npm run post:due:dry`, `npm test`.

Remove references to `build-ipl-daily-queue.js` / `post-ipl-queue.js` (now archived).

- [ ] **Step 2: Update `docs/architecture.md`**

Replace the "Posting Automation" and "Content" component sections to reflect:
`config.js` + `lib/*` modules, `telegram.js`, `coverage.json` → `queue.json` draft buffer, and the two-phase Claude scheduled runtime. Point runtime state at `state/queue-state.json` and `state/telegram-offset.json`.

- [ ] **Step 3: Update `docs/scheduler.md`**

Replace the "Original Deployment (OpenClaw)" framing with the Claude Code scheduled-routines model: a daily **draft** routine and an every-~15-min **check-and-post** routine, both invoking the `cricdotcric` subagent. Note the poll-based approval loop needs no hosted webhook.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/architecture.md docs/scheduler.md
git commit -m "docs: describe Claude-native agent, secrets, and scheduling"
```

---

## Task 14: Configure the two scheduled routines

> Runtime setup, not code. Requires credentials in place (see Relaunch checklist). Uses the `schedule` skill / scheduled routines.

- [ ] **Step 1: Create the draft routine**

Create a scheduled Claude Code routine:
- Cadence: daily at the desired local drafting time (editorial default was 12:15 SGT — confirm with operator).
- Prompt: `Use the cricdotcric subagent in DRAFT mode. Draft previews/reviews for active series in content/coverage.json and send them to Telegram for approval.`

- [ ] **Step 2: Create the check-and-post routine**

- Cadence: every 15 minutes.
- Prompt: `Use the cricdotcric subagent in CHECK-AND-POST mode. Poll Telegram for approval replies and post approved drafts.`

- [ ] **Step 3: Record the routine IDs/names in `docs/scheduler.md`** so they can be paused/edited later. Commit that doc change.

---

## Task 15: Full-stack verification (relaunch)

> Requires real credentials and at least one `active` series in `content/coverage.json`.

- [ ] **Step 1: Confirm the whole test suite is green**

Run: `node --test`
Expected: PASS across `test/*.test.js`.

- [ ] **Step 2: Verify credentials**

Run: `npm run verify` → expect X `users/me` JSON with `ok: true`.
Run: `npm run tg:selftest` → expect a message in your Telegram chat.

- [ ] **Step 3: Dry-run the poster**

Run: `npm run post:due:dry` → expect a clean `no-due-items` or a dry-run listing (no posting).

- [ ] **Step 4: One supervised live cycle**

Manually invoke the `cricdotcric` subagent in DRAFT mode, approve one draft in Telegram, then invoke CHECK-AND-POST mode. Confirm the tweet is live and `state/queue-state.json` recorded it. Fix any errors that surface (per operator: fixes happen when errors come up).

- [ ] **Step 5: Enable the scheduled routines** once one supervised cycle succeeds.

---

## Relaunch checklist (operator inputs, gathered at the end)

1. **Series list** → written into `content/coverage.json`.
2. **Credentials** → `~/.cricdotcric/secrets.json` with `twitterAccounts.cricdotcric` (apiKey/apiSecret/accessToken/accessTokenSecret) and `telegram` (botToken, chatId).
3. **Drafting time / cadence** confirmation for the scheduled routines.
