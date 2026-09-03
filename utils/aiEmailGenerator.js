/**
 * aiEmailGenerator.js
 * -------------------
 * Calls the OpenAI Chat Completions API to generate a personalised B2B
 * cold-email draft for Jobs Territory.
 *
 * Returns an object whose shape matches the `EmailContent` interface in
 * SendEmailModal.tsx so the frontend can drop it straight into state.
 *
 * Env vars required:
 *   OPENAI_API_KEY  – your OpenAI secret key
 */

const https = require('https');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL          = 'gpt-4o-mini';
const MAX_TOKENS     = 1100;
const TEMPERATURE    = 0.72;
const TIMEOUT_MS     = 25000; // 25-second hard limit

// ---------------------------------------------------------------------------
// Helper: POST JSON to OpenAI via Node's built-in https (no extra deps)
// ---------------------------------------------------------------------------
function openAiPost(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    const options = {
      hostname: 'api.openai.com',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers:  {
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${apiKey}`
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode !== 200) {
            const errMsg = parsed?.error?.message || `OpenAI returned HTTP ${res.statusCode}`;
            return reject(new Error(errMsg));
          }
          resolve(parsed);
        } catch {
          reject(new Error('Failed to parse OpenAI response as JSON'));
        }
      });
    });

    req.on('error', reject);

    // Enforce hard timeout
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`OpenAI request timed out after ${TIMEOUT_MS / 1000}s`));
    });

    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Build the system + user prompt
// ---------------------------------------------------------------------------
function buildPrompt(company, poc) {
  const companyName  = company?.company_name  || 'the company';
  const industry     = company?.industry_name || 'their industry';
  const companySize  = company?.company_size  || null;
  const websiteUrl   = company?.website_url   || null;
  const pocName      = poc?.name              || null;
  const pocDesig     = poc?.designation       || null;

  const systemPrompt = `You are a senior B2B sales copywriter for Jobs Territory, a Bengaluru-based \
recruitment firm specialising in mid-to-senior Non-IT hiring (Sales, Marketing, Business Development, \
Operations). Your emails are warm, concise, data-backed, and highly personalised.

You MUST respond ONLY with a single valid JSON object — no markdown, no code fences, no extra text. \
The JSON must exactly match this schema:

{
  "subject": "string",
  "greeting": "string",
  "openingLine": "string",
  "contextLine": "string",
  "companyBlurb": "string",
  "pitchLine": "string",
  "bullets": ["string", "string", "string", "string", "string"],
  "caseStudyLabel": "string",
  "testimonialsLabel": "string",
  "closingLine": "string",
  "ctaLine": "string",
  "senderName": "string"
}

Rules:
- Keep each field concise (1–3 sentences max, except bullets).
- Always personalise using the company name, POC name, POC designation, and industry provided.
- bullets must have exactly 5 strings (our key value propositions).
- senderName must always be: "Business Development Team — Jobs Territory"
- caseStudyLabel must always be: "View Our Case Studies"
- testimonialsLabel must always be: "Read Client Testimonials"`;

  let userContent = `Write a personalised B2B cold email for the following prospect:\n\n`;
  userContent += `Company Name: ${companyName}\n`;
  userContent += `Industry: ${industry}\n`;
  if (companySize) userContent += `Company Size: ${companySize} employees\n`;
  if (websiteUrl)  userContent += `Website: ${websiteUrl}\n`;
  if (pocName)     userContent += `Point of Contact Name: ${pocName}\n`;
  if (pocDesig)    userContent += `Point of Contact Designation: ${pocDesig}\n`;
  userContent += `\nGenerate a compelling, personalised recruitment partnership outreach email.`;

  return { systemPrompt, userContent };
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------
/**
 * generateEmail(company, poc)
 *
 * @param {object} company  - { company_name, industry_name, company_size, website_url }
 * @param {object} poc      - { name, designation, email }
 * @returns {Promise<{ subject: string, content: EmailContent }>}
 *
 * Throws on error (caller must handle).
 */
async function generateEmail(company, poc) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    const err = new Error('OPENAI_API_KEY is not set in environment variables.');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const { systemPrompt, userContent } = buildPrompt(company, poc);

  const payload = {
    model:       MODEL,
    max_tokens:  MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  }
    ],
    // Ask the model to respond as JSON
    response_format: { type: 'json_object' }
  };

  let openAiResponse;
  try {
    openAiResponse = await openAiPost(payload, apiKey);
  } catch (err) {
    err.code = err.code || 'OPENAI_REQUEST_FAILED';
    throw err;
  }

  // Extract the text content from the API response
  const rawText = openAiResponse?.choices?.[0]?.message?.content;
  if (!rawText) {
    throw new Error('OpenAI returned an empty response.');
  }

  // Parse the JSON the model returned
  let aiData;
  try {
    aiData = JSON.parse(rawText);
  } catch {
    throw new Error('OpenAI response was not valid JSON. Raw: ' + rawText.slice(0, 200));
  }

  // Validate minimum required fields
  const required = ['subject', 'greeting', 'openingLine', 'pitchLine', 'bullets'];
  for (const field of required) {
    if (!aiData[field]) {
      throw new Error(`AI response missing required field: "${field}"`);
    }
  }

  // Ensure bullets is always an array of exactly 5 strings
  if (!Array.isArray(aiData.bullets)) {
    aiData.bullets = [String(aiData.bullets)];
  }
  while (aiData.bullets.length < 5) {
    aiData.bullets.push('Dedicated account manager for seamless communication');
  }
  aiData.bullets = aiData.bullets.slice(0, 5);

  // Build the return shape (subject separate, content = EmailContent interface)
  const content = {
    greeting:          aiData.greeting          || `Hi ${poc?.name || 'there'},`,
    openingLine:       aiData.openingLine        || '',
    contextLine:       aiData.contextLine        || '',
    companyBlurb:      aiData.companyBlurb       || '',
    pitchLine:         aiData.pitchLine          || '',
    bullets:           aiData.bullets,
    caseStudyLabel:    'View Our Case Studies',
    testimonialsLabel: 'Read Client Testimonials',
    closingLine:       aiData.closingLine        || '',
    ctaLine:           aiData.ctaLine            || '',
    senderName:        'Business Development Team — Jobs Territory'
  };

  return {
    subject: aiData.subject || `Your Next Great Hire — Jobs Territory × ${company?.company_name || 'Your Company'}`,
    content
  };
}

module.exports = { generateEmail };
