const { buildAiEmailPrompt } = require('./aiEmailPrompt');
const { GoogleGenAI } = require('@google/genai');

const PROMPT_VERSION = 'ai-email-v13-saved-industry-fallback';
const MODEL = process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-1.5-flash';
const PROVIDER = 'Google Gemini';
const REQUEST_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 60_000);

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'sections', 'research'],
  properties: {
    subject: { type: 'string' },
    sections: {
      type: 'object',
      additionalProperties: false,
      required: ['greeting', 'researchObservation', 'aboutCompany', 'hiringObservation', 'whyJobsTerritory', 'keyBenefits', 'caseStudiesCta', 'testimonialsCta', 'meetingCta', 'professionalClosing', 'senderName'],
      properties: {
        greeting: { type: 'string' },
        researchObservation: { type: 'string' },
        aboutCompany: { type: 'string' },
        hiringObservation: { type: 'string' },
        whyJobsTerritory: { type: 'string' },
        keyBenefits: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
        caseStudiesCta: { type: 'string' },
        testimonialsCta: { type: 'string' },
        meetingCta: { type: 'string' },
        professionalClosing: { type: 'string' },
        senderName: { type: 'string' }
      }
    },
    research: {
      type: 'object',
      additionalProperties: false,
      required: ['companySummary', 'contactContext', 'publicResearchSummary', 'personalizationPoints', 'dataGaps'],
      properties: {
        companySummary: { type: 'string' },
        contactContext: { type: 'string' },
        publicResearchSummary: { type: 'string' },
        personalizationPoints: {
          type: 'array',
          minItems: 0,
          maxItems: 6,
          items: { type: 'string' }
        },
        dataGaps: {
          type: 'array',
          minItems: 0,
          maxItems: 8,
          items: { type: 'string' }
        }
      }
    }
  }
};

const cleanText = (value, maxLength) => String(value || '')
  .replace(/<[^>]*>/g, '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .trim()
  .slice(0, maxLength);

const redactSecrets = (value) => String(value || '')
  .split(process.env.GEMINI_API_KEY || '__NO_GEMINI_KEY__').join('[REDACTED_GEMINI_API_KEY]')
  .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GOOGLE_API_KEY]');

const parseProviderResponse = (error) => {
  const raw = redactSecrets(error?.message);
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
};

const validateResult = (result) => {
  const research = result?.research;
  const sections = result?.sections;
  const sectionFields = ['greeting', 'researchObservation', 'aboutCompany', 'hiringObservation', 'whyJobsTerritory', 'caseStudiesCta', 'testimonialsCta', 'meetingCta', 'professionalClosing', 'senderName'];
  if (!result || typeof result.subject !== 'string' || !sections ||
      !sectionFields.every(field => typeof sections[field] === 'string') || !Array.isArray(sections.keyBenefits) ||
      !research || typeof research.companySummary !== 'string' ||
      typeof research.contactContext !== 'string' || typeof research.publicResearchSummary !== 'string' ||
      !Array.isArray(research.personalizationPoints) || !Array.isArray(research.dataGaps)) {
    throw Object.assign(new Error('AI returned an invalid email structure.'), { code: 'INVALID_AI_OUTPUT' });
  }

  const cleaned = {
    subject: cleanText(result.subject, 160),
    content: {
      greeting: cleanText(sections.greeting, 120),
      openingLine: cleanText(sections.researchObservation, 700),
      contextLine: cleanText(sections.hiringObservation, 700),
      companyBlurb: cleanText(sections.aboutCompany, 700),
      pitchLine: cleanText(sections.whyJobsTerritory, 1000),
      bullets: sections.keyBenefits.map(value => cleanText(value, 240)).filter(Boolean).slice(0, 5),
      closingLine: [sections.caseStudiesCta, sections.testimonialsCta, sections.professionalClosing]
        .map(value => cleanText(value, 240)).filter(Boolean).join('\n\n').slice(0, 700),
      ctaLine: cleanText(sections.meetingCta, 300),
      senderName: cleanText(sections.senderName, 160)
    },
    research: {
      companySummary: cleanText(research.companySummary, 1000),
      contactContext: cleanText(research.contactContext, 700),
      publicResearchSummary: cleanText(research.publicResearchSummary, 1500),
      personalizationPoints: research.personalizationPoints.map(value => cleanText(value, 300)).filter(Boolean).slice(0, 6),
      dataGaps: research.dataGaps.map(value => cleanText(value, 200)).filter(Boolean).slice(0, 8)
    }
  };

  if (!cleaned.subject || !sectionFields.every(field => cleanText(sections[field], 1000)) || cleaned.content.bullets.length < 3) {
    throw Object.assign(new Error('AI returned an empty email.'), { code: 'INVALID_AI_OUTPUT' });
  }
  return cleaned;
};

async function generateAiEmail({ context, signal, client }) {
  if (!client && !process.env.GEMINI_API_KEY) {
    throw Object.assign(new Error('AI email generation is not configured.'), { code: 'AI_NOT_CONFIGURED' });
  }

  const prompt = buildAiEmailPrompt(context);
  const ai = client || new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt.input,
      config: {
        systemInstruction: prompt.instructions,
        responseMimeType: 'application/json',
        responseJsonSchema: responseSchema,
        abortSignal: controller.signal
      }
    });
    if (typeof response.text !== 'string' || !response.text.trim()) {
      throw Object.assign(new Error('AI provider returned no output.'), { code: 'INVALID_AI_OUTPUT' });
    }
    return validateResult(JSON.parse(response.text));
  } catch (error) {
    if (error.code === 'INVALID_AI_OUTPUT' || error instanceof SyntaxError) throw error;
    if (error.name === 'AbortError' || error.code === 20) {
      throw Object.assign(new Error('AI provider request timed out.'), { code: 'AI_TIMEOUT', name: 'AbortError' });
    }
    const status = Number(error.status || error.statusCode || error.code);
    const providerResponse = parseProviderResponse(error);
    const providerError = new Error(status ? `AI provider request failed (${status}).` : 'AI provider request failed.');
    providerError.code = status === 429 ? 'AI_RATE_LIMIT' : status === 503 ? 'AI_PROVIDER_BUSY' : 'AI_PROVIDER_ERROR';
    providerError.providerStatus = Number.isFinite(status) ? status : undefined;
    providerError.provider = PROVIDER;
    providerError.model = MODEL;
    providerError.requestUrl = REQUEST_URL;
    providerError.providerResponse = providerResponse;
    providerError.details = redactSecrets(error.message);
    throw providerError;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

module.exports = { generateAiEmail, PROMPT_VERSION, MODEL, PROVIDER, REQUEST_URL };
