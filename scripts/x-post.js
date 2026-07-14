#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const repoRoot = path.resolve(__dirname, '..');

function usage() {
  console.error('Usage: node scripts/x-post.js --account <handle> [--verify | --delete <tweetId> | (--text <tweet text> | --text-file <path>) [--media-file <path>]]');
  process.exit(1);
}

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function hasArg(name) {
  return args.includes(name);
}

const account = getArg('--account');
if (!account) usage();

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

const apiKey = creds.apiKey;
const apiSecret = creds.apiSecret;
const accessToken = creds.accessToken;
const accessTokenSecret = creds.accessTokenSecret;

function oauthHeader(method, rawUrl, extraParams = {}) {
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const url = new URL(rawUrl);
  const queryParams = {};
  for (const [k, v] of url.searchParams.entries()) queryParams[k] = v;

  const sigParams = { ...oauthParams, ...queryParams, ...extraParams };
  const sorted = Object.keys(sigParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(sigParams[k])}`)
    .join('&');

  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
  const baseString = [method.toUpperCase(), encodeURIComponent(baseUrl), encodeURIComponent(sorted)].join('&');
  const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessTokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;
  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');
}

async function request(method, url, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : undefined;
  const headers = { Authorization: oauthHeader(method, url) };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

async function uploadMedia(filePath) {
  const data = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const boundary = '----cricdotcric' + crypto.randomBytes(8).toString('hex');
  const pre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([pre, data, post]);
  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: oauthHeader('POST', url),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) return { status: res.status, ok: false, json };
  return { status: res.status, ok: true, mediaId: json.media_id_string, json };
}

(async () => {
  if (hasArg('--verify')) {
    const res = await request('GET', 'https://api.twitter.com/2/users/me');
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 3);
  }

  const deleteId = getArg('--delete');
  if (deleteId) {
    const res = await request('DELETE', `https://api.twitter.com/2/tweets/${deleteId}`);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 5);
  }

  let text = getArg('--text');
  const textFile = getArg('--text-file');
  if (!text && textFile) text = fs.readFileSync(textFile, 'utf8');
  if (!text) usage();

  const mediaFile = getArg('--media-file');
  let mediaId;
  if (mediaFile) {
    const upload = await uploadMedia(mediaFile);
    if (!upload.ok) {
      console.log(JSON.stringify(upload, null, 2));
      process.exit(6);
    }
    mediaId = upload.mediaId;
  }

  const body = mediaId ? { text, media: { media_ids: [mediaId] } } : { text };
  const res = await request('POST', 'https://api.twitter.com/2/tweets', body);
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 4);
})().catch((err) => {
  console.error(err);
  process.exit(10);
});
