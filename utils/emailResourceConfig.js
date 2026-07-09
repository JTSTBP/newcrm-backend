const { EMAIL_RESOURCES } = require('../config/emailResources');

const REQUIRED_RESOURCE_FIELDS = [
  'caseStudiesUrl',
  'testimonialsUrl',
  'companyWebsiteUrl',
  'logoUrl',
  'linkedInUrl',
  'contactEmail',
  'brandName',
  'footerText'
];

const getEmailResources = () => ({ ...EMAIL_RESOURCES });

const hasRequiredEmailResources = (resources) => REQUIRED_RESOURCE_FIELDS.every(field =>
  typeof resources?.[field] === 'string' && resources[field].trim()
);

module.exports = { getEmailResources, hasRequiredEmailResources };
