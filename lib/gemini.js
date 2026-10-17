// Server-only Gemini helper (REST, no SDK, so model upgrades are just an env change).
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiReady() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Keep "thinking" off/low: this is a voice app, speed matters more than long reasoning.
// think=true: a small reasoning budget for the main answer (better understanding, ~0.5-1 s extra).
function thinkingFor(model, think) {
  const budget = think ? Number(process.env.GEMINI_THINKING_BUDGET ?? 384) : 0;
  if (/2\.5-flash/.test(model)) return { thinkingBudget: budget }; // 2.5 Flash and Flash-Lite
  if (/2\.5-pro/.test(model)) return { thinkingBudget: Math.max(128, budget) };
  if (/gemini-3/.test(model)) return { thinkingLevel: 'low' };
  return null;
}

/**
 * Call Gemini generateContent.
 * @param {object} opts
 * @param {string} opts.system         system instruction
 * @param {Array}  opts.contents       [{role:'user'|'model', parts:[{text}|{functionCall}|{functionResponse}]}]
 * @param {Array}  [opts.tools]        functionDeclarations array
 * @param {boolean}[opts.json]         force JSON output
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.timeoutMs]
 */
export async function gemini({ system, contents, tools, json = false, temperature = 0.4, maxTokens = 500, timeoutMs = 15000, think = false }) {
  const primary = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  // Free-tier limits are per key and per model. If one is busy (429/503/slow), try the next.
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3].filter(Boolean);
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash-lite';
  const plan = [];
  for (const k of keys) plan.push({ model: primary, key: k, think });
  if (fallbackModel && fallbackModel !== primary) for (const k of keys) plan.push({ model: fallbackModel, key: k, think: false });

  const build = (model, withThinking) => {
    const body = { contents, generationConfig: { temperature, maxOutputTokens: maxTokens + (withThinking ? 600 : 0) } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (tools?.length) body.tools = [{ functionDeclarations: tools }];
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const t = thinkingFor(model, withThinking);
    if (t) body.generationConfig.thinkingConfig = t;
    return body;
  };
  const call = async (model, key, body) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(`${BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let lastErr = null;
  for (const step of plan) {
    let body = build(step.model, step.think);
    let res;
    try {
      res = await call(step.model, step.key, body);
      if (res.status === 400 && body.generationConfig.thinkingConfig) {
        delete body.generationConfig.thinkingConfig; // model doesn't accept our thinking setting
        res = await call(step.model, step.key, body);
      }
    } catch (e) {
      lastErr = Object.assign(new Error('Gemini timeout/network: ' + e.message), { busy: true });
      continue; // slow or network: try the next option
    }
    if (res.ok) {
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      return {
        parts,
        model: step.model,
        text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim(),
        calls: parts.filter((p) => p.functionCall).map((p) => p.functionCall),
      };
    }
    const t = await res.text().catch(() => '');
    lastErr = Object.assign(new Error(`Gemini ${res.status} (${step.model}): ${t.slice(0, 200)}`), { status: res.status, busy: res.status === 429 || res.status >= 500 });
    if (!lastErr.busy) break; // a real error (bad key, bad request): don't keep trying
  }
  throw lastErr || new Error('Gemini not configured');
}

// This is spoken aloud by TTS, so strip markdown symbols the model might still add.
export function stripMarkdown(text = '') {
  return text
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[*#_`]/g, '')
    .replace(/\n+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Parse JSON safely from a model answer
export function safeJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text?.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return fallback;
  }
}
