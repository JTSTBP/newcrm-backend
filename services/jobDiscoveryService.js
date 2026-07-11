const { researchCompanyPublicly } = require('../utils/publicCompanyResearch');
const { inferIndustryWithGemini } = require('../utils/aiEmailService');
const { getIndustryDefaultRoles, getIndustryIntroduction, getIndustryProfile, normalizeIndustryName } = require('./industryDefaults');

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
const HIRING_NEED_DEFAULTS = [
  { pattern: /(developer|engineer|software|frontend|backend|full stack|qa|devops|technical|technology|\bit\b)/i, roles: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'QA Engineer', 'DevOps Engineer'] },
  { pattern: /(sales|business development|bd|field sales|inside sales)/i, roles: ['Sales Executive', 'Business Development Executive', 'Sales Manager'] },
  { pattern: /(hr|recruit|talent|human resources)/i, roles: ['HR Recruiter', 'Talent Acquisition Executive', 'HR Executive'] },
  { pattern: /(marketing|digital|seo|social media|content)/i, roles: ['Digital Marketing Executive', 'Marketing Executive', 'Content Writer'] },
  { pattern: /(operation|admin|back office|support)/i, roles: ['Operations Executive', 'Admin Executive', 'Customer Support Executive'] },
  { pattern: /(finance|account)/i, roles: ['Finance Analyst', 'Account Executive', 'Billing Executive'] }
];
const COMPANY_INFERENCE_DEFAULTS = getIndustryDefaultRoles('General Business Services', { limit: 10 });
const INVALID_INDUSTRY_VALUES = /^(n\/a|na|none|null|unknown|undefined|general|general industry|-|--|\.)$/i;

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
  if (url.includes('linkedin.com/jobs')) return 'LinkedIn Jobs (search evidence)';
  if (url.includes('naukri.com')) return 'Naukri';
  if (url.includes('indeed.com')) return 'Indeed';
  if (url.includes('instahyre.com')) return 'Instahyre';
  if (url.includes('wellfound.com')) return 'Wellfound';
  if (type === 'company_website') return 'Company Careers';
  return 'Public Search';
};

const departmentFor = title => {
  if (/(developer|engineer|devops|data scientist|qa|software|ui\/ux|designer)/i.test(title)) return 'Engineering / Technology';
  if (/(recruiter|talent|\bhr\b|human resources)/i.test(title)) return 'Human Resources / Talent Acquisition';
  if (/(sales|business development|relationship manager|property consultant)/i.test(title)) return 'Sales / Business Development';
  if (/(marketing|seo|content)/i.test(title)) return 'Marketing';
  if (/(operations|admin|back office|warehouse|store manager)/i.test(title)) return 'Operations';
  if (/(procurement|supply chain|inventory|logistics|dispatch|transport|fleet)/i.test(title)) return 'Supply Chain / Logistics';
  if (/(finance|account|billing)/i.test(title)) return 'Finance';
  if (/customer success|customer support/i.test(title)) return 'Customer Success';
  if (/product/i.test(title)) return 'Product';
  if (/(food technologist|packaging|qc|qa executive|quality)/i.test(title)) return 'Quality / Production';
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

function getDefaultJobsByIndustry(industryName) {
  const normalizedIndustry = clean(industryName, 200).toLowerCase();
  if (!normalizedIndustry) return [];
  const profile = getIndustryProfile(normalizedIndustry);
  if (profile?.roles?.length) return getIndustryDefaultRoles(profile.label, { limit: 18 });

  return [];
}

const hasValidIndustry = value => {
  const industry = clean(value, 120);
  return Boolean(industry && !INVALID_INDUSTRY_VALUES.test(industry));
};

const summarizeResearchForIndustry = publicResearch => {
  const evidence = publicResearch?.evidenceByCategory || {};
  const groups = [
    ...(evidence.companyOverview || []),
    ...(evidence.careerPage || []),
    ...(evidence.currentOpenings || []),
    ...(evidence.structuredJobs || [])
  ];
  return groups.slice(0, 6).map(item => `${item.title || ''} ${item.snippet || ''}`.trim()).join(' ');
};

async function resolveIndustryForEmail({ companyName, websiteUrl, linkedInUrl, savedIndustryName, companyInfo, publicResearch }) {
  if (hasValidIndustry(savedIndustryName)) {
    return { resolvedIndustry: normalizeIndustryName(savedIndustryName), industrySource: 'crm' };
  }

  try {
    const inferred = await inferIndustryWithGemini({
      companyName,
      websiteUrl,
      companyInfo,
      linkedInUrl,
      researchSummary: summarizeResearchForIndustry(publicResearch),
      websiteText: (publicResearch?.websiteExtracts || []).slice(0, 3).map(item => item.text || item.snippet || '').join(' ')
    });
    if (hasValidIndustry(inferred)) {
      return { resolvedIndustry: normalizeIndustryName(inferred) || inferred, industrySource: 'gemini_inference' };
    }
  } catch (error) {
    console.warn('[AI Email] Industry inference unavailable; using default fallback', {
      companyName,
      reason: error.code || error.message
    });
  }

  return { resolvedIndustry: 'General Business Services', industrySource: 'default_fallback' };
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

function buildFallbackJobs({ roles, source, sourceType, industryName, hiringNeeds }) {
  return [...new Set(roles)].slice(0, 20).map(title => ({
    title,
    location: '',
    department: departmentFor(title),
    applyUrl: '',
    source,
    postedDate: null,
    evidenceText: sourceType === 'saved_industry_fallback'
      ? `Role selected from saved CRM industry_name "${clean(industryName, 120)}" for recruitment support.`
      : sourceType === 'crm_hiring_needs'
        ? `Role selected from saved CRM hiring_needs "${normalizeList(hiringNeeds).join(', ')}" for recruitment support.`
        : sourceType === 'gemini_industry_fallback'
          ? `Role selected from Gemini-inferred industry "${clean(industryName, 120)}" for this email only.`
          : 'Role selected from General Business Services fallback for recruitment support.',
    sourceType,
    confidence: 'assumption'
  }));
}

const removeGenericDuplicateTitles = jobs => jobs.filter(job =>
  !jobs.some(other =>
    other !== job &&
    other.location === job.location &&
    other.title.toLowerCase().includes(job.title.toLowerCase()) &&
    other.title.length > job.title.length
  )
);

async function discoverCompanyJobs(input, options = {}) {
  const { companyName, websiteUrl, linkedinUrl, pocName, pocLinkedinUrl, industry, companyInfo, hiringNeeds = [] } = input;
  const savedIndustryName = clean(industry, 200);
  const savedHiringNeeds = normalizeList(hiringNeeds);
  console.info('[JOB DISCOVERY INPUT]', { companyName, websiteUrl, linkedinUrl, pocName, pocLinkedinUrl, savedIndustryName, savedHiringNeeds });

  const publicResearch = options.publicResearch || await researchCompanyPublicly({
    company: { name: companyName, website: websiteUrl, linkedInUrl: linkedinUrl },
    pointOfContact: { name: pocName, linkedInUrl: pocLinkedinUrl }
  });

  const evidence = publicResearch.evidenceByCategory || {};
  const industryResolution = await resolveIndustryForEmail({
    companyName,
    websiteUrl,
    linkedInUrl: linkedinUrl,
    savedIndustryName,
    companyInfo,
    publicResearch
  });
  const resolvedIndustry = industryResolution.resolvedIndustry;
  const industrySource = industryResolution.industrySource;
  const resolvedIndustryRoles = getIndustryDefaultRoles(resolvedIndustry, { limit: 18 });
  console.info('[AI Email] Industry resolution', {
    companyName,
    resolvedIndustry,
    industrySource,
    roleCount: resolvedIndustryRoles.length
  });
  const pools = [
    ...(evidence.structuredJobs || []), ...(evidence.currentOpenings || []), ...(evidence.careerPage || []),
    ...(evidence.atsEvidence || []), ...(evidence.jobBoardEvidence || []), ...(evidence.linkedinHiringEvidence || []),
    ...(evidence.jobTitlesHiring || [])
  ];
  const jobs = [];
  const rejected = [];

  for (const item of pools) {
    const isWebsiteEvidence = item.sourceType === 'company_website' || /_ats$/i.test(item.sourceType || '') ||
      /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com)/i.test(item.url || '');
    const isPublicJobEvidence = ['jobBoardEvidence', 'linkedinHiringEvidence'].includes(item.category) ||
      /(linkedin\.com\/jobs|naukri\.com|indeed\.com|instahyre\.com|wellfound\.com)/i.test(item.url || '');
    if (!isWebsiteEvidence && !isPublicJobEvidence) continue;

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
        jobOrigin: isWebsiteEvidence ? 'website' : 'public',
        confidence: isStructured || item.sourceType === 'company_website' ? 'high' : 'medium'
      });
    }
  }

  const dedupedJobs = [...new Map(jobs.map(job => [`${job.title.toLowerCase()}|${job.location.toLowerCase()}|${job.jobOrigin}`, job])).values()];
  const websiteJobs = removeGenericDuplicateTitles(dedupedJobs.filter(job => job.jobOrigin === 'website')).slice(0, 20);
  const publicJobs = websiteJobs.length ? [] : removeGenericDuplicateTitles(dedupedJobs.filter(job => job.jobOrigin === 'public')).slice(0, 12);
  const normalizedJobs = websiteJobs.length ? websiteJobs : publicJobs;
  const crmHiringNeedRoles = normalizedJobs.length ? [] : getDefaultJobsByHiringNeeds(savedHiringNeeds);
  const industryFallbackRoles = normalizedJobs.length || crmHiringNeedRoles.length ? [] : resolvedIndustryRoles;
  const finalFallbackRoles = normalizedJobs.length || crmHiringNeedRoles.length || industryFallbackRoles.length
    ? []
    : COMPANY_INFERENCE_DEFAULTS;
  const jobResearchSource = websiteJobs.length ? 'website_jobs'
    : publicJobs.length ? 'public_jobs'
    : crmHiringNeedRoles.length ? 'crm_hiring_needs'
      : industryFallbackRoles.length ? (industrySource === 'crm' ? 'saved_industry_fallback' : industrySource === 'gemini_inference' ? 'gemini_industry_fallback' : 'default_business_fallback')
        : 'default_business_fallback';
  const industryDefaultJobs = normalizedJobs.length ? [] : buildFallbackJobs({
    roles: crmHiringNeedRoles.length ? crmHiringNeedRoles : industryFallbackRoles.length ? industryFallbackRoles : finalFallbackRoles,
    source: crmHiringNeedRoles.length ? 'Saved hiring needs' : industrySource === 'crm' ? 'Saved industry profile' : industrySource === 'gemini_inference' ? 'Gemini industry inference' : 'General business fallback',
    sourceType: jobResearchSource,
    industryName: resolvedIndustry,
    hiringNeeds: savedHiringNeeds
  });
  const emailJobs = normalizedJobs.length ? normalizedJobs : industryDefaultJobs;
  const diagnostics = {
    ...(publicResearch.diagnostics || {}),
    discoveredCareersUrl: publicResearch.diagnostics?.careerUrlsChecked?.[0] || null,
    detectedAts: publicResearch.diagnostics?.atsDetected || [],
    jobsFound: normalizedJobs.length,
    websiteJobsFound: websiteJobs.length,
    publicJobsFound: publicJobs.length,
    fallbackSource: jobResearchSource,
    savedIndustryName,
    resolvedIndustry,
    industrySource,
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
  console.info('[AI Email] Role source selected', {
    jobResearchSource,
    roleCount: emailJobs.length
  });

  return {
    jobsFound: normalizedJobs.length > 0,
    jobs: emailJobs,
    websiteJobs,
    publicJobs,
    industryDefaultJobs,
    savedIndustryName,
    resolvedIndustry,
    industrySource,
    savedHiringNeeds,
    jobResearchSource,
    industryIntroduction: getIndustryIntroduction({ companyName, industryName: resolvedIndustry }),
    message: websiteJobs.length ? `${websiteJobs.length} verified active job${websiteJobs.length === 1 ? '' : 's'} found on the company website or ATS.`
      : publicJobs.length ? `${publicJobs.length} public job result${publicJobs.length === 1 ? '' : 's'} found from job/search evidence.`
      : jobResearchSource === 'saved_industry_fallback' ? `Based on the resolved CRM industry "${resolvedIndustry}", Jobs Territory can support the listed roles.`
        : jobResearchSource === 'crm_hiring_needs' ? 'Based on saved CRM hiring needs, Jobs Territory can support the listed roles.'
          : jobResearchSource === 'gemini_industry_fallback' ? `Based on the inferred industry "${resolvedIndustry}", Jobs Territory can support the listed roles.`
            : 'Based on your company profile, Jobs Territory can support the listed general business roles.',
    hiringDepartments: [...new Set(emailJobs.map(job => job.department).filter(Boolean))],
    locations: [...new Set(normalizedJobs.map(job => job.location).filter(Boolean))],
    technologiesSkills: [...new Set(emailJobs.flatMap(job => matches(job.title, ['Frontend', 'Backend', 'Full Stack', 'Software', 'DevOps', 'Data', 'Cloud', 'AI', 'Machine Learning'])))],
    dataGaps: [
      ...(!websiteJobs.length ? ['No active jobs were verified on the company website or detected ATS pages.'] : []),
      ...(!normalizedJobs.length && !savedIndustryName ? ['Saved CRM industry_name is unavailable.'] : []),
      ...(!normalizedJobs.length && !savedHiringNeeds.length ? ['Saved CRM hiring_needs is unavailable or empty.'] : [])
    ],
    diagnostics
  };
}

module.exports = { discoverCompanyJobs, getDefaultJobsByIndustry, resolveIndustryForEmail };
