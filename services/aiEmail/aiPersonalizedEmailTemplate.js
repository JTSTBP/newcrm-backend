const { buildEmailFooter } = require('./emailFooterBuilder');
const { escapeHtml, withLineBreaks, normalizeBulletMarkers } = require('./emailHtmlTemplateHelpers');

const text = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const displayName = value => String(value || '').trim().replace(/\b([a-z])/g, char => char.toUpperCase());
const normalizeGreetingName = (greeting, pointOfContact) => {
  const name = displayName(pointOfContact?.name);
  if (!name) return greeting;
  return String(greeting || '').replace(/^(\s*(?:hi|hello|dear)\s+)([^,\n\r]+)([,\n\r].*)?$/i, (_match, prefix, _oldName, suffix = ',') =>
    `${prefix}${name}${suffix || ','}`
  );
};
const normalizeEmailContent = (content) => {
  if (!content || typeof content !== 'object' || !Array.isArray(content.bullets)) {
    throw Object.assign(new Error('Valid dynamic email content is required.'), { code: 'INVALID_EMAIL_CONTENT' });
  }
  const normalized = {
    greeting: text(content.greeting, 200),
    openingLine: text(content.openingLine, 1200),
    contextLine: text(content.contextLine, 1200),
    companyBlurb: text(content.companyBlurb, 1200),
    pitchLine: text(content.pitchLine, 1600),
    bullets: content.bullets.map(value => text(value, 300)).filter(Boolean).slice(0, 8),
    closingLine: text(content.closingLine, 1200),
    ctaLine: text(content.ctaLine, 600),
    senderName: text(content.senderName, 200)
  };
  const required = ['greeting', 'openingLine', 'contextLine', 'companyBlurb', 'pitchLine', 'closingLine', 'ctaLine', 'senderName'];
  if (required.some(field => !normalized[field]) || !normalized.bullets.length) {
    throw Object.assign(new Error('Dynamic email content is incomplete.'), { code: 'INVALID_EMAIL_CONTENT' });
  }
  return normalized;
};

const proofLinks = (resources) => [
  { label: 'Explore case studies', url: resources.caseStudiesUrl },
  { label: 'Read client stories', url: resources.testimonialsUrl },
  { label: 'Visit Jobs Territory', url: resources.companyWebsiteUrl },
  { label: 'View our brochure', url: resources.brochureUrl }
].filter(item => item.url);

const buildAiPersonalizedEmailHtml = ({ content: rawContent, company, pointOfContact, resources }) => {
  const content = normalizeEmailContent(rawContent);
  content.greeting = normalizeGreetingName(content.greeting, pointOfContact);
  const companyName = company?.name || 'your company';
  const pocDisplayName = displayName(pointOfContact?.name);
  const identity = [pointOfContact?.designation, companyName, company?.industry].filter(Boolean).join(' | ');
  const companyLinks = [
    company?.website ? `<a href="${escapeHtml(company.website)}" target="_blank" rel="noopener noreferrer" style="color:#0f766e;text-decoration:none;font-weight:700;">Company website</a>` : '',
    company?.linkedInUrl ? `<a href="${escapeHtml(company.linkedInUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0f766e;text-decoration:none;font-weight:700;">Company LinkedIn</a>` : '',
    pointOfContact?.linkedInUrl ? `<a href="${escapeHtml(pointOfContact.linkedInUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0f766e;text-decoration:none;font-weight:700;">POC profile</a>` : ''
  ].filter(Boolean).join('<span style="color:#cbd5e1;margin:0 10px;">|</span>');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,'Helvetica Neue',sans-serif;color:#172033;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#eef2f6;padding:28px 14px;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.08);">
  <tr><td style="padding:24px 34px;background:#102a43;border-bottom:4px solid #14b8a6;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td align="left">${resources.logoUrl ? `<img src="${escapeHtml(resources.logoUrl)}" alt="${escapeHtml(resources.brandName)}" width="132" style="display:block;max-width:132px;height:auto;border:0;" />` : `<span style="font-size:22px;font-weight:900;color:#fff;">Jobs <span style="color:#5eead4;">Territory</span></span>`}</td>
      <td align="right"></td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:34px 38px 20px;">
    <div style="font-size:25px;font-weight:800;line-height:1.3;color:#102a43;margin-bottom:7px;">${withLineBreaks(content.greeting)}</div>
    ${identity ? `<div style="font-size:13px;color:#64748b;margin-bottom:22px;">${escapeHtml(identity)}</div>` : ''}
    <div style="font-size:16px;line-height:1.8;color:#334155;">${withLineBreaks(content.openingLine)}</div>
    ${companyLinks ? `<div style="font-size:12px;margin-top:14px;">${companyLinks}</div>` : ''}
  </td></tr>

  <tr><td style="padding:12px 38px;">
    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:14px;padding:20px 22px;">
      <div style="font-size:11px;font-weight:900;color:#0f766e;letter-spacing:1.1px;text-transform:uppercase;margin-bottom:9px;">Company insight</div>
      <div style="font-size:13px;line-height:1.7;color:#64748b;margin-bottom:13px;">${withLineBreaks(content.companyBlurb)}</div>
      <div style="font-size:14px;line-height:1.75;color:#334155;">${withLineBreaks(content.contextLine)}</div>
    </div>
  </td></tr>

  <tr><td style="padding:22px 38px 8px;">
    <div style="font-size:11px;font-weight:900;color:#7c3aed;letter-spacing:1.1px;text-transform:uppercase;margin-bottom:9px;">Why I'm reaching out</div>
    <div style="font-size:15px;line-height:1.8;color:#334155;">${withLineBreaks(content.pitchLine)}</div>
  </td></tr>

  <tr><td style="padding:16px 38px 8px;">
    <div style="font-size:11px;font-weight:900;color:#0f766e;letter-spacing:1.1px;text-transform:uppercase;margin-bottom:12px;">How Jobs Territory can help</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${content.bullets.map((bullet, index) => `
      <tr><td style="padding:0 0 10px;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td width="34" valign="top"><div style="width:25px;height:25px;line-height:25px;text-align:center;border-radius:50%;background:#102a43;color:#5eead4;font-size:11px;font-weight:900;">${index + 1}</div></td>
        <td style="font-size:14px;line-height:1.65;color:#334155;padding-top:1px;">${escapeHtml(bullet)}</td>
      </tr></table></td></tr>`).join('')}</table>
  </td></tr>

  <tr><td style="padding:18px 38px;">
    <div style="font-size:11px;font-weight:900;color:#7c3aed;letter-spacing:1.1px;text-transform:uppercase;margin-bottom:12px;">Relevant proof</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${proofLinks(resources).map(link => `
      <td style="padding:0 7px 8px 0;"><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" style="display:block;padding:12px 13px;border:1px solid #ddd6fe;border-radius:10px;color:#6d28d9;text-decoration:none;font-size:12px;font-weight:800;text-align:center;">${escapeHtml(link.label)}</a></td>`).join('')}</tr></table>
    <div style="font-size:13px;line-height:1.7;color:#64748b;margin-top:8px;">${withLineBreaks(content.closingLine)}</div>
  </td></tr>

  <tr><td style="padding:10px 38px 34px;">
    <div style="background:#102a43;border-radius:15px;padding:23px 24px;text-align:left;">
      <div style="font-size:10px;font-weight:900;color:#5eead4;letter-spacing:1.1px;text-transform:uppercase;margin-bottom:8px;">A simple next step</div>
      <div style="font-size:15px;line-height:1.7;color:#f8fafc;margin-bottom:16px;">${withLineBreaks(content.ctaLine)}</div>
      <a href="mailto:${escapeHtml(pointOfContact?.email)}" style="display:inline-block;background:#14b8a6;color:#062a2a;text-decoration:none;font-size:13px;font-weight:900;padding:11px 18px;border-radius:9px;">Reply to continue</a>
    </div>
    <div style="font-size:13px;line-height:1.7;color:#64748b;margin-top:22px;">Best regards,<br/><strong style="color:#102a43;">${withLineBreaks(content.senderName)}</strong></div>
  </td></tr>

  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 34px;text-align:center;">${buildEmailFooter(resources)}</td></tr>
</table></td></tr></table></body></html>`.trim();
};

const buildAiPersonalizedPlainText = ({ content: rawContent, company, pointOfContact, resources }) => {
  const content = normalizeEmailContent(rawContent);
  content.greeting = normalizeGreetingName(content.greeting, pointOfContact);
  return [
    content.greeting,
    'PERSONAL NOTE',
    content.openingLine,
    'COMPANY INSIGHT',
    content.contextLine,
    content.companyBlurb,
    "WHY I'M REACHING OUT",
    content.pitchLine,
    'HOW JOBS TERRITORY CAN HELP',
    ...content.bullets.map(bullet => `- ${normalizeBulletMarkers(bullet)}`),
    'RELEVANT PROOF',
    content.closingLine,
    ...proofLinks(resources).map(link => `${link.label}: ${link.url}`),
    'A SIMPLE NEXT STEP',
    content.ctaLine,
    `Best regards,\n${content.senderName}`,
    company?.website ? `Company referenced: ${company.website}` : ''
  ].filter(Boolean).join('\n\n');
};

module.exports = {
  buildAiPersonalizedEmailHtml,
  buildAiPersonalizedPlainText,
  normalizeEmailContent
};
