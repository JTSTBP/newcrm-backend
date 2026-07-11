const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}[character]));

const normalizeBulletMarkers = (value) => String(value ?? '')
  .replace(/(^|\n)\s*\?\s+/g, '$1- ')
  .replace(/(^|\n)\s*�\s+/g, '$1- ')
  .replace(/(^|\n)\s*•\s+/g, '$1- ');

const withLineBreaks = (value) => escapeHtml(normalizeBulletMarkers(value)).replace(/\r?\n/g, '<br/>');

module.exports = { escapeHtml, withLineBreaks, normalizeBulletMarkers };
