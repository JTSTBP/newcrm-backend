const { escapeHtml } = require('./emailHtmlTemplateHelpers');

const renderLinks = (links, style) => links
  .filter(link => link.url)
  .map(link => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" style="${style}">${escapeHtml(link.label)}</a>`)
  .join('');

const buildEmailFooter = (resources) => {
  const socialLinks = [
    { label: 'LinkedIn', url: resources.linkedInUrl },
    { label: 'Twitter / X', url: resources.twitterUrl },
    { label: 'Facebook', url: resources.facebookUrl },
    { label: 'Instagram', url: resources.instagramUrl }
  ];
  const referenceLinks = [
    { label: 'Website', url: resources.companyWebsiteUrl },
    { label: 'Case Studies', url: resources.caseStudiesUrl },
    { label: 'Testimonials', url: resources.testimonialsUrl },
    { label: 'Brochure', url: resources.brochureUrl },
    { label: 'Privacy Policy', url: resources.privacyPolicyUrl }
  ];
  const linkStyle = 'display:inline-block;color:#475569;text-decoration:none;font-size:11px;font-weight:700;margin:4px 8px;';
  const phoneHref = String(resources.contactPhone || '').replace(/[^+0-9]/g, '');
  const logo = resources.logoUrl
    ? `<a href="${escapeHtml(resources.companyWebsiteUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-bottom:14px;"><img src="${escapeHtml(resources.logoUrl)}" alt="${escapeHtml(resources.brandName)}" width="150" style="display:block;max-width:150px;height:auto;border:0;" /></a>`
    : '';
  const contact = [
    resources.contactEmail ? `<a href="mailto:${escapeHtml(resources.contactEmail)}" style="${linkStyle}">${escapeHtml(resources.contactEmail)}</a>` : '',
    phoneHref ? `<a href="tel:${escapeHtml(phoneHref)}" style="${linkStyle}">${escapeHtml(resources.contactPhone)}</a>` : ''
  ].join('');

  return `${logo}
    <div style="margin-bottom:8px;">${renderLinks(socialLinks, linkStyle)}</div>
    <div style="margin-bottom:8px;">${renderLinks(referenceLinks, linkStyle)}</div>
    ${contact ? `<div style="margin-bottom:10px;">${contact}</div>` : ''}
    <div style="font-size:11px;color:#94a3b8;">${escapeHtml(resources.footerText)}</div>`;
};

module.exports = { buildEmailFooter };
