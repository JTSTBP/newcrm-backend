const clean = (value, max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const crypto = require('crypto');
const HiringEnrichmentCache = require('../../models/HiringEnrichmentCache');
const { researchCompanyPublicly } = require('../../utils/publicCompanyResearch');
const ENRICHMENT_CACHE_TTL_MS = Number(process.env.ENRICHMENT_CACHE_TTL_MS || 30 * 60_000);

const findEvidence = (sources, url) => (sources || []).find(source => source.url === url);

function buildCompanyHiringEnrichment({ context, publicResearch }) {
  const company = context.company || {};
  const poc = context.pointOfContact || {};
  const jobs = Array.isArray(context.detectedJobs) ? context.detectedJobs : [];
  const sources = publicResearch?.sources || [];
  const overview = context.companyResearch?.overview?.[0];
  const companySummary = clean(
    company.companyInfo || overview?.snippet ||
    [company.name, company.industry && `${company.industry} industry`, company.companySize && `${company.companySize} employees`]
      .filter(Boolean).join(' — '),
    900
  );

  const companyHiring = jobs.slice(0, 5).map(job => {
    const evidence = findEvidence(sources, job.evidenceUrl);
    return {
      title: clean(job.title, 140),
      location: clean(job.location, 100),
      department: clean(job.department, 120),
      source: clean(job.source, 80),
      url: clean(job.evidenceUrl, 1000),
      evidenceText: clean(job.evidenceText || evidence?.snippet || evidence?.title, 500),
      sourceType: clean(job.sourceType || evidence?.sourceType || job.source, 100),
      confidence: job.confidence,
      detectedAt: job.detectedAt || new Date().toISOString(),
      association: job.association === 'poc-specific' ? 'poc-specific' : 'company-level'
    };
  });

  const role = poc.roleClassification || context.pocResearch?.roleClassification || {};
  const recentHiringSignals = (context.pocResearch?.hiringActivityEvidence || []).slice(0, 3).map(item => ({
    source: /linkedin\.com/i.test(item.url || '') ? 'Google-indexed LinkedIn evidence' : 'Public search',
    url: clean(item.url, 1000),
    evidence: clean(item.snippet || item.title, 500)
  }));
  const likelyResponsibility = role.department
    ? `${role.department} responsibility inferred from ${role.classificationBasis || 'the CRM designation'}`
    : poc.designation ? `Responsibility inferred cautiously from the designation “${clean(poc.designation, 120)}”` : '';

  const dataGaps = [];
  if (!companyHiring.length) dataGaps.push('No specific active job opening was verified from available public evidence.');
  if (!recentHiringSignals.length) dataGaps.push('No POC-specific recent hiring activity was verified.');
  if (!company.website) dataGaps.push('Company website is unavailable in CRM.');
  if (!poc.linkedInUrl) dataGaps.push('POC LinkedIn URL is unavailable in CRM.');
  if (publicResearch?.status !== 'completed') dataGaps.push('Public search was unavailable or returned no usable evidence; CRM-only personalization is required.');
  if ((publicResearch?.errors || []).some(error => /Custom Search is not configured/i.test(error))) {
    dataGaps.push('Google Custom Search API key/CX is not configured; company website and CRM fallback context were used.');
  }

  return {
    companySummary,
    companyHiring,
    websiteJobs: context.jobDiscovery?.websiteJobs || [],
    publicJobs: context.jobDiscovery?.publicJobs || [],
    industryDefaultJobs: context.jobDiscovery?.industryDefaultJobs || [],
    savedIndustryName: context.jobDiscovery?.savedIndustryName || clean(company.industry, 160),
    savedHiringNeeds: context.jobDiscovery?.savedHiringNeeds || (company.hiringNeeds || []).map(value => clean(value, 160)).filter(Boolean),
    industryIntroduction: context.jobDiscovery?.industryIntroduction || '',
    jobResearchSource: context.jobDiscovery?.jobResearchSource || null,
    pocContext: {
      name: clean(poc.name, 120),
      designation: clean(poc.designation, 120),
      email: clean(poc.email, 200),
      linkedinUrl: clean(poc.linkedInUrl, 1000),
      likelyResponsibility,
      recentHiringSignals
    },
    crmHiringContext: {
      industry: clean(company.industry, 160),
      hiringNeeds: (company.hiringNeeds || []).map(value => clean(value, 160)).filter(Boolean).slice(0, 10),
      numberOfPositions: Number.isFinite(company.numberOfPositions) ? company.numberOfPositions : null
    },
    dataGaps: [...dataGaps, ...(context.jobDiscovery?.dataGaps || [])],
    diagnostics: publicResearch?.diagnostics || {}
  };
}

async function getCompanyHiringResearch({ context, leadId, pocId, refreshResearch = false }) {
  const cacheKey = crypto.createHash('sha256').update(JSON.stringify({
    leadId: String(leadId), pocId: String(pocId), company: context.company?.name,
    website: context.company?.website, pocLinkedIn: context.pointOfContact?.linkedInUrl
  })).digest('hex');
  if (!refreshResearch) {
    const cached = await HiringEnrichmentCache.findOne({ cacheKey, expiresAt: { $gt: new Date() } }).lean();
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.updatedAt || cached.createdAt).getTime();
      return { ...cached.research, diagnostics: { ...(cached.research.diagnostics || {}), cacheAge, cached: true, cacheUsed: true } };
    }
  }
  const research = await researchCompanyPublicly(context);
  research.diagnostics = { ...(research.diagnostics || {}), cacheAge: 0, cached: false, cacheUsed: false };
  await HiringEnrichmentCache.findOneAndUpdate(
    { cacheKey },
    { leadId, pocId, research, expiresAt: new Date(Date.now() + ENRICHMENT_CACHE_TTL_MS) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return research;
}

module.exports = { buildCompanyHiringEnrichment, getCompanyHiringResearch };
