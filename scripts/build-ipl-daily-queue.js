#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const schedulePath = path.join(repoRoot, 'docs', 'ipl-2026-schedule.md');
const outputPath = path.join(repoRoot, 'content', 'ipl-daily-queue.json');
const officialFeedUrl = 'https://ipl-stats-sports-mechanic.s3.ap-south-1.amazonaws.com/ipl/feeds/284-matchschedule.js';

const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

const TEAM_SHORT = {
  'Chennai Super Kings': 'CSK',
  'Delhi Capitals': 'DC',
  'Gujarat Titans': 'GT',
  'Kolkata Knight Riders': 'KKR',
  'Lucknow Super Giants': 'LSG',
  'Mumbai Indians': 'MI',
  'Punjab Kings': 'PBKS',
  'Rajasthan Royals': 'RR',
  'Royal Challengers Bengaluru': 'RCB',
  'Sunrisers Hyderabad': 'SRH',
};

function isoDateFromSchedule(label) {
  const match = label.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) ([A-Z][a-z]{2})/);
  if (!match) return null;
  const [, day, month] = match;
  return `2026-${MONTHS[month]}-${String(day).padStart(2, '0')}`;
}

function nextDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00+08:00`);
  date.setDate(date.getDate() + 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fixtureLabel(match) {
  return `${match.teams} at ${match.venue}`;
}

function previewTweet(matches) {
  if (matches.length === 1) {
    const match = matches[0];
    return `IPL today: ${match.teams}.\n\nVenue: ${match.venue}. Start: ${match.timeIST} IST.\n\nNew day, new noise, fresh overreactions. Exactly how this league should operate. 🔥`;
  }

  const fixtures = matches.map((match) => `• ${match.teams} — ${match.timeIST} IST`).join('\n');
  return `Double-header day in the IPL.\n\n${fixtures}\n\nTwo games, one calendar date, absolutely no reason to expect calm. We will take the chaos as scheduled. ⚡`;
}

function reviewTweet(matches) {
  if (matches.length === 1) {
    const match = matches[0];
    return `Last night gave us ${match.teams} at ${match.venue}.\n\nEarly-season tables are temporary. The noise, the swings and the instant agenda-setting are the real constants. IPL business as usual. 🎬`;
  }

  const fixtures = matches.map((match) => `• ${fixtureLabel(match)}`).join('\n');
  return `Yesterday delivered a full IPL double-header.\n\n${fixtures}\n\nOne afternoon game, one night game, and enough plotlines to keep the league machine properly overheated. 💥`;
}

function parseMarkdownSchedule() {
  const text = fs.readFileSync(schedulePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const matches = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[-\s|]+\|$/.test(trimmed)) continue;
    const cols = trimmed.split('|').map((part) => part.trim()).filter(Boolean);
    if (cols.length !== 5) continue;
    if (cols[0] === '#') continue;
    const [num, dateLabel, teams, venue, timeIST] = cols;
    if (!/^\d+$/.test(num)) continue;
    const date = isoDateFromSchedule(dateLabel);
    if (!date) continue;
    matches.push({ num: Number(num), date, dateLabel, teams, venue, timeIST });
  }

  return matches;
}

function cleanVenue(groundName, city) {
  if (!groundName) return city || '';
  if (city && !groundName.toLowerCase().includes(city.toLowerCase())) {
    return `${groundName}, ${city}`;
  }
  return groundName;
}

function timeToIST(matchTime) {
  if (!matchTime) return '7:30 PM';
  const [hRaw, mRaw] = String(matchTime).split(':');
  const h = Number(hRaw);
  const m = Number(mRaw || '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

async function parseOfficialFeed() {
  const r = await fetch(officialFeedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 OpenClaw' },
  });
  if (!r.ok) throw new Error(`Official feed fetch failed: ${r.status}`);
  const text = await r.text();
  const start = text.indexOf('(');
  const end = text.lastIndexOf(');');
  if (start < 0 || end < 0) throw new Error('Official feed format not recognized');
  const parsed = JSON.parse(text.slice(start + 1, end));
  const rows = parsed.Matchsummary || [];

  const dedup = new Map();
  for (const row of rows) {
    const date = row.MatchDate;
    const num = Number(row.RowNo || row.MatchRow || row.MatchOrder?.replace(/\D/g, '') || 0);
    if (!date || !num) continue;

    const home = row.HomeTeamName || row.FirstBattingTeamName;
    const away = row.AwayTeamName || row.SecondBattingTeamName;
    const homeCode = TEAM_SHORT[home] || row.HomeTeamCode || row.FirstBattingTeamCode;
    const awayCode = TEAM_SHORT[away] || row.AwayTeamCode || row.SecondBattingTeamCode;
    if (!homeCode || !awayCode) continue;

    dedup.set(`${date}-${num}`, {
      num,
      date,
      dateLabel: row.MatchDateNew,
      teams: `${homeCode} vs ${awayCode}`,
      venue: cleanVenue(row.GroundName, row.city),
      timeIST: timeToIST(row.MatchTime),
    });
  }

  return [...dedup.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.num - b.num;
  });
}

async function loadMatches() {
  try {
    const official = await parseOfficialFeed();
    if (official.length > 0) return { source: 'official-feed', matches: official };
    throw new Error('Official feed returned 0 matches');
  } catch (err) {
    const fallback = parseMarkdownSchedule();
    return { source: `markdown-fallback (${err.message})`, matches: fallback };
  }
}

(async () => {
  const { source, matches } = await loadMatches();
  if (!matches.length) throw new Error('No IPL matches found from official feed or fallback markdown');

  const byDate = new Map();
  for (const match of matches) {
    if (!byDate.has(match.date)) byDate.set(match.date, []);
    byDate.get(match.date).push(match);
  }

  const queue = [];
  for (const [date, dayMatches] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sortedMatches = [...dayMatches].sort((a, b) => a.num - b.num);

    queue.push({
      id: `${date}-preview`,
      type: 'preview',
      date,
      scheduledFor: `${date}T12:15:00+08:00`,
      account: 'cricdotcric',
      tweet: previewTweet(sortedMatches),
      metadata: {
        matchDate: date,
        fixtures: sortedMatches.map(fixtureLabel),
        matchNumbers: sortedMatches.map((match) => match.num),
      },
    });

    const reviewDate = nextDate(date);
    queue.push({
      id: `${reviewDate}-review-${date}`,
      type: 'review',
      date: reviewDate,
      scheduledFor: `${reviewDate}T12:15:00+08:00`,
      account: 'cricdotcric',
      tweet: reviewTweet(sortedMatches),
      metadata: {
        sourceMatchDate: date,
        fixtures: sortedMatches.map(fixtureLabel),
        matchNumbers: sortedMatches.map((match) => match.num),
      },
    });
  }

  fs.writeFileSync(outputPath, JSON.stringify(queue, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, source, matches: matches.length, queueItems: queue.length, outputPath }, null, 2));
})().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
