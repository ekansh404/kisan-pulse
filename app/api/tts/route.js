// GET /api/tts?text=...&lang=hi  -> natural voice audio (streamed), or 204 = "use the browser voice".
// Provider:
//   ELEVENLABS_API_KEY set           -> ElevenLabs (best, very natural Hindi, ~0.3 s to first sound)
//   TTS_PROVIDER=gemini              -> Gemini TTS with the existing GEMINI_API_KEY (natural, slower, free-tier limits)
//   otherwise                        -> 204, the phone's built-in voice is used
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const text = (p.get('text') || '').slice(0, 1200).trim();
  const lang = p.get('lang') === 'en' ? 'en' : 'hi';
  if (!text) return new Response(null, { status: 204 });

  try {
    if (process.env.ELEVENLABS_API_KEY) return await eleven(text, lang);
    if (process.env.TTS_PROVIDER === 'gemini' && process.env.GEMINI_API_KEY) return await geminiTts(text, lang);
  } catch (e) {
    console.error('tts', e);
    return new Response(null, { status: 502 });
  }
  return new Response(null, { status: 204 });
}

async function eleven(text, lang) {
  // Pick a Hindi female voice in ElevenLabs -> Voices -> Voice Library, copy its Voice ID into ELEVENLABS_VOICE_ID.
  const voice = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
      language_code: lang,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  });
  if (!res.ok || !res.body) {
    console.error('elevenlabs', res.status, await res.text().catch(() => ''));
    return new Response(null, { status: 502 });
  }
  return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}

async function geminiTts(text, lang) {
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
  const style = lang === 'en' ? 'Say this in a warm, friendly Indian English female voice:' : 'इसे एक गर्मजोशी भरी, अपनापन वाली महिला आवाज़ में सहज हिंदी में बोलिए:';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${style} ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE || 'Kore' } } },
      },
    }),
  });
  if (!res.ok) {
    console.error('gemini tts', res.status, (await res.text()).slice(0, 300));
    return new Response(null, { status: 502 });
  }
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((x) => x.inlineData);
  if (!part) return new Response(null, { status: 502 });
  const pcm = Buffer.from(part.inlineData.data, 'base64');
  const rate = Number((part.inlineData.mimeType || '').match(/rate=(\d+)/)?.[1] || 24000);
  return new Response(wav(pcm, rate), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
}

// 16-bit mono PCM -> WAV file
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
