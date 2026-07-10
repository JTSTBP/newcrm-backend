const dns = require('dns').promises;
const net = require('net');

const MAX_PAGE_BYTES = 300_000;
const REQUEST_TIMEOUT_MS = 7_000;
const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;
const CAREER_LINK_PATTERN = /(career|jobs?|hiring|openings?|vacanc|join[- ]?(?:us|our[- ]?team)|work[- ]?with[- ]?us)/i;
const ATS_HOSTS = {
  'boards.greenhouse.io': 'Greenhouse', 'job-boards.greenhouse.io': 'Greenhouse',
  'jobs.lever.co': 'Lever', 'jobs.ashbyhq.com': 'Ashby', 'myworkdayjobs.com': 'Workday'
};

const isPrivateIp = (address) => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const value = address.toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fc') ||
    value.startsWith('fd') || value.startsWith('fe80:') || value.startsWith('::ffff:127.');
};

const validatePublicUrl = async (rawUrl) => {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Unsupported website URL.');
  }
  if (LINKEDIN_HOST.test(url.hostname)) {
    throw new Error('Direct LinkedIn requests are not allowed.');
  }
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('Website URL does not resolve to a public address.');
  }
  return url;
};

const htmlToText = (html) => String(html || '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

const isTemplateOrAssetUrl = (rawUrl) => {
  const value = String(rawUrl || '');
  if (!value || /(\{\{|%7B%7B|<%|%3C%25|javascript:|mailto:|tel:|#)/i.test(value)) return true;
  try {
    const url = new URL(value);
    return /\.(png|jpe?g|gif|webp|svg|pdf|zip|css|js|ico)([?#].*)?$/i.test(url.pathname);
  } catch {
    return true;
  }
};

const isExpectedCareerProbe404 = (error) => /Website returned 404/i.test(String(error?.message || error));

const fetchPublicPage = async (rawUrl, redirectCount = 0) => {
  if (redirectCount > 3) throw new Error('Too many website redirects.');
  const url = await validatePublicUrl(rawUrl);
  const response = await fetch(url, {
    redirect: 'manual',
    headers: { 'User-Agent': 'JobsTerritoryCRM/1.0 (+public company research)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Website redirect has no location.');
    return fetchPublicPage(new URL(location, url).toString(), redirectCount + 1);
  }
  if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) {
    throw new Error(`Website returned ${response.status}.`);
  }
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_PAGE_BYTES) throw new Error('Website page is too large.');
  const html = (await response.text()).slice(0, MAX_PAGE_BYTES);
  return { url: url.toString(), html, text: htmlToText(html).slice(0, 20_000) };
};

const fetchPublicText = async rawUrl => {
  const url = await validatePublicUrl(rawUrl);
  const response = await fetch(url, { headers: { 'User-Agent': 'JobsTerritoryCRM/1.0 (+public company research)' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Public resource returned ${response.status}.`);
  return (await response.text()).slice(0, MAX_PAGE_BYTES);
};

const fetchPublicJson = async rawUrl => JSON.parse(await fetchPublicText(rawUrl));

const fetchAtsJobs = async (rawUrl, provider) => {
  const url = new URL(rawUrl);
  const board = url.pathname.split('/').filter(Boolean)[0];
  if (!board) return [];
  let data;
  if (provider === 'Greenhouse') {
    data = await fetchPublicJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
    return (data.jobs || []).map(job => ({ title: job.title, location: job.location?.name || '', url: job.absolute_url, postedDate: job.updated_at || null,
      snippet: htmlToText(job.content || '').slice(0, 1000), sourceType: 'greenhouse_ats', category: 'structuredJobs' }));
  }
  if (provider === 'Lever') {
    data = await fetchPublicJson(`https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`);
    return (data || []).map(job => ({ title: job.text, location: job.categories?.location || '', url: job.hostedUrl, postedDate: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      snippet: htmlToText(job.descriptionPlain || job.description || '').slice(0, 1000), sourceType: 'lever_ats', category: 'structuredJobs' }));
  }
  if (provider === 'Ashby') {
    data = await fetchPublicJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`);
    return (data.jobs || []).map(job => ({ title: job.title, location: job.location || (job.isRemote ? 'Remote' : ''), url: job.jobUrl || rawUrl, postedDate: job.publishedAt || null,
      snippet: htmlToText(job.descriptionPlain || job.descriptionHtml || '').slice(0, 1000), sourceType: 'ashby_ats', category: 'structuredJobs' }));
  }
  return [];
};

const extractLinks = (html, baseUrl) => {
  const links = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(String(html || ''))) && links.length < 100) {
    try {
      const url = new URL(match[1], baseUrl).toString();
      if (isTemplateOrAssetUrl(url)) continue;
      const label = htmlToText(match[2]);
      if (CAREER_LINK_PATTERN.test(`${label} ${url}`)) links.push(url);
    } catch {}
  }
  return [...new Set(links)];
};

const extractSitemapUrls = xml => [...String(xml || '').matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
  .map(match => match[1].trim()).filter(url => CAREER_LINK_PATTERN.test(url)).slice(0, 30);

const atsProviderForUrl = rawUrl => {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return Object.entries(ATS_HOSTS).find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`))?.[1] || '';
  } catch { return ''; }
};

const extractJobPostings = (html, pageUrl, sourceType) => {
  const jobs = [];
  const scripts = [...String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (value['@graph']) visit(value['@graph']);
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.includes('JobPosting') && value.title) {
      const address = value.jobLocation?.address || value.jobLocation?.[0]?.address || {};
      const location = value.jobLocationType === 'TELECOMMUTE' ? 'Remote'
        : [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(', ');
      jobs.push({ title: String(value.title).slice(0, 200), location: String(location || '').slice(0, 160),
        url: String(value.url || pageUrl).slice(0, 1000), postedDate: value.datePosted || null,
        snippet: htmlToText(value.description || '').slice(0, 1000), sourceType, category: 'structuredJobs' });
    }
  };
  for (const script of scripts) { try { visit(JSON.parse(script[1])); } catch {} }
  return jobs.slice(0, 50);
};

const getSearchConfiguration = () => ({
  apiKey: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || process.env.GOOGLE_SEARCH_API_KEY || '',
  searchEngineId: process.env.GOOGLE_CUSTOM_SEARCH_CX || process.env.GOOGLE_SEARCH_CX || ''
});

const googleSearch = async ({ query, category, dateRestrict }) => {
  const { apiKey, searchEngineId } = getSearchConfiguration();
  if (!apiKey || !searchEngineId) return [];
  const params = new URLSearchParams({ key: apiKey, cx: searchEngineId, q: query, num: '5', safe: 'active' });
  if (dateRestrict) params.set('dateRestrict', dateRestrict);
  console.info('[ENRICHMENT QUERY START]', { query, category, dateRestrict: dateRestrict || null });
  const response = await fetch(`https://customsearch.googleapis.com/customsearch/v1?${params}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Google Custom Search returned ${response.status}: ${body.slice(0, 500)}`);
    error.query = query;
    error.category = category;
    error.httpStatus = response.status;
    console.warn('[ENRICHMENT QUERY FAILED]', { query, category, status: response.status, message: error.message });
    throw error;
  }
  const data = await response.json();
  const results = (data.items || []).filter(item => item.link).map(item => {
    const hostname = (() => { try { return new URL(item.link).hostname; } catch { return ''; } })();
    return {
      title: String(item.title || '').slice(0, 200),
      url: String(item.link).slice(0, 1000),
      snippet: String(item.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      sourceType: LINKEDIN_HOST.test(hostname) ? 'linkedin_search_result' : category === 'recentNews' ? 'public_news' : 'google_custom_search',
      category
    };
  });
  console.info('[ENRICHMENT QUERY]', { query, category, resultsFound: results.length });
  results.forEach(result => console.info('[ENRICHMENT RESULT]', {
    query, category, title: result.title, url: result.url, snippet: result.snippet
  }));
  return results;
};

const buildSearchPlans = (context) => {
  const company = context.company || {};
  const poc = context.pointOfContact || {};
  const companyName = company.name || company.website;
  if (!companyName) return [];
  const linkedInProfileSlug = (() => {
    try {
      if (!poc.linkedInUrl) return '';
      const url = new URL(poc.linkedInUrl);
      if (!LINKEDIN_HOST.test(url.hostname)) return '';
      const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]).replace(/[-_]+/g, ' ') : '';
    } catch { return ''; }
  })();
  const websiteDomain = (() => {
    try { return company.website ? new URL(company.website).hostname.replace(/^www\./, '') : ''; }
    catch { return ''; }
  })();
  const plans = [
    { category: 'companyOverview', query: `"${companyName}" company overview industry` },
    { category: 'careerPage', query: `"${companyName}" careers jobs` },
    { category: 'currentOpenings', query: `"${companyName}" "current openings"`, dateRestrict: 'm6' },
    { category: 'jobTitlesHiring', query: `"${companyName}" (jobs OR hiring) ("Frontend Developer" OR "Backend Developer" OR Engineer OR Sales OR Recruiter OR HR OR Manager OR Executive OR Associate OR Analyst OR Designer OR Marketing OR Operations)`, dateRestrict: 'm6' },
    { category: 'linkedinHiringEvidence', query: `site:linkedin.com/jobs "${companyName}"`, dateRestrict: 'm6' },
    { category: 'linkedinHiringEvidence', query: `site:linkedin.com/jobs "${companyName}" hiring`, dateRestrict: 'm6' },
    { category: 'linkedinHiringEvidence', query: `site:linkedin.com/jobs "${companyName}" jobs`, dateRestrict: 'm6' },
    { category: 'linkedinHiringEvidence', query: `"${companyName}" "LinkedIn" "jobs"`, dateRestrict: 'm6' },
    { category: 'currentOpenings', query: `"${companyName}" "open roles"`, dateRestrict: 'm6' },
    { category: 'jobBoardEvidence', query: `"${companyName}" jobs (site:naukri.com OR site:indeed.com OR site:instahyre.com OR site:wellfound.com)`, dateRestrict: 'm6' },
    { category: 'atsEvidence', query: `"${companyName}" jobs (site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com)`, dateRestrict: 'm6' },
    { category: 'hiringTrends', query: `"${companyName}" (hiring OR hired OR recruitment OR workforce OR headcount)`, dateRestrict: 'y1' },
    { category: 'departmentsHiring', query: `"${companyName}" hiring (sales OR marketing OR operations OR human resources OR finance)` },
    { category: 'locationsHiring', query: `"${companyName}" jobs (location OR Bengaluru OR Bangalore OR Mumbai OR Delhi OR Hyderabad OR Pune OR remote)`, dateRestrict: 'y1' },
    { category: 'expansion', query: `"${companyName}" (expansion OR "new office" OR "new location" OR enters market)`, dateRestrict: 'y2' },
    { category: 'funding', query: `"${companyName}" (funding OR funded OR raised OR investment OR financing)`, dateRestrict: 'y2' },
    { category: 'growth', query: `"${companyName}" (growth OR growing OR headcount OR revenue growth)`, dateRestrict: 'y2' },
    { category: 'recruitmentActivity', query: `"${companyName}" (recruitment OR talent acquisition OR recruiter OR staffing)` },
    { category: 'recentNews', query: `"${companyName}" latest news`, dateRestrict: 'y1' }
  ];
  if (websiteDomain) {
    plans.push({ category: 'careerPage', query: `site:${websiteDomain} (careers OR jobs OR openings)` });
  }
  if (company.linkedInUrl) {
    plans.push({ category: 'companyLinkedIn', query: `"${company.linkedInUrl}" OR (site:linkedin.com/company "${companyName}")` });
  }
  if (poc.name || poc.linkedInUrl) {
    const identity = [poc.name, poc.designation, company.name].filter(Boolean).map(value => `"${value}"`).join(' ');
    plans.push({ category: 'decisionMakers', query: `${identity} ${poc.linkedInUrl ? `"${poc.linkedInUrl}"` : 'site:linkedin.com/in'}` });
    plans.push(
      { category: 'pocHiringActivity', query: `"${poc.name}" "${companyName}" hiring`, dateRestrict: 'y1' },
      { category: 'pocHiringActivity', query: `"${poc.name}" "${companyName}" "open roles"`, dateRestrict: 'y1' },
      { category: 'pocHiringActivity', query: `site:linkedin.com/posts "${poc.name}" "${companyName}" hiring`, dateRestrict: 'y1' },
      { category: 'pocHiringActivity', query: `site:linkedin.com/posts "${poc.name}" "${companyName}" "we are hiring"`, dateRestrict: 'y1' },
      { category: 'pocHiringActivity', query: `site:linkedin.com/posts "${poc.name}" "${companyName}" "looking for"`, dateRestrict: 'y1' },
      { category: 'pocHiringActivity', query: `site:linkedin.com/in "${poc.name}" "${companyName}" recruiter hiring`, dateRestrict: 'y1' },
      { category: 'linkedinHiringEvidence', query: `site:linkedin.com/jobs "${companyName}" "${poc.name}"`, dateRestrict: 'y1' }
    );
    if (poc.linkedInUrl) {
      plans.push(
        { category: 'pocHiringActivity', query: `"${poc.linkedInUrl}" hiring`, dateRestrict: 'y1' },
        { category: 'pocHiringActivity', query: `"${poc.linkedInUrl}" jobs`, dateRestrict: 'y1' },
        ...(linkedInProfileSlug ? [{ category: 'pocHiringActivity', query: `site:linkedin.com/posts "${linkedInProfileSlug}" "${companyName}" hiring`, dateRestrict: 'y1' }] : [])
      );
    }
  }
  return plans;
};

const groupEvidence = (sources) => sources.reduce((groups, source) => {
  const category = source.category || 'other';
  if (!groups[category]) groups[category] = [];
  if (groups[category].length < 20) {
    groups[category].push({ title: source.title, url: source.url, snippet: source.snippet, sourceType: source.sourceType,
      category: source.category, location: source.location || '', postedDate: source.postedDate || null });
  }
  return groups;
}, {});

async function researchCompanyPublicly(context) {
  const company = context.company || {};
  const poc = context.pointOfContact || {};
  if (!company.name && !company.website && !company.linkedInUrl && !poc.name && !poc.linkedInUrl) {
    return { status: 'skipped_insufficient_context', crmContext: context, sources: [], evidenceByCategory: {}, websiteExtracts: [], errors: [] };
  }

  const sources = [];
  const websiteExtracts = [];
  const errors = [];
  const diagnostics = { searchConfigured: false, queriesExecuted: [], careerUrlsChecked: [], atsDetected: [], jobsFound: 0, pocSignalsFound: 0, rejectedSources: [], cacheAge: 0 };
  const companyName = company.name || company.website || 'Company';

  if (company.website) {
    try {
      const origin = (await validatePublicUrl(company.website)).origin;
      const homepage = await fetchPublicPage(origin);
      sources.push({ title: `${companyName} website`, url: homepage.url, snippet: homepage.text.slice(0, 1000), sourceType: 'company_website', category: 'companyOverview' });
      let sitemapUrls = [];
      try { sitemapUrls = extractSitemapUrls(await fetchPublicText(`${origin}/sitemap.xml`)); }
      catch (error) { diagnostics.rejectedSources.push({ url: `${origin}/sitemap.xml`, reason: error.message }); }
      const fallbackPaths = ['/careers', '/career', '/jobs', '/join-us', '/work-with-us', '/openings', '/current-openings', '/vacancies', '/hiring'];
      const discoveredUrls = [...new Set([...extractLinks(homepage.html, homepage.url), ...sitemapUrls, ...fallbackPaths.map(path => `${origin}${path}`)])].slice(0, 20);
      const pagePlans = discoveredUrls.map(url => ({ url, category: /jobs?|openings?/i.test(url) ? 'currentOpenings' : 'careerPage', title: `${companyName} careers` }));
      diagnostics.careerUrlsChecked.push(...discoveredUrls);
      diagnostics.atsDetected.push(...[...new Set(discoveredUrls.map(atsProviderForUrl).filter(Boolean))]);
      const atsSettled = await Promise.allSettled(discoveredUrls.map(async url => {
        const provider = atsProviderForUrl(url);
        return provider ? fetchAtsJobs(url, provider) : [];
      }));
      atsSettled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          sources.push(...result.value);
          diagnostics.jobsFound += result.value.length;
        } else {
          diagnostics.rejectedSources.push({ url: discoveredUrls[index], reason: `ATS extraction failed: ${result.reason.message}` });
        }
      });
      const settled = await Promise.allSettled(pagePlans.map(plan => fetchPublicPage(plan.url)));
      settled.forEach((result, index) => {
        if (result.status !== 'fulfilled' || !result.value.text) {
          if (!isExpectedCareerProbe404(result.reason)) {
            diagnostics.rejectedSources.push({ url: pagePlans[index].url, reason: result.reason?.message || 'No readable text' });
          }
          return;
        }
        const plan = pagePlans[index];
        const extract = { url: result.value.url, text: result.value.text.slice(0, 5000), category: plan.category };
        websiteExtracts.push(extract);
        const provider = atsProviderForUrl(result.value.url);
        const sourceType = provider ? `${provider.toLowerCase()}_ats` : 'company_website';
        sources.push({ title: plan.title, url: result.value.url, snippet: extract.text.slice(0, 2500), sourceType, category: plan.category });
        const structuredJobs = extractJobPostings(result.value.html, result.value.url, sourceType);
        sources.push(...structuredJobs);
        diagnostics.jobsFound += structuredJobs.length;
        if (provider && !diagnostics.atsDetected.includes(provider)) diagnostics.atsDetected.push(provider);
        if (['careerPage', 'currentOpenings'].includes(plan.category) && /(developer|engineer|sales|recruiter|human resources|\bhr\b|manager|executive|associate|analyst|designer|marketing|operations)/i.test(extract.text)) {
          sources.push({ title: plan.title, url: result.value.url, snippet: extract.text.slice(0, 2500), sourceType, category: 'jobTitlesHiring' });
        }
      });
      const secondLevelUrls = [...new Set(settled.flatMap(result => result.status === 'fulfilled'
        ? extractLinks(result.value.html, result.value.url) : []).filter(url => !discoveredUrls.includes(url)))].slice(0, 10);
      if (secondLevelUrls.length) {
        diagnostics.careerUrlsChecked.push(...secondLevelUrls);
        const secondLevel = await Promise.allSettled(secondLevelUrls.map(url => fetchPublicPage(url)));
        secondLevel.forEach((result, index) => {
          if (result.status !== 'fulfilled' || !result.value.text) {
            if (!isExpectedCareerProbe404(result.reason)) {
              diagnostics.rejectedSources.push({ url: secondLevelUrls[index], reason: result.reason?.message || 'No readable text' });
            }
            return;
          }
          const provider = atsProviderForUrl(result.value.url);
          const sourceType = provider ? `${provider.toLowerCase()}_ats` : 'company_website';
          sources.push({ title: `${companyName} careers`, url: result.value.url, snippet: result.value.text.slice(0, 2500), sourceType, category: 'currentOpenings' });
          const structuredJobs = extractJobPostings(result.value.html, result.value.url, sourceType);
          sources.push(...structuredJobs);
          diagnostics.jobsFound += structuredJobs.length;
          if (provider && !diagnostics.atsDetected.includes(provider)) diagnostics.atsDetected.push(provider);
        });
      }
    } catch (error) {
      errors.push(`Company website unavailable: ${error.message}`);
    }
  }

  const searchConfig = getSearchConfiguration();
  diagnostics.searchConfigured = Boolean(searchConfig.apiKey && searchConfig.searchEngineId);
  if (searchConfig.apiKey && searchConfig.searchEngineId) {
    const searchPlans = buildSearchPlans(context);
    diagnostics.queriesExecuted = searchPlans.map(plan => plan.query);
    const settled = await Promise.allSettled(searchPlans.map(googleSearch));
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') sources.push(...result.value);
      else {
        const plan = searchPlans[index];
        const rejection = { query: plan.query, category: plan.category, reason: result.reason.message, status: result.reason.httpStatus || null };
        diagnostics.rejectedSources.push(rejection);
        errors.push(`Public search unavailable for ${plan.query}: ${result.reason.message}`);
      }
    });
  } else {
    errors.push('Google Custom Search is not configured.');
  }

  const allUniqueSources = [...new Map(sources.map(source => [`${source.category}:${source.url}`, source])).values()];
  const linkedInResults = allUniqueSources.filter(source => /linkedin\.com\/jobs/i.test(source.url || ''));
  console.info('[ENRICHMENT LINKEDIN RESULTS BEFORE EXTRACTION]', linkedInResults.map(source => ({
    title: source.title, url: source.url, snippet: source.snippet, category: source.category
  })));
  const uniqueSources = allUniqueSources.slice(0, 100);
  diagnostics.rawResultsFound = allUniqueSources.length;
  diagnostics.linkedinResultsFound = linkedInResults.length;
  diagnostics.rejectedReasons = diagnostics.rejectedSources;
  diagnostics.cacheUsed = false;
  diagnostics.pocSignalsFound = uniqueSources.filter(source => source.category === 'pocHiringActivity').length;
  return {
    status: uniqueSources.length ? 'completed' : 'no_public_information',
    crmContext: context,
    sources: uniqueSources,
    evidenceByCategory: groupEvidence(uniqueSources),
    websiteExtracts: websiteExtracts.slice(0, 6),
    errors,
    diagnostics
  };
}

module.exports = { researchCompanyPublicly };
