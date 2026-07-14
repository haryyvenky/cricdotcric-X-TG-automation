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
