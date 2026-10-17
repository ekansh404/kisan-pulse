'use client';
// Browser voice engine: Web Speech API for STT (speech-to-text) and TTS (text-to-speech).
// Works best in Chrome on Android. Needs HTTPS (or localhost) for the microphone.

const LOCALE = { hi: 'hi-IN', en: 'en-IN' };

export function sttSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/* ---------------- TTS ---------------- */

let voicesCache = [];
function loadVoices() {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve([]);
    const v = speechSynthesis.getVoices();
    if (v.length) { voicesCache = v; return resolve(v); }
    const done = () => { voicesCache = speechSynthesis.getVoices(); resolve(voicesCache); };
    speechSynthesis.onvoiceschanged = done;
    setTimeout(done, 1200); // some phones never fire the event
  });
}

// Prefer a female voice for the language. Names differ per device, so we score them.
const FEMALE = /female|woman|kalpana|heera|swara|lekha|aditi|raveena|neerja|zira|veena|google हिन्दी|google hindi|hi-in-x-hia|hi-in-x-hic|en-in-x-ena|en-in-x-enc/i;
const MALE = /\bmale\b|hemant|madhur|ravi|prabhat|kunal|hi-in-x-hid|hi-in-x-hie|en-in-x-end|en-in-x-ene/i;

export async function pickVoice(lang = 'hi') {
  const voices = voicesCache.length ? voicesCache : await loadVoices();
  const want = LOCALE[lang] || 'hi-IN';
  const sameLang = voices.filter((v) => v.lang?.replace('_', '-').toLowerCase().startsWith(want.slice(0, 2)));
  const score = (v) =>
    (v.lang.replace('_', '-') === want ? 4 : 0) +
    (FEMALE.test(v.name) ? 3 : 0) -
    (MALE.test(v.name) ? 5 : 0) +
    (v.localService ? 1 : 0);
  return sameLang.sort((a, b) => score(b) - score(a))[0] || null;
}

// Split long text so Chrome does not cut speech after ~15 seconds
function chunks(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[।.!?])\s+/)
    .flatMap((s) => (s.length > 180 ? s.match(/.{1,180}(\s|$)/g) : [s]))
    .map((s) => s.trim())
    .filter(Boolean);
}

let speakingToken = 0;
export function stopSpeaking() {
  speakingToken++;
  if (ttsSupported()) speechSynthesis.cancel();
}

/** Speak text. Resolves when finished (or stopped). */
export async function speak(text, lang = 'hi', { rate = 0.95 } = {}) {
  if (!ttsSupported() || !text) return;
  stopSpeaking();
  const token = speakingToken;
  const voice = await pickVoice(lang);
  for (const part of chunks(text)) {
    if (token !== speakingToken) return;
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = LOCALE[lang] || 'hi-IN';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = voice && FEMALE.test(voice.name) ? 1 : 1.15; // nudge towards a softer voice
      u.onend = resolve;
      u.onerror = resolve;
      speechSynthesis.speak(u);
      // safety: never hang forever
      setTimeout(resolve, Math.max(4000, part.length * 120));
    });
  }
}

/* ---------------- STT ---------------- */

let activeRec = null;
let typedQueue = null; // text typed by the user (fallback when mic fails)
let typedHook = null;

/** Let the user type instead of speak. Resolves the current listen() with this text. */
export function submitTyped(text) {
  if (!text?.trim()) return;
  stopSpeaking();
  if (typedHook) typedHook(text.trim());
  else typedQueue = text.trim();
}

export function stopListening() {
  try { activeRec?.abort(); } catch {}
  activeRec = null;
}

/**
 * Listen once. Resolves {text, confidence, error}.
 * error: 'no-speech' | 'not-allowed' | 'unsupported' | 'network' | 'aborted' | null
 */
export function listen({ lang = 'hi', onInterim, maxMs = 12000 } = {}) {
  return new Promise((resolve) => {
    if (typedQueue) { const t = typedQueue; typedQueue = null; return resolve({ text: t, confidence: 1, error: null, typed: true }); }
    if (!sttSupported()) {
      // no mic support: wait for typed text only
      typedHook = (t) => { typedHook = null; resolve({ text: t, confidence: 1, error: null, typed: true }); };
      return;
    }
    stopListening();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    activeRec = rec;
    rec.lang = LOCALE[lang] || 'hi-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalText = '';
    let conf = 0;
    let err = null;
    let settled = false;
    typedHook = (t) => { finalText = t; conf = 1; try { rec.abort(); } catch {} finish(); };
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeRec = null;
      typedHook = null;
      const text = finalText.trim();
      resolve({ text, confidence: text ? conf || 0.7 : 0, error: text ? null : err || 'no-speech' });
    };
    const timer = setTimeout(() => { try { rec.stop(); } catch {} }, maxMs);

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { finalText += r[0].transcript + ' '; conf = r[0].confidence; }
        else interim += r[0].transcript;
      }
      onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e) => { err = e.error; };
    rec.onend = finish;
    try { rec.start(); } catch { err = 'busy'; finish(); }
  });
}

/* ---------------- Speak + listen with retry ---------------- */

const RETRY = {
  hi: ['माफ़ कीजिए, मैं आपको सुन नहीं पाई। कृपया दोबारा बोलिए।', 'फिर से थोड़ा धीरे और साफ़ बोलिए।', 'अभी भी साफ़ नहीं सुनाई दिया। आप नीचे लिखकर भी बता सकते हैं।'],
  en: ["Sorry, I couldn't hear you. Please say that again.", 'Please speak a little slower and clearer.', "Still not clear. You can also type it below."],
};

/**
 * Ask a question by voice and wait for a usable answer.
 * validate(text) => {ok:true, value} | {ok:false}. Retries up to `tries` times with "main aapko sun nahi paayi".
 * onCaption({who:'ai'|'user', text, final}) lets the UI show big captions.
 * Returns {ok, value, text} or {ok:false, reason:'gave_up'|'unsupported'|'denied'}
 */
export async function askWithRetry(question, { lang = 'hi', validate = (t) => ({ ok: !!t, value: t }), tries = 3, onCaption, onListening } = {}) {
  onCaption?.({ who: 'ai', text: question, final: true });
  await speak(question, lang);
  for (let attempt = 0; attempt < tries; attempt++) {
    await new Promise((r) => setTimeout(r, 250)); // let the speaker go quiet before the mic opens
    onListening?.(true);
    const r = await listen({ lang, onInterim: (t) => onCaption?.({ who: 'user', text: t, final: false }) });
    onListening?.(false);
    if (r.error === 'unsupported') return { ok: false, reason: 'unsupported' };
    if (r.error === 'not-allowed') return { ok: false, reason: 'denied' };
    if (r.text) {
      onCaption?.({ who: 'user', text: r.text, final: true });
      const v = await validate(r.text);
      if (v?.ok) return { ok: true, value: v.value, text: r.text };
      // heard something but it was not usable: let validate() supply a specific re-ask
      const reask = v?.reask || RETRY[lang][Math.min(attempt, 2)];
      onCaption?.({ who: 'ai', text: reask, final: true });
      await speak(reask, lang);
      continue;
    }
    const msg = RETRY[lang][Math.min(attempt, 2)];
    onCaption?.({ who: 'ai', text: msg, final: true });
    await speak(msg, lang);
  }
  return { ok: false, reason: 'gave_up' };
}

/* ---------------- Yes / no ---------------- */
// Devanagari has no \b word boundary in JS, so short words use (^|\s)...(\s|$)
const YES = /\b(haan|ha|haa|han|ji haan|jee|ji|yes|yeah|ok|okay|theek|thik|sahi|bilkul|kar do|karo|confirm)\b|हाँ|हां|(^|\s)(हा|जी)(\s|$|[,।])|ठीक|सही|बिल्कुल|कर दो|करो|ओके/i;
const NO = /\b(nahi|nahin|na|no|mat|cancel|galat|ruko)\b|नहीं|नही|(^|\s)(ना|मत)(\s|$|[,।])|गलत|रुको|कैंसिल/i;
export function yesNo(text = '') {
  const t = text.toLowerCase();
  if (NO.test(t)) return 'no'; // check "no" first: "nahi, theek nahi" must be no
  if (YES.test(t)) return 'yes';
  return null;
}
