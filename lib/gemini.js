// Server-only Gemini helper (REST, no SDK, so model upgrades are just an env change).
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiReady() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Keep "thinking" off/low: this is a voice app, speed matters more than long reasoning.
function thinkingFor(model) {
  if (/2\.5-flash/.test(model)) return { thinkingBudget: 0 }; // 2.5 Flash and Flash-Lite
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
export async function gemini({ system, contents, tools, json = false, temperature = 0.4, maxTokens = 500, timeoutMs = 15000 }) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools?.length) body.tools = [{ functionDeclarations: tools }];
  if (json) body.generationConfig.responseMimeType = 'application/json';
  const thinking = thinkingFor(model);
  if (thinking) body.generationConfig.thinkingConfig = thinking;

  const call = async (b) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(`${BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(b),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await call(body);
  // Model doesn't accept our thinking setting: retry once without it.
  if (res.status === 400 && thinking) {
    delete body.generationConfig.thinkingConfig;
    res = await call(body);
  }
  // Overloaded / rate-limited: wait a moment and try once more.
  if (!res.ok && (res.status === 429 || res.status === 503)) {
    await new Promise((r) => setTimeout(r, 1200));
    res = await call(body);
  }
  if (!res.ok) {
    const t = await res.text();
    const err = new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
    err.status = res.status;
    err.busy = res.status === 429 || res.status === 503;
    throw err;
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return {
    parts,
    text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim(),
    calls: parts.filter((p) => p.functionCall).map((p) => p.functionCall),
  };
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
