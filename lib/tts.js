// Server-only ElevenLabs helper (used by /api/tts and /api/health).
// Premade voices work on every plan; Voice Library voices need a paid plan for API use.
export const PREMADE_FALLBACK = 'EXAVITQu4vr4xnSDxMaL'; // "Sarah": soft female, fine for Hindi with multilingual models

function request(text, lang, voice, withLang) {
  const model = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
  const body = {
    text,
    model_id: model,
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
  };
  if (withLang) body.language_code = lang; // only some models accept this (v2.5 flash/turbo)
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
}

/** Returns {res, voice, note}. Tries: your voice -> without language_code -> premade voice. */
export async function elevenSpeak(text, lang = 'hi') {
  const model = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
  const mine = (process.env.ELEVENLABS_VOICE_ID || '').trim() || PREMADE_FALLBACK;
  const langOk = /v2_5|v3/.test(model);
  const notes = [];
  for (const [voice, withLang] of [[mine, langOk], [mine, false], [PREMADE_FALLBACK, langOk], [PREMADE_FALLBACK, false]]) {
    const res = await request(text, lang, voice, withLang);
    if (res.ok && res.body) return { res, voice, notes };
    const msg = (await res.text().catch(() => '')).slice(0, 200);
    notes.push(`${voice}${withLang ? '+lang' : ''}: ${res.status} ${msg}`);
    if (res.status === 401 || res.status === 429) break; // bad key / out of quota: other voices won't help
  }
  return { res: null, notes };
}
