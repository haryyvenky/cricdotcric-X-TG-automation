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
