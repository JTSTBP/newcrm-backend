const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}[character]));

const withLineBreaks = (value) => escapeHtml(value).replace(/\r?\n/g, '<br/>');

module.exports = { escapeHtml, withLineBreaks };
