// Server-only Gemini helper (REST, no SDK, so model upgrades are just an env change).
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiReady() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Call Gemini generateContent.
 * @param {object} opts
 * @param {string} opts.system         system instruction
 * @param {Array}  opts.contents       [{role:'user'|'model', parts:[{text}|{functionCall}|{functionResponse}]}]
 * @param {Array}  [opts.tools]        functionDeclarations array
 * @param {boolean}[opts.json]         force JSON output
 * @param {number} [opts.temperature]
 */
export async function gemini({ system, contents, tools, json = false, temperature = 0.4 }) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens: 1024 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools?.length) body.tools = [{ functionDeclarations: tools }];
  if (json) body.generationConfig.responseMimeType = 'application/json';
  // Keep answers fast: no long "thinking" for a voice app
  if (model.includes('2.5-flash')) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return {
    parts,
    text: parts.filter((p) => p.text).map((p) => p.text).join('').trim(),
    calls: parts.filter((p) => p.functionCall).map((p) => p.functionCall),
  };
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
