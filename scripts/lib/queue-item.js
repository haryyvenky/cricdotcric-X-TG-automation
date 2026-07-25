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
  // @cricdotcric is X Premium (verified) — long posts allowed up to 25,000 chars.
  if (item.tweet.length > 25000) {
    throw new Error(`Invalid queue item ${getItemId(item)} in ${queueBaseName}: tweet exceeds 25000 chars`);
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

const TRIVIA_PREFIX = '🏏 Trivia of the Day';

// Trivia (evergreen) posts must open with a fixed "Trivia of the Day" line.
// The skill writes it into the copy; this is the deterministic backstop so a
// posted evergreen tweet always has it even if the AI omitted it. Returns the
// tweet unchanged for previews/reviews and for copy that already leads with the
// line (case-insensitive, so "🏏 Trivia of the Day" or "Trivia of the Day..."
// on the first line is not double-stamped).
function triviaPrefixed(item) {
  const tweet = (item && item.tweet) || '';
  if (!item || item.type !== 'evergreen') return tweet;
  const firstLine = tweet.split('\n', 1)[0];
  if (/trivia of the day/i.test(firstLine)) return tweet;
  return `${TRIVIA_PREFIX}\n\n${tweet}`;
}

module.exports = { getItemId, validateItem, triviaPrefixed, TRIVIA_PREFIX };
