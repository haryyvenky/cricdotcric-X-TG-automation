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

module.exports = { getItemId, validateItem };
