const { researchCompanyPublicly } = require('../utils/publicCompanyResearch');

const clean = (value, max = 300) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const TITLE_TERMS = [
  'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Full Stack Engineer', 'Software Engineer',
  'Software Developer', 'DevOps Engineer', 'Data Engineer', 'Data Scientist', 'Product Manager', 'Project Manager',
  'Customer Success Manager', 'Business Development Manager', 'Business Development Executive', 'Sales Manager',
  'Sales Executive', 'Marketing Manager', 'Marketing Executive', 'Operations Manager', 'HR Recruiter',
  'Talent Acquisition Manager', 'Finance Analyst', 'Business Analyst', 'Data Analyst', 'Product Designer',
  'Developer', 'Engineer', 'Recruiter', 'Manager', 'Executive', 'Associate', 'Analyst', 'Designer'
];
const LOCATIONS = ['Bengaluru', 'Bangalore', 'Mumbai', 'Delhi', 'New Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Gurugram', 'Gurgaon', 'Noida', 'Ahmedabad', 'Remote', 'Hybrid'];
const INDUSTRY_DEFAULTS = [
  { key: 'it_software', pattern: /(information\s*technology|\bit\b|it\s*services|software|saas|technology|tech|digital|web|app development|cloud)/i, roles: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'QA Engineer', 'DevOps Engineer', 'UI/UX Designer'] },
  { key: 'manufacturing', pattern: /(manufactur|industrial|factory|automotive|production|plant|machinery|engineering goods)/i, roles: ['Production Supervisor', 'Quality Engineer', 'Maintenance Technician', 'Plant HR Executive', 'Sales Executive'] },
  { key: 'healthcare', pattern: /(health\s*care|healthcare|hospital|medical|pharma|clinic|diagnostic|life sciences)/i, roles: ['Staff Nurse', 'Medical Representative', 'Lab Technician', 'Hospital Admin Executive', 'Billing Executive'] },
  { key: 'recruitment_hr', pattern: /(recruitment|staffing|human\s*resources|\bhr\b|talent|manpower|placement)/i, roles: ['HR Recruiter', 'Talent Acquisition Executive', 'Business Development Executive', 'Client Relationship Manager'] },
  { key: 'education', pattern: /(education|edtech|training|school|college|university|institute|academy)/i, roles: ['Admission Counsellor', 'Academic Coordinator', 'Trainer', 'Digital Marketing Executive', 'Telecaller'] },
  { key: 'real_estate', pattern: /(real\s*estate|property|construction|builder|infrastructure)/i, roles: ['Sales Executive', 'Property Consultant', 'Site Engineer', 'CRM Executive', 'Digital Marketing Executive'] },
  { key: 'retail_ecommerce', pattern: /(retail|e-?commerce|commerce|consumer|fmcg|fashion|store)/i, roles: ['Store Manager', 'Sales Executive', 'Customer Support Executive', 'Warehouse Executive', 'Digital Marketing Executive'] },
  { key: 'finance', pattern: /(finance|financial|bank|nbfc|insurance|fintech|accounting)/i, roles: ['Finance Analyst', 'Account Executive', 'Relationship Manager', 'Sales Executive', 'Operations Executive'] }
];
const HIRING_NEED_DEFAULTS = [
  { pattern: /(developer|engineer|software|frontend|backend|full stack|qa|devops|technical|technology|\bit\b)/i, roles: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'QA Engineer', 'DevOps Engineer'] },
  { pattern: /(sales|business development|bd|field sales|inside sales)/i, roles: ['Sales Executive', 'Business Development Executive', 'Sales Manager'] },
  { pattern: /(hr|recruit|talent|human resources)/i, roles: ['HR Recruiter', 'Talent Acquisition Executive', 'HR Executive'] },
  { pattern: /(marketing|digital|seo|social media|content)/i, roles: ['Digital Marketing Executive', 'Marketing Executive', 'Content Writer'] },
  { pattern: /(operation|admin|back office|support)/i, roles: ['Operations Executive', 'Admin Executive', 'Customer Support Executive'] },
  { pattern: /(finance|account)/i, roles: ['Finance Analyst', 'Account Executive', 'Billing Executive'] }
];
const COMPANY_INFERENCE_DEFAULTS = ['Sales Executive', 'Business Development Executive', 'HR Recruiter', 'Operations Executive', 'Digital Marketing Executive'];

const matches = (text, values) => values.filter(value => new RegExp(`\\b${value.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text));
const normalizeList = value => Array.isArray(value)
  ? value.map(item => clean(item, 160)).filter(Boolean)
  : clean(value, 500).split(/[,;\n|]/).map(item => clean(item, 160)).filter(Boolean);

const sourceLabel = item => {
  const type = String(item.sourceType || '').toLowerCase();
  const url = String(item.url || '').toLowerCase();
  if (type.includes('greenhouse') || url.includes('greenhouse.io')) return 'Greenhouse';
  if (type.includes('lever') || url.includes('lever.co')) return 'Lever';
  if (type.includes('ashby') || url.includes('ashbyhq.com')) return 'Ashby';
  if (type.includes('workday') || url.includes('myworkdayjobs.com')) return 'Workday';
  if (type === 'company_website') return 'Company Careers';
  return 'Public Search';
};

const departmentFor = title => {
  if (/(developer|engineer|devops|data scientist|qa|software|ui\/ux|designer)/i.test(title)) return 'Engineering / Technology';
  if (/(recruiter|talent|\bhr\b|human resources)/i.test(title)) return 'Human Resources / Talent Acquisition';
  if (/(sales|business development|relationship manager|property consultant)/i.test(title)) return 'Sales / Business Development';
  if (/(marketing|seo|content)/i.test(title)) return 'Marketing';
  if (/(operations|admin|back office|warehouse|store manager)/i.test(title)) return 'Operations';
  if (/(finance|account|billing)/i.test(title)) return 'Finance';
  if (/customer success|customer support/i.test(title)) return 'Customer Success';
  if (/product/i.test(title)) return 'Product';
  if (/(production|quality|maintenance|plant|technician)/i.test(title)) return 'Manufacturing / Plant Operations';
  if (/(nurse|medical|lab|hospital)/i.test(title)) return 'Healthcare Operations';
  if (/(admission|academic|trainer|telecaller)/i.test(title)) return 'Education / Counselling';
  return '';
};

const extractPhraseTitles = text => {
  const output = [];
  for (const pattern of [/\bhiring\s+(?:for\s+)?(?:an?\s+)?([^|,.]{3,100}?)(?:\s+in\s+[A-Z][^|,.]{1,80}|[|,.]|$)/gi, /\b(?:open role|job opening)\s+(?:for\s+)?(?:an?\s+)?([^|,.]{3,100}?)(?:\s+in\s+[A-Z][^|,.]{1,80}|[|,.]|$)/gi]) {
    for (const match of String(text || '').matchAll(pattern)) {
      const title = clean(match[1], 120);
      if (!/^(jobs?|candidates?|people|talent|multiple roles?)$/i.test(title)) output.push(title);
    }
  }
  return output;
};

function getDefaultJobsByIndustry(industryName, hiringNeeds = []) {
  const normalizedIndustry = clean(industryName, 200).toLowerCase();
  if (!normalizedIndustry) return [];
  const match = INDUSTRY_DEFAULTS.find(item => item.pattern.test(normalizedIndustry));
  if (match) return match.roles;

  // CRM industry is present but not mapped. Use saved hiring needs as a secondary hint,
  // while still recording the final source as saved_hiring_needs_fallback.
  return [];
}

function getDefaultJobsByHiringNeeds(hiringNeeds = []) {
  const hiringText = normalizeList(hiringNeeds).join(' ').toLowerCase();
  if (!hiringText) return [];
  const roles = [];
  for (const item of HIRING_NEED_DEFAULTS) {
    if (item.pattern.test(hiringText)) roles.push(...item.roles);
  }
  return [...new Set(roles)].slice(0, 6);
}

function inferCompanyFallbackRoles({ companyName, websiteUrl }) {
  const text = `${companyName || ''} ${websiteUrl || ''}`.toLowerCase();
  const match = INDUSTRY_DEFAULTS.find(item => item.pattern.test(text));
  return match?.roles || COMPANY_INFERENCE_DEFAULTS;
}

function buildFallbackJobs({ roles, source, sourceType, industryName, hiringNeeds }) {
  return [...new Set(roles)].slice(0, 6).map(title => ({
    title,
    location: '',
    department: departmentFor(title),
    applyUrl: '',
    source,
    postedDate: null,
    evidenceText: sourceType === 'saved_industry_fallback'
      ? `Role selected from saved CRM industry_name "${clean(industryName, 120)}"; not an active opening claim.`
      : sourceType === 'saved_hiring_needs_fallback'
        ? `Role selected from saved CRM hiring_needs "${normalizeList(hiringNeeds).join(', ')}"; not an active opening claim.`
        : 'Role selected from company-name/website inference as a last-resort fallback; not an active opening claim.',
    sourceType,
    confidence: 'assumption'
  }));
}

async function discoverCompanyJobs(input, options = {}) {
  const { companyName, websiteUrl, linkedinUrl, pocName, pocLinkedinUrl, industry, hiringNeeds = [] } = input;
  const savedIndustryName = clean(industry, 200);
  const savedHiringNeeds = normalizeList(hiringNeeds);
  console.info('[JOB DISCOVERY INPUT]', { companyName, websiteUrl, linkedinUrl, pocName, pocLinkedinUrl, savedIndustryName, savedHiringNeeds });

  const publicResearch = options.publicResearch || await researchCompanyPublicly({
    company: { name: companyName, website: websiteUrl, linkedInUrl: linkedinUrl },
    pointOfContact: { name: pocName, linkedInUrl: pocLinkedinUrl }
  });

  const evidence = publicResearch.evidenceByCategory || {};
  const pools = [
    ...(evidence.structuredJobs || []), ...(evidence.currentOpenings || []), ...(evidence.careerPage || []),
    ...(evidence.atsEvidence || []), ...(evidence.jobTitlesHiring || [])
  ];
  const jobs = [];
  const rejected = [];

  for (const item of pools) {
    const isWebsiteEvidence = item.sourceType === 'company_website' || /_ats$/i.test(item.sourceType || '') ||
      /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com)/i.test(item.url || '');
    if (!isWebsiteEvidence) continue;

    const text = `${item.title || ''} ${item.snippet || ''}`;
    const isStructured = item.category === 'structuredJobs' || /_ats$/i.test(item.sourceType || '');
    const titles = isStructured && item.title
      ? [clean(item.title, 160)]
      : [...new Set([...matches(text, TITLE_TERMS), ...extractPhraseTitles(text)])];

    if (!titles.length) {
      rejected.push({ url: item.url, reason: 'No verified job title in website/ATS evidence.' });
      continue;
    }

    const location = clean(item.location || matches(text, LOCATIONS)[0], 120);
    for (const title of titles) {
      jobs.push({
        title,
        location,
        department: departmentFor(title),
        applyUrl: clean(item.url, 1000),
        source: sourceLabel(item),
        postedDate: item.postedDate || null,
        evidenceText: clean(item.snippet || item.title, 500),
        sourceType: item.sourceType || item.category || 'company_website',
        confidence: isStructured || item.sourceType === 'company_website' ? 'high' : 'medium'
      });
    }
  }

  const normalizedJobs = [...new Map(jobs.map(job => [`${job.title.toLowerCase()}|${job.location.toLowerCase()}`, job])).values()].slice(0, 20);
  const savedIndustryRoles = normalizedJobs.length ? [] : getDefaultJobsByIndustry(savedIndustryName, savedHiringNeeds);
  const savedHiringNeedRoles = normalizedJobs.length || savedIndustryRoles.length ? [] : getDefaultJobsByHiringNeeds(savedHiringNeeds);
  const companyInferenceRoles = normalizedJobs.length || savedIndustryRoles.length || savedHiringNeedRoles.length
    ? []
    : inferCompanyFallbackRoles({ companyName, websiteUrl });
  const jobResearchSource = normalizedJobs.length ? 'company_website'
    : savedIndustryRoles.length ? 'saved_industry_fallback'
      : savedHiringNeedRoles.length ? 'saved_hiring_needs_fallback'
        : companyInferenceRoles.length ? 'company_inference_fallback'
          : null;
  const industryDefaultJobs = normalizedJobs.length ? [] : buildFallbackJobs({
    roles: savedIndustryRoles.length ? savedIndustryRoles : savedHiringNeedRoles.length ? savedHiringNeedRoles : companyInferenceRoles,
    source: savedIndustryRoles.length ? 'Saved industry profile' : savedHiringNeedRoles.length ? 'Saved hiring needs' : 'Company inference fallback',
    sourceType: jobResearchSource,
    industryName: savedIndustryName,
    hiringNeeds: savedHiringNeeds
  });
  const emailJobs = normalizedJobs.length ? normalizedJobs : industryDefaultJobs;
  const diagnostics = {
    ...(publicResearch.diagnostics || {}),
    discoveredCareersUrl: publicResearch.diagnostics?.careerUrlsChecked?.[0] || null,
    detectedAts: publicResearch.diagnostics?.atsDetected || [],
    jobsFound: normalizedJobs.length,
    fallbackSource: jobResearchSource,
    savedIndustryName,
    savedHiringNeeds,
    rejectedReasons: [...(publicResearch.diagnostics?.rejectedReasons || []), ...rejected]
  };

  console.info('[JOB DISCOVERY RESULT]', {
    companyName,
    savedIndustryName,
    savedHiringNeeds,
    discoveredCareersUrl: diagnostics.discoveredCareersUrl,
    detectedAts: diagnostics.detectedAts,
    jobsFound: normalizedJobs.length,
    fallbackSource: jobResearchSource
  });

  return {
    jobsFound: normalizedJobs.length > 0,
    jobs: emailJobs,
    websiteJobs: normalizedJobs,
    industryDefaultJobs,
    savedIndustryName,
    savedHiringNeeds,
    jobResearchSource,
    message: normalizedJobs.length ? `${normalizedJobs.length} verified active job${normalizedJobs.length === 1 ? '' : 's'} found.`
      : jobResearchSource === 'saved_industry_fallback' ? `Based on the saved CRM industry profile "${savedIndustryName}", companies in this sector commonly hire for the listed roles.`
        : jobResearchSource === 'saved_hiring_needs_fallback' ? 'Based on saved CRM hiring needs, similar companies commonly hire for the listed roles.'
          : 'Based on limited company-name/website inference, these are broad support roles Jobs Territory can help with.',
    hiringDepartments: [...new Set(emailJobs.map(job => job.department).filter(Boolean))],
    locations: [...new Set(normalizedJobs.map(job => job.location).filter(Boolean))],
    technologiesSkills: [...new Set(emailJobs.flatMap(job => matches(job.title, ['Frontend', 'Backend', 'Full Stack', 'Software', 'DevOps', 'Data', 'Cloud', 'AI', 'Machine Learning'])))],
    dataGaps: [
      ...(!normalizedJobs.length ? ['No active jobs were verified on the company website or detected ATS pages.'] : []),
      ...(!normalizedJobs.length && !savedIndustryName ? ['Saved CRM industry_name is unavailable.'] : []),
      ...(!normalizedJobs.length && !savedHiringNeeds.length ? ['Saved CRM hiring_needs is unavailable or empty.'] : [])
    ],
    diagnostics
  };
}

module.exports = { discoverCompanyJobs, getDefaultJobsByIndustry };
