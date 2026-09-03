const normalize = (value) => typeof value === 'string' ? value.trim() : '';

const JOBS_TERRITORY_SERVICES = [
  'Mid-to-senior non-IT recruitment',
  'Sales, Marketing, Business Development, Operations, HR and leadership hiring support',
  'Candidate sourcing and pre-screening',
  'Focused shortlist delivery',
  'Flexible recruitment capacity for client teams',
  'PAN India hiring support',
  'Permanent staffing',
  'Contract staffing',
  'Executive search',
  'Dedicated recruiter support'
];

function buildAiEmailContext({ lead, poc, sender, previousCrm, resources }) {
  const previousInteractions = Array.isArray(previousCrm?.notes) ? previousCrm.notes : [];
  const leadStage = normalize(lead.stage);
  const leadSource = normalize(lead.source || lead.lead_source);
  return {
    emailPurpose: {
      objective: previousInteractions.length
        ? 'Continue an existing business-development conversation using relevant prior interaction context.'
        : 'Start a relevant business-development conversation about where Jobs Territory could support this contact and company.',
      leadStage,
      leadSource
    },
    crmData: {
      leadStage,
      leadSource,
      hiringNeeds: Array.isArray(lead.hiring_needs) ? lead.hiring_needs.map(normalize).filter(Boolean) : [],
      noOfDesignations: Number.isFinite(lead.no_of_designations) ? lead.no_of_designations : null,
      noOfPositions: Number.isFinite(lead.no_of_positions) ? lead.no_of_positions : null,
      previousInteractions
    },
    company: {
      name: normalize(lead.company_name),
      website: normalize(lead.website_url),
      linkedInUrl: normalize(lead.linkedin_link),
      industry: normalize(lead.industry_name),
      companyInfo: normalize(lead.company_info),
      hiringNeeds: Array.isArray(lead.hiring_needs) ? lead.hiring_needs.map(normalize).filter(Boolean) : [],
      numberOfDesignations: Number.isFinite(lead.no_of_designations) ? lead.no_of_designations : null,
      numberOfPositions: Number.isFinite(lead.no_of_positions) ? lead.no_of_positions : null,
      companySize: normalize(lead.company_size),
      leadStage,
      leadSource
    },
    pointOfContact: {
      name: normalize(poc.name),
      designation: normalize(poc.designation),
      email: normalize(poc.email),
      linkedInUrl: normalize(poc.linkedin_url),
      requirementId: normalize(poc.requirementId),
      notes: previousInteractions,
      department: normalize(previousCrm?.department),
      previousInteractions
    },
    sender: {
      name: normalize(sender?.name) || 'Business Development Team',
      company: 'Jobs Territory'
    },
    jobsTerritory: {
      services: JOBS_TERRITORY_SERVICES,
      caseStudiesUrl: normalize(resources?.caseStudiesUrl),
      testimonialsUrl: normalize(resources?.testimonialsUrl),
      companyWebsiteUrl: normalize(resources?.companyWebsiteUrl),
      brochureUrl: normalize(resources?.brochureUrl)
    }
  };
}

module.exports = { buildAiEmailContext };
