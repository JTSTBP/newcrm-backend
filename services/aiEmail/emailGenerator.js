const { generateAiEmail } = require('../../utils/aiEmailService');
const { classifyPocRole } = require('../../utils/pocRoleClassifier');
const { buildCompanyHiringEnrichment, getCompanyHiringResearch } = require('../enrichment/companyHiringEnrichment');
const { discoverCompanyJobs } = require('../jobDiscoveryService');
const {
  buildAiPersonalizedEmailHtml,
  buildAiPersonalizedPlainText
} = require('./aiPersonalizedEmailTemplate');

const unavailableResearch = () => ({
  status: 'unavailable',
  sources: [],
  websiteExtracts: [],
  errors: ['Public research was unavailable.']
});

const limitEvidence = (items = [], max = 3) => (Array.isArray(items) ? items : [])
  .slice(0, max)
  .map(item => ({
    title: item.title,
    url: item.url,
    snippet: String(item.snippet || '').slice(0, 500),
    source: item.source || item.sourceType,
    category: item.category
  }));

const compactModelContext = (context, crmOnly = false) => ({
  ...context,
  companyResearch: crmOnly ? {} : {
    overview: limitEvidence(context.companyResearch?.overview, 3),
    expansion: limitEvidence(context.companyResearch?.expansion, 2),
    funding: limitEvidence(context.companyResearch?.funding, 2),
    growth: limitEvidence(context.companyResearch?.growth, 2),
    recentNews: limitEvidence(context.companyResearch?.recentNews, 2),
    linkedIn: limitEvidence(context.companyResearch?.linkedIn, 2)
  },
  hiringResearch: crmOnly ? {} : {
    currentOpenings: limitEvidence(context.hiringResearch?.currentOpenings, 3),
    jobTitlesHiring: limitEvidence(context.hiringResearch?.jobTitlesHiring, 3),
    linkedInJobs: limitEvidence(context.hiringResearch?.linkedInJobs, 2),
    linkedinHiringEvidence: limitEvidence(context.hiringResearch?.linkedinHiringEvidence, 2),
    pocHiringActivity: limitEvidence(context.hiringResearch?.pocHiringActivity, 2),
    careerPage: limitEvidence(context.hiringResearch?.careerPage, 2),
    hiringTrends: limitEvidence(context.hiringResearch?.hiringTrends, 2),
    departmentsHiring: limitEvidence(context.hiringResearch?.departmentsHiring, 2),
    locationsHiring: limitEvidence(context.hiringResearch?.locationsHiring, 2),
    recruitmentActivity: limitEvidence(context.hiringResearch?.recruitmentActivity, 2)
  },
  pocResearch: crmOnly ? { roleClassification: context.pointOfContact?.roleClassification } : {
    ...context.pocResearch,
    decisionMakerEvidence: limitEvidence(context.pocResearch?.decisionMakerEvidence, 2),
    hiringActivityEvidence: limitEvidence(context.pocResearch?.hiringActivityEvidence, 2)
  }
});

const unique = values => [...new Set(values.filter(Boolean))];
const evidenceText = items => (Array.isArray(items) ? items : [])
  .map(item => `${item.title || ''} ${item.snippet || ''}`.trim()).join(' ');
const extractMatches = (text, values) => values.filter(value => new RegExp(`\\b${value.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text));

const JOB_TITLES = [
  'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Full Stack Engineer', 'Software Developer', 'Software Engineer',
  'Customer Success Manager', 'Customer Success Executive', 'Business Development Manager', 'Business Development Executive',
  'Talent Acquisition Manager', 'HR Recruiter', 'HR Manager', 'HR Executive', 'Sales Manager', 'Sales Executive',
  'Marketing Manager', 'Marketing Executive', 'Operations Manager', 'Operations Executive', 'Finance Manager', 'Finance Analyst',
  'Data Analyst', 'Business Analyst', 'Product Designer', 'Developer', 'Engineer', 'Recruiter', 'Manager', 'Executive',
  'Associate', 'Analyst', 'Designer', 'Sales', 'Marketing', 'Operations', 'Finance', 'Customer Success', 'Business Development'
];
const JOB_LOCATIONS = ['Bengaluru', 'Bangalore', 'Mumbai', 'Delhi', 'New Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Gurugram', 'Gurgaon', 'Noida', 'Ahmedabad', 'Remote', 'Hybrid'];

const departmentForTitle = title => {
  if (/(developer|engineer)/i.test(title)) return 'Engineering';
  if (/(recruiter|\bhr\b|talent acquisition)/i.test(title)) return 'Human Resources / Talent Acquisition';
  if (/sales|business development/i.test(title)) return 'Sales / Business Development';
  if (/marketing/i.test(title)) return 'Marketing';
  if (/operations/i.test(title)) return 'Operations';
  if (/finance/i.test(title)) return 'Finance';
  if (/customer success/i.test(title)) return 'Customer Success';
  if (/designer/i.test(title)) return 'Design';
  return '';
};

const extractLinkedInTitles = text => {
  const candidates = [];
  const patterns = [
    /\bhiring\s+(?:for\s+)?(?:an?\s+)?([^|,.]{3,100}?)(?:\s+in\s+[A-Z][^|,.]{1,80}|\s+at\s+[^|,.]{2,80}|[|,.]|$)/gi,
    /\b(?:open role|job opening)\s+(?:for\s+)?(?:an?\s+)?([^|,.]{3,100}?)(?:\s+in\s+[A-Z][^|,.]{1,80}|[|,.]|$)/gi
  ];
  for (const pattern of patterns) {
    for (const match of String(text || '').matchAll(pattern)) {
      const title = match[1].replace(/\s+/g, ' ').replace(/\s+(?:is|are|with|who)\b.*$/i, '').trim();
      if (title.length >= 3 && title.length <= 100 && !/^(jobs?|candidates?|people|talent|multiple roles?)$/i.test(title)) candidates.push(title);
    }
  }
  return unique(candidates);
};

const extractDetectedJobs = (evidence, poc = {}, extractionDiagnostics = {}) => {
  extractionDiagnostics.rejectedReasons = extractionDiagnostics.rejectedReasons || [];
  const pools = [
    ['pocHiringActivity', evidence.pocHiringActivity], ['currentOpenings', evidence.currentOpenings],
    ['linkedinHiringEvidence', evidence.linkedinHiringEvidence || evidence.linkedInJobs], ['careerPage', evidence.careerPage],
    ['jobTitlesHiring', evidence.jobTitlesHiring], ['jobBoardEvidence', evidence.jobBoardEvidence], ['atsEvidence', evidence.atsEvidence],
    ['structuredJobs', evidence.structuredJobs]
  ];
  const jobs = [];
  for (const [category, items] of pools) {
    for (const item of (items || [])) {
      const text = `${item.title || ''} ${item.snippet || ''}`;
      const inherentlyJobSpecific = ['currentOpenings', 'linkedinHiringEvidence', 'careerPage', 'jobBoardEvidence', 'atsEvidence', 'structuredJobs'].includes(category);
      if (!inherentlyJobSpecific && !/(hiring|we are hiring|looking for|open roles?|job openings?|vacanc|join our team)/i.test(text)) {
        extractionDiagnostics.rejectedReasons.push({ url: item.url, reason: 'No explicit hiring cue in evidence.' });
        continue;
      }
      const isLinkedInJobs = category === 'linkedinHiringEvidence' || /linkedin\.com\/jobs/i.test(item.url || '');
      const allMatches = category === 'structuredJobs' && item.title ? [String(item.title).trim()]
        : unique([...extractMatches(text, JOB_TITLES), ...(isLinkedInJobs ? extractLinkedInTitles(text) : [])]);
      const titles = allMatches.filter(title => !allMatches.some(other => other !== title && other.toLowerCase().includes(title.toLowerCase())));
      if (!titles.length) extractionDiagnostics.rejectedReasons.push({ url: item.url, reason: 'No defensible job title found in result title/snippet.' });
      const location = item.location || extractMatches(text, JOB_LOCATIONS)[0] || '';
      for (const title of titles) {
        const url = String(item.url || '');
        const hostname = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
        const boardName = hostname.includes('naukri') ? 'Naukri' : hostname.includes('indeed') ? 'Indeed'
          : hostname.includes('instahyre') ? 'Instahyre' : hostname.includes('wellfound') ? 'Wellfound'
            : hostname.includes('greenhouse') ? 'Greenhouse' : hostname.includes('lever.co') ? 'Lever'
              : hostname.includes('ashbyhq') ? 'Ashby' : hostname.includes('workday') ? 'Workday' : '';
        const source = category === 'pocHiringActivity' && /linkedin\.com/i.test(url) ? 'POC LinkedIn'
          : category === 'linkedinHiringEvidence' || /linkedin\.com\/jobs/i.test(url) ? 'LinkedIn Jobs'
            : item.sourceType === 'company_website' || category === 'careerPage' ? 'Company Careers' : boardName || 'Public Search';
        const pocClearlyNamed = Boolean(poc.name && new RegExp(poc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
        const association = category === 'pocHiringActivity' && pocClearlyNamed ? 'poc-specific' : 'company-level';
        jobs.push({ title, location, department: departmentForTitle(title), source, evidenceUrl: url,
          evidenceText: String(item.snippet || item.title || '').slice(0, 500), sourceType: isLinkedInJobs ? 'linkedin-search' : item.sourceType || category,
          confidence: category === 'structuredJobs' ? 'high' : source === 'LinkedIn Jobs' ? 'medium' : source === 'Company Careers' ? 'high' : association === 'poc-specific' ? 'medium' : 'low',
          detectedAt: new Date().toISOString(), association });
      }
    }
  }
  return [...new Map(jobs.map(job => [`${job.title.toLowerCase()}|${job.location.toLowerCase()}`, job])).values()].slice(0, 5);
};
const buildHiringSummary = context => {
  const hiring = context.hiringResearch || {};
  const pocEvidence = context.pocResearch?.hiringActivityEvidence || [];
  const openingEvidence = [
    ...(hiring.currentOpenings || []), ...(hiring.jobTitlesHiring || []),
    ...(hiring.linkedinHiringEvidence || []), ...(hiring.careerPage || [])
  ];
  const text = evidenceText(openingEvidence);
  const matchedRoles = unique(extractMatches(text, JOB_TITLES));
  const roleTitles = matchedRoles.filter(role =>
    !matchedRoles.some(other => other !== role && other.toLowerCase().includes(role.toLowerCase()))
  );
  const departments = unique(extractMatches(text, [
    'Engineering', 'Sales', 'Human Resources', 'HR', 'Marketing', 'Operations', 'Finance', 'Recruitment'
  ]));
  const locations = unique(extractMatches(text, JOB_LOCATIONS));
  const verifiedCount = text.match(/\b(\d{1,4})\s+(?:openings?|open roles?|vacancies|positions?|jobs?)\b/i);
  const openingsCount = context.crmData?.noOfPositions ?? (verifiedCount ? Number(verifiedCount[1]) : null);
  const role = context.pointOfContact?.roleClassification || context.pocResearch?.roleClassification || {};
  const pocName = context.pointOfContact?.name || 'The selected contact';
  const designation = context.pointOfContact?.designation;
  const pocContextBullets = [
    `${pocName}${designation ? `, ${designation}` : ''}${role.department ? `, appears connected with ${role.department}` : ''}${role.classificationBasis ? ` based on ${role.classificationBasis.toLowerCase()}` : ''}.`,
    pocEvidence.length ? `Public search evidence contains hiring activity associated with ${pocName}.` : ''
  ].filter(Boolean);
  const companyOpeningBullets = openingEvidence.slice(0, 3).map(item =>
    `${item.title || 'Hiring evidence'}${item.sourceType === 'company_website' ? ' (company website)' : item.sourceType === 'linkedin_search_result' ? ' (LinkedIn search evidence)' : ' (public search evidence)'}.`
  );
  const evidenceStrength = pocEvidence.length && openingEvidence.length ? 'strong'
    : openingEvidence.length >= 2 ? 'medium'
      : openingEvidence.length || (context.company?.hiringNeeds || []).length ? 'weak' : 'none';
  return {
    pocContextBullets,
    companyOpeningBullets,
    roleTitles,
    departments,
    locations,
    openingsCount,
    evidenceStrength,
    crmHiringNeeds: context.company?.hiringNeeds || [],
    sourceEvidence: limitEvidence([...pocEvidence, ...openingEvidence], 4)
  };
};

const applyResearchToContext = (context, publicResearch, jobDiscovery) => {
  context.pointOfContact.roleClassification = classifyPocRole({
    designation: context.pointOfContact.designation,
    department: context.pointOfContact.department,
    linkedInUrl: context.pointOfContact.linkedInUrl,
    publicResearch
  });

  const evidence = publicResearch.evidenceByCategory || {};
  context.companyResearch = {
    overview: evidence.companyOverview || [],
    expansion: evidence.expansion || [],
    funding: evidence.funding || [],
    growth: evidence.growth || [],
    recentNews: evidence.recentNews || [],
    linkedIn: evidence.companyLinkedIn || []
  };
  context.hiringResearch = {
    currentOpenings: evidence.currentOpenings || [],
    jobTitlesHiring: evidence.jobTitlesHiring || [],
    hiringTrends: evidence.hiringTrends || [],
    careerPage: evidence.careerPage || [],
    locationsHiring: evidence.locationsHiring || [],
    departmentsHiring: evidence.departmentsHiring || [],
    recruitmentActivity: evidence.recruitmentActivity || [],
    linkedInJobs: evidence.linkedinHiringEvidence || evidence.linkedInJobs || [],
    linkedinHiringEvidence: evidence.linkedinHiringEvidence || evidence.linkedInJobs || []
  };
  context.pocResearch = {
    linkedInUrl: context.pointOfContact.linkedInUrl,
    decisionMakerEvidence: evidence.decisionMakers || [],
    hiringActivityEvidence: evidence.pocHiringActivity || [],
    roleClassification: context.pointOfContact.roleClassification
  };
  const extractionDiagnostics = {};
  context.detectedJobs = (jobDiscovery?.websiteJobs || []).map(job => ({
    title: job.title, location: job.location, department: job.department, source: job.source,
    evidenceUrl: job.applyUrl, evidenceText: job.evidenceText, sourceType: job.sourceType,
    confidence: job.confidence, detectedAt: new Date().toISOString(), association: 'company-level'
  }));
  context.industryDefaultJobs = jobDiscovery?.industryDefaultJobs || [];
  context.jobDiscovery = jobDiscovery;
  context.currentJobs = context.detectedJobs;
  context.hiringSummary = buildHiringSummary(context);
  context.enrichment = buildCompanyHiringEnrichment({ context, publicResearch });
  context.enrichment.diagnostics = {
    ...(context.enrichment.diagnostics || {}),
    jobsFound: context.detectedJobs.length,
    pocSignalsFound: context.detectedJobs.filter(job => job.association === 'poc-specific').length,
    extractedJobs: context.detectedJobs,
    rejectedReasons: [...(context.enrichment.diagnostics?.rejectedReasons || []), ...(extractionDiagnostics.rejectedReasons || [])]
  };
  console.info('[ENRICHMENT EXTRACTED JOBS]', context.detectedJobs);
  console.info('[ENRICHMENT REJECTED]', context.enrichment.diagnostics.rejectedReasons);
};

const applySelectedPocIdentity = (content, context) => {
  const pocName = String(context.pointOfContact?.name || '').trim();
  const firstName = pocName.split(/\s+/)[0];
  const senderName = String(context.sender?.name || '').trim();
  const detectedJobs = context.detectedJobs || [];
  const industryDefaults = context.industryDefaultJobs || [];
  const displayJobs = detectedJobs.length ? detectedJobs : industryDefaults;
  const fallbackSource = context.jobDiscovery?.jobResearchSource;
  const fallbackSourceLabel = fallbackSource === 'saved_industry_fallback'
    ? `saved industry profile${context.jobDiscovery?.savedIndustryName ? ` (${context.jobDiscovery.savedIndustryName})` : ''}`
    : fallbackSource === 'saved_hiring_needs_fallback'
      ? 'saved hiring needs'
      : 'company profile inference';
  const openingBullets = detectedJobs.length ? detectedJobs.map(job => {
    const sourceContext = job.source === 'POC LinkedIn' ? 'POC LinkedIn — from your recent LinkedIn hiring activity'
      : job.source === 'Company Careers' ? 'Company Careers — from your careers page'
        : job.source === 'LinkedIn Jobs' ? 'LinkedIn Jobs — from LinkedIn jobs evidence' : 'Public Search';
    return `• ${job.title}${job.location || job.department ? ` — ${job.location || job.department}` : ''} — ${sourceContext}`;
  }) : industryDefaults.length ? industryDefaults.map(job => `• ${job.title} — common role based on ${fallbackSourceLabel}, not presented as an active opening`)
    : ['• Jobs Territory can support relevant hiring needs as they are identified.'];
  const helpBullets = displayJobs.length ? [
    '• We can share pre-vetted candidates matching these roles.',
    '• We can help reduce screening time.',
    '• We can support urgent or bulk hiring needs.',
    '• We can help with replacement/backfill support.'
  ] : [
    '• We can provide flexible sourcing and screening support as verified hiring needs arise.',
    '• We can help reduce screening time without assuming active openings.'
  ];
  return {
    ...content,
    greeting: firstName ? `Hi ${firstName},` : content.greeting,
    contextLine: detectedJobs.length
      ? `Current roles found on your company website:\n${openingBullets.slice(0, 4).join('\n')}`
      : industryDefaults.length
        ? fallbackSource === 'saved_industry_fallback'
          ? `Based on your company's saved industry profile, companies in your sector commonly hire for roles such as:\n${openingBullets.slice(0, 5).join('\n')}`
          : fallbackSource === 'saved_hiring_needs_fallback'
            ? `Based on your saved hiring needs, similar companies commonly hire for roles such as:\n${openingBullets.slice(0, 5).join('\n')}`
            : `Based on your company profile, Jobs Territory can support roles such as:\n${openingBullets.slice(0, 5).join('\n')}`
        : `Hiring support context:\n${openingBullets.join('\n')}`,
    pitchLine: `How Jobs Territory can help:\n${helpBullets.join('\n')}`,
    senderName: senderName ? `${senderName} — Jobs Territory` : 'Business Development Team — Jobs Territory'
  };
};

const renderEmailDraft = ({ content, context, resources }) => ({
  htmlBody: buildAiPersonalizedEmailHtml({
    content,
    company: context.company,
    pointOfContact: context.pointOfContact,
    resources
  }),
  plainText: buildAiPersonalizedPlainText({
    content,
    company: context.company,
    pointOfContact: context.pointOfContact,
    resources
  })
});

const buildFallbackEmail = ({ context, resources, reason }) => {
  const companyName = context.company?.name || 'your company';
  const pocName = context.pointOfContact?.name || '';
  const firstName = pocName.split(/\s+/)[0] || 'there';
  const designation = context.pointOfContact?.designation;
  const roles = [...(context.detectedJobs || []), ...(context.industryDefaultJobs || [])].map(job => job.title).slice(0, 5);
  const content = applySelectedPocIdentity({
    greeting: `Hi ${firstName},`,
    openingLine: designation
      ? `Given your role as ${designation} at ${companyName}, I wanted to share where Jobs Territory could support your team.`
      : `I wanted to share where Jobs Territory could support ${companyName}.`,
    contextLine: '',
    companyBlurb: context.detectedJobs?.length
      ? `Company website hiring evidence includes ${roles.join(', ')} roles.`
      : roles.length
        ? `Based on the ${context.company?.industry || 'company'} industry, companies like this commonly hire for roles such as ${roles.join(', ')}.`
      : `I couldn’t verify specific active openings, so I’m reaching out without assuming a current vacancy.`,
    pitchLine: '',
    bullets: ['Pre-vetted candidate sourcing', 'Focused screening and shortlisting', 'Flexible support for urgent or bulk requirements', 'Replacement and backfill support'],
    closingLine: 'You can review our case studies and client testimonials below.',
    ctaLine: 'Would a short conversation about your current or upcoming hiring priorities be useful?',
    senderName: context.sender?.name ? `${context.sender.name} — Jobs Territory` : 'Business Development Team — Jobs Territory'
  }, context);
  const draft = {
    subject: `${companyName} hiring support — Jobs Territory`,
    content,
    research: {
      companySummary: context.company?.companyInfo || `${companyName}${context.company?.industry ? ` operates in ${context.company.industry}` : ''}.`,
      contactContext: [pocName, designation].filter(Boolean).join(', '),
      publicResearchSummary: roles.length ? `Evidence-derived roles: ${roles.join(', ')}.` : 'No specific active openings were verified.',
      personalizationPoints: [designation, ...roles].filter(Boolean),
      dataGaps: [`AI provider unavailable (${reason}); deterministic CRM/research fallback used.`]
    }
  };
  return { ...draft, ...renderEmailDraft({ content, context, resources }), enrichment: context.enrichment, jobDiscovery: context.jobDiscovery,
    diagnostics: context.enrichment?.diagnostics || {}, fallback: true, fallbackReason: reason };
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const generatePersonalizedEmail = async ({ context, resources, signal, leadId, pocId, refreshResearch = false }) => {
  let publicResearch;
  try {
    publicResearch = await getCompanyHiringResearch({ context, leadId, pocId, refreshResearch });
  } catch (error) {
    console.warn('Public company research failed', { leadId, message: error.message });
    publicResearch = unavailableResearch();
  }

  const jobDiscovery = await discoverCompanyJobs({
    companyName: context.company?.name, websiteUrl: context.company?.website, industry: context.company?.industry,
    hiringNeeds: context.company?.hiringNeeds || context.crmData?.hiringNeeds || [],
    linkedinUrl: context.company?.linkedInUrl, pocName: context.pointOfContact?.name,
    pocLinkedinUrl: context.pointOfContact?.linkedInUrl
  }, { publicResearch });
  applyResearchToContext(context, publicResearch, jobDiscovery);
  console.info('[AI ENRICHMENT]', {
    companySearched: context.company?.name || context.company?.website || null,
    pocSearched: context.pointOfContact?.name || context.pointOfContact?.email || null,
    sourcesFound: (publicResearch.sources || []).length,
    hiringRolesFound: (context.detectedJobs || []).map(job => job.title),
    enrichment: context.enrichment
  });
  console.info('AI email hiring evidence', {
    leadId,
    poc: context.pointOfContact?.name || context.pointOfContact?.email || 'unknown',
    crmHiringNeeds: context.company?.hiringNeeds || [],
    crmPositions: context.company?.numberOfPositions,
    currentOpenings: context.hiringResearch?.currentOpenings?.length || 0,
    linkedInJobs: context.hiringResearch?.linkedInJobs?.length || 0,
    pocHiringActivity: context.pocResearch?.hiringActivityEvidence?.length || 0,
    detectedJobs: context.detectedJobs,
    hiringSummary: context.hiringSummary,
    researchStatus: publicResearch.status
  });
  let generated;
  let retry = false;
  try {
    generated = await generateAiEmail({ context: compactModelContext(context), signal });
  } catch (error) {
    if (error.code === 'AI_PROVIDER_BUSY') {
      retry = true;
      console.warn('[AI] Provider busy; retrying once after 2 seconds', { leadId });
      await wait(2_000);
      try {
        generated = await generateAiEmail({ context: compactModelContext(context) });
      } catch (retryError) {
        if (!['AI_PROVIDER_BUSY', 'AI_RATE_LIMIT', 'AI_TIMEOUT'].includes(retryError.code) && retryError.name !== 'AbortError') throw retryError;
        return { ...buildFallbackEmail({ context, resources, reason: retryError.code }), retry };
      }
    } else if (['AI_RATE_LIMIT', 'AI_TIMEOUT', 'AI_PROVIDER_ERROR'].includes(error.code) || error.name === 'AbortError' || error.code === 20) {
      return { ...buildFallbackEmail({ context, resources, reason: error.code || error.name }), retry };
    } else {
      throw error;
    }
  }
  generated.content = applySelectedPocIdentity(generated.content, context);

  return {
    ...generated,
    retry,
    enrichment: context.enrichment,
    jobDiscovery: context.jobDiscovery,
    diagnostics: context.enrichment?.diagnostics || {},
    ...renderEmailDraft({ content: generated.content, context, resources }),
    research: {
      ...generated.research,
      publicResearchStatus: publicResearch.status,
      sources: (publicResearch.sources || []).map(({ title, url, snippet, sourceType }) => ({
        title,
        url,
        snippet,
        sourceType
      }))
    }
  };
};

module.exports = {
  applyResearchToContext,
  applySelectedPocIdentity,
  compactModelContext,
  limitEvidence,
  buildHiringSummary,
  extractDetectedJobs,
  buildFallbackEmail,
  generatePersonalizedEmail,
  renderEmailDraft
};
