#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const repoRoot = path.resolve(__dirname, '..');
const contentDir = path.join(repoRoot, 'content');
const stateDir = path.join(repoRoot, 'state');

const args = process.argv.slice(2);
const queueName = args[0];

function usage() {
  console.error('Usage: node scripts/post-queue.js <queue-json-file> [YYYY-MM-DD] [--now <ISO>] [--dry-run]');
  process.exit(1);
}

if (!queueName) usage();

function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function hasArg(name) {
  return args.includes(name);
}

function parseDateArg(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : undefined;
}

function resolveQueuePath(name) {
  if (path.isAbsolute(name)) return name;
  return path.join(contentDir, name);
}

function loadState(filePath) {
  if (!fs.existsSync(filePath)) return { posted: {}, postedById: {} };
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    posted: parsed.posted || {},
    postedById: parsed.postedById || {},
  };
}

function saveState(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
}

function getItemId(item) {
  return item.id || item.date;
}

function itemAlreadyPosted(item, state) {
  const id = getItemId(item);
  return Boolean(state.postedById[id] || state.posted[item.date]);
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
  const placeholderPatterns = [
    /^IPL today:/,
    /^Last night gave us /,
    /^Yesterday delivered /,
    /New day, new noise/i,
    /IPL business as usual/i,
  ];
  if (placeholderPatterns.some((re) => re.test(item.tweet))) {
    throw new Error(`Invalid queue item ${getItemId(item)} in ${queueBaseName}: placeholder copy blocked`);
  }
}

function buildRecord(item, parsed, extra = {}) {
  const tweetId = parsed.json?.data?.id;
  const link = tweetId ? `https://x.com/${item.account}/status/${tweetId}` : undefined;
  return {
    id: getItemId(item),
    type: item.type,
    scheduledFor: item.scheduledFor,
    date: item.date,
    tweetId,
    link,
    postedAt: new Date().toISOString(),
    tweet: item.tweet,
    imageSource: item.imageSource,
    imageUrl: item.imageUrl,
    ...extra,
  };
}

async function maybeDownloadImage(item, tmpDir, queueBaseName) {
  if (!item.imageUrl) return undefined;
  const imagePath = path.join(tmpDir, `${queueBaseName}-${getItemId(item)}.jpg`);
  const r = await fetch(item.imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 OpenClaw' } });
  if (!r.ok) throw new Error(`Image download failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(imagePath, buf);
  return imagePath;
}

(async () => {
  const queuePath = resolveQueuePath(queueName);
  const queueBaseName = path.basename(queuePath, '.json');
  const statePath = path.join(stateDir, `${queueBaseName}-state.json`);
  const tmpDir = path.join(os.tmpdir(), 'cricdotcric-x-tg-automation');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const targetDate = parseDateArg(args[1]);
  const nowArg = getArg('--now');
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowArg}`);
  const dryRun = hasArg('--dry-run');

  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const state = loadState(statePath);

  const currentDateSGT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);

  let items;
  if (targetDate) {
    items = queue.filter((item) => item.date === targetDate && !itemAlreadyPosted(item, state));
  } else {
    items = queue
      .filter((item) => item.date === currentDateSGT)
      .filter((item) => !itemAlreadyPosted(item, state))
      .filter((item) => {
        if (!item.scheduledFor) return true;
        return new Date(item.scheduledFor).getTime() <= now.getTime();
      })
      .sort((a, b) => {
        const aTime = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0;
        const bTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0;
        return aTime - bTime;
      });
  }

  if (items.length === 0) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: targetDate ? 'no-unposted-items-for-date' : 'no-due-items',
      queue: path.basename(queuePath),
      date: targetDate,
      now: now.toISOString(),
    }, null, 2));
    process.exit(0);
  }

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      queue: path.basename(queuePath),
      now: now.toISOString(),
      items: items.map((item) => ({
        id: getItemId(item),
        type: item.type,
        date: item.date,
        scheduledFor: item.scheduledFor,
        tweet: item.tweet,
        hasImage: Boolean(item.imageUrl),
      })),
    }, null, 2));
    process.exit(0);
  }

  const results = [];
  for (const item of items) {
    validateItem(item, queueBaseName);
    const imagePath = await maybeDownloadImage(item, tmpDir, queueBaseName);
    const textPath = path.join(tmpDir, `${queueBaseName}-${getItemId(item)}.txt`);
    fs.writeFileSync(textPath, item.tweet + '\n');

    const postArgs = [
      path.join(repoRoot, 'scripts', 'x-post.js'),
      '--account', item.account,
      '--text-file', textPath,
    ];
    if (imagePath) postArgs.push('--media-file', imagePath);

    const output = execFileSync('node', postArgs, { encoding: 'utf8' });
    const parsed = JSON.parse(output);
    if (!parsed.ok) throw new Error(`Tweet post failed: ${output}`);

    const record = buildRecord(item, parsed);
    state.postedById[record.id] = record;
    if (!item.id) state.posted[item.date] = record;
    saveState(statePath, state);

    results.push({
      id: record.id,
      type: item.type,
      date: item.date,
      scheduledFor: item.scheduledFor,
      tweetId: record.tweetId,
      link: record.link,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    queue: path.basename(queuePath),
    now: now.toISOString(),
    posted: results,
  }, null, 2));
})().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
