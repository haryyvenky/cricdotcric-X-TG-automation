#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const { getItemId, validateItem } = require('./lib/queue-item');
const { loadState, saveState, itemAlreadyPosted } = require('./lib/state');
const { currentDateInZone } = require('./lib/dates');
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
  const r = await fetch(item.imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 cricdotcric-agent' } });
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

  const currentDateSGT = currentDateInZone(now, 'Asia/Singapore');

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

    const output = execFileSync(process.execPath, postArgs, { encoding: 'utf8' });
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
