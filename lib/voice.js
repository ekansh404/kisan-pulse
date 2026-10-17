'use client';
// Kisan Pulse voice engine (browser Web Speech API).
// - listen(): keeps the mic open until the farmer is actually done (silence timer), survives short pauses,
//   auto-restarts when Chrome closes the mic early, de-duplicates Android's repeated results.
// - speakAndListen(): two-way conversation. The mic stays open while the assistant talks; if the farmer
//   starts speaking, the assistant stops ("barge-in"). The app's own voice (echo) is filtered out.
// Works best in Chrome on Android. Needs HTTPS (or localhost) for the microphone.

const LOCALE = { hi: 'hi-IN', en: 'en-IN' };

export function sttSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/* ============================== TTS ============================== */

let voicesCache = [];
function loadVoices() {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve([]);
    const v = speechSynthesis.getVoices();
    if (v.length) { voicesCache = v; return resolve(v); }
    const done = () => { voicesCache = speechSynthesis.getVoices(); resolve(voicesCache); };
    speechSynthesis.onvoiceschanged = done;
    setTimeout(done, 800); // some phones never fire the event
  });
}
if (typeof window !== 'undefined') loadVoices(); // warm up early so the first answer isn't delayed

const FEMALE = /female|woman|kalpana|heera|swara|lekha|aditi|raveena|neerja|zira|veena|google हिन्दी|google hindi|hi-in-x-hia|hi-in-x-hic|en-in-x-ena|en-in-x-enc/i;
const MALE = /\bmale\b|hemant|madhur|ravi|prabhat|kunal|hi-in-x-hid|hi-in-x-hie|en-in-x-end|en-in-x-ene/i;

let chosen = {};
export async function pickVoice(lang = 'hi') {
  if (chosen[lang]) return chosen[lang];
  const voices = voicesCache.length ? voicesCache : await loadVoices();
  const want = LOCALE[lang] || 'hi-IN';
  const same = voices.filter((v) => v.lang?.replace('_', '-').toLowerCase().startsWith(want.slice(0, 2)));
  const score = (v) => (v.lang.replace('_', '-') === want ? 4 : 0) + (FEMALE.test(v.name) ? 3 : 0) - (MALE.test(v.name) ? 5 : 0) + (v.localService ? 1 : 0);
  const best = same.sort((a, b) => score(b) - score(a))[0] || null;
  if (best) chosen[lang] = best;
  else if (lang === 'hi') console.log('Kisan Pulse: no Hindi voice on this device. Voices:', voices.map((v) => v.name));
  return best;
}

function chunks(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[।.!?])\s+/)
    .flatMap((s) => (s.length > 180 ? s.match(/.{1,180}(\s|$)/g) : [s]))
    .map((s) => s.trim())
    .filter(Boolean);
}

let speakToken = 0;
let speakingNow = false;
let lastSpeechEnd = 0;
let spokenWords = new Set(); // words of what the app is saying (for echo filtering)
let currentAudio = null;
let serverTts = true; // natural voice from /api/tts; switches off by itself if the server says "use browser"
let serverFails = 0;
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/** Android pauses media audio when the mic opens, so with the natural (server) voice we can't listen while speaking.
 *  Then the farmer interrupts by tapping the orb instead. With the phone's own voice, talking over it works. */
export function canTalkOver() {
  return !(IS_ANDROID && serverTts);
}
export function usingNaturalVoice() {
  return serverTts;
}

export function isSpeaking() {
  return speakingNow;
}
/** true while speaking and for a short moment after (the recognizer lags behind) */
function echoWindow() {
  return speakingNow || Date.now() - lastSpeechEnd < 900;
}

export function stopSpeaking() {
  speakToken++;
  if (speakingNow) lastSpeechEnd = Date.now();
  speakingNow = false;
  if (currentAudio) { try { currentAudio.pause(); currentAudio.src = ''; } catch {} currentAudio = null; }
  if (ttsSupported()) { try { speechSynthesis.cancel(); } catch {} }
}

// Natural voice (ElevenLabs / Gemini via /api/tts). Resolves 'done' | 'stopped' | 'fallback' | 'blocked'.
function speakServer(text, lang, token) {
  return new Promise((resolve) => {
    const audio = new Audio(`/api/tts?lang=${lang}&text=${encodeURIComponent(text)}`);
    currentAudio = audio;
    let started = false;
    let settled = false;
    const end = (r) => { if (settled) return; settled = true; clearTimeout(t); if (currentAudio === audio) currentAudio = null; resolve(r); };
    audio.onplaying = () => { started = true; };
    audio.onended = () => end('done');
    audio.onpause = () => {
      if (token !== speakToken) return end('stopped');
      if (started && !audio.ended) setTimeout(() => { if (token === speakToken) audio.play().catch(() => end('done')); }, 250); // paused by the system: resume
    };
    audio.onerror = () => end(started ? 'done' : 'fallback');
    const t = setTimeout(() => { if (!started) { try { audio.pause(); } catch {} end('fallback'); } }, 7000);
    audio.play().catch((e) => end(e?.name === 'NotAllowedError' ? 'blocked' : 'fallback')); // blocked = no tap yet
  });
}

function speakBrowser(text, lang, token, voice, rate) {
  return (async () => {
    for (const part of chunks(text)) {
      if (token !== speakToken) return;
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(part);
        u.lang = LOCALE[lang] || 'hi-IN';
        if (voice) u.voice = voice;
        u.rate = rate;
        u.pitch = voice && FEMALE.test(voice.name) ? 1 : 1.15;
        u.onend = resolve;
        u.onerror = resolve;
        speechSynthesis.speak(u);
        setTimeout(resolve, Math.max(3500, part.length * 110)); // never hang (Android sometimes skips onend)
      });
    }
  })();
}

/** Speak text. Resolves when finished or stopped. */
export async function speak(text, lang = 'hi', { rate = 1 } = {}) {
  if (!text || typeof window === 'undefined') return;
  stopSpeaking();
  const token = speakToken;
  spokenWords = wordSet(text);
  speakingNow = true;
  try {
    if (serverTts) {
      const r = await speakServer(text, lang, token);
      if (r === 'done' || r === 'stopped') { serverFails = 0; return; }
      if (token !== speakToken) return;
      if (r === 'fallback' && ++serverFails >= 2) serverTts = false; // server has no natural voice configured: stop asking
    }
    if (!ttsSupported()) return;
    const voice = await pickVoice(lang);
    await speakBrowser(text, lang, token, voice, rate);
  } finally {
    if (token === speakToken) { speakingNow = false; lastSpeechEnd = Date.now(); }
  }
}

/* ============================== Echo filter ============================== */

function norm(t = '') {
  return t.toLowerCase().replace(/[।.,!?;:"'()\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
}
function wordSet(t) {
  return new Set(norm(t).split(' ').filter(Boolean));
}
/** Does this transcript look like the app hearing its own voice? */
function looksLikeEcho(t) {
  const words = norm(t).split(' ').filter(Boolean);
  if (!words.length) return true;
  const inSpeech = words.filter((w) => spokenWords.has(w)).length;
  return inSpeech / words.length >= 0.6;
}

/* ============================== STT ============================== */

let active = null; // { finish(reason) }
let typedQueue = null;
let typedHook = null;

/** Let the farmer type instead of speak. Resolves the current listen(), or the next one. */
export function submitTyped(text) {
  const t = text?.trim();
  if (!t) return;
  stopSpeaking();
  if (typedHook) typedHook(t);
  else typedQueue = t;
}

/** Stop the current listen() now; it resolves with whatever was heard so far. */
export function stopListening() {
  active?.finish('stopped');
}
/** Stop the current listen() and throw away what was heard (mute button, closing the screen). */
export function cancelListening() {
  active?.finish('cancelled');
}
export function isListening() {
  return !!active;
}

function mergeFinal(arr, t) {
  t = t.trim();
  if (!t) return;
  const last = arr[arr.length - 1];
  if (last && t.startsWith(last)) arr[arr.length - 1] = t; // Android repeats the growing sentence
  else if (last && last.endsWith(t)) return;
  else arr.push(t);
}

/**
 * Listen until the farmer finishes. Resolves {text, error, typed?}
 *  silenceMs       how long a pause ends the answer (default 1800 ms)
 *  startTimeoutMs  give up if nothing is said for this long (default 9000 ms)
 *  filterEcho      ignore the app's own voice while it is speaking
 *  onSpeech(t)     called once, the first time real speech is heard (used for barge-in)
 *  doneWhen(t)     return true when the answer is already complete (e.g. 4 OTP digits, "हाँ") -> no waiting for silence
 */
export function listen({ lang = 'hi', onInterim, onSpeech, silenceMs = 1800, startTimeoutMs = 9000, maxMs = 30000, filterEcho = false, doneWhen } = {}) {
  return new Promise((resolve) => {
    if (typedQueue) { const t = typedQueue; typedQueue = null; return resolve({ text: t, error: null, typed: true }); }
    if (!sttSupported()) {
      typedHook = (t) => { typedHook = null; resolve({ text: t, error: null, typed: true }); };
      return;
    }
    stopListening(); // only one listener at a time

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;
    let prior = []; // finals from earlier sessions (Chrome may end the session early; we restart)
    let sessionFinals = [];
    let interim = '';
    let skip = 0; // result index before which everything was echo
    let heard = false;
    let lastAt = 0;
    let quietSince = Date.now(); // for the start timeout; reset while the app is speaking
    let errorCode = null;
    let done = false;
    const startedAt = Date.now();

    const current = () => [...prior, ...sessionFinals, interim].join(' ').replace(/\s+/g, ' ').trim();

    const finish = (reason) => {
      if (done) return;
      done = true;
      clearInterval(tick);
      try { rec?.abort(); } catch {}
      if (active?.finish === finish) active = null;
      typedHook = null;
      const text = reason === 'cancelled' ? '' : current();
      resolve({ text, error: text ? null : reason === 'cancelled' ? 'cancelled' : errorCode || 'no-speech', reason });
    };
    active = { finish };
    typedHook = (t) => { prior = [t]; sessionFinals = []; interim = ''; finish('typed'); };

    const tick = setInterval(() => {
      const now = Date.now();
      if (filterEcho && !heard && echoWindow()) quietSince = now; // don't time out while the app is talking
      if (heard && now - lastAt > silenceMs) finish('silence');
      else if (!heard && now - quietSince > startTimeoutMs) finish('no-speech');
      else if (now - startedAt > maxMs) finish('max');
    }, 120);

    const startSession = () => {
      if (done) return;
      sessionFinals = []; interim = ''; skip = 0;
      rec = new SR();
      rec.lang = LOCALE[lang] || 'hi-IN';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (e) => {
        const finals = [];
        let inter = '';
        for (let i = skip; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) mergeFinal(finals, r[0].transcript);
          else inter += r[0].transcript + ' ';
        }
        const candidate = [...finals, inter].join(' ').trim();
        if (!candidate) return;
        if (filterEcho && !heard && echoWindow() && looksLikeEcho(candidate)) {
          // our own voice: skip all results finished so far
          let k = e.results.length;
          while (k > skip && !e.results[k - 1].isFinal) k--;
          skip = k;
          return;
        }
        sessionFinals = finals;
        interim = inter.trim();
        lastAt = Date.now();
        if (!heard) { heard = true; onSpeech?.(candidate); }
        onInterim?.(current());
        if (doneWhen) { try { if (doneWhen(current())) setTimeout(() => finish('complete'), 150); } catch {} }
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { errorCode = 'not-allowed'; finish('denied'); }
        else if (e.error !== 'no-speech' && e.error !== 'aborted') errorCode = e.error;
      };
      rec.onend = () => {
        if (done) return;
        // Chrome closed the mic early. Keep what we have and reopen it.
        prior = [...prior, ...sessionFinals];
        if (interim) { prior.push(interim); interim = ''; }
        sessionFinals = [];
        setTimeout(startSession, 60);
      };
      try { rec.start(); } catch { setTimeout(startSession, 250); }
    };
    startSession();
  });
}

/* ============================== Two-way turn ============================== */

// Barge-in (talking over the assistant) can be switched off per phone if its speaker echo is too loud.
export function bargeInEnabled() {
  try { return localStorage.getItem('kp_bargein') !== 'off'; } catch { return true; }
}
export function setBargeIn(on) {
  try { localStorage.setItem('kp_bargein', on ? 'on' : 'off'); } catch {}
}

/**
 * Say something and listen at the same time.
 * If the farmer speaks while the app is talking, the app stops and keeps listening (barge-in).
 * If the app finishes, the mic stays open for the farmer's reply.
 * Returns {text, error, interrupted}
 */
export async function speakAndListen(text, { lang = 'hi', onInterim, onListening, onBargeIn, bargeIn = true, listenAfter = true, silenceMs, startTimeoutMs, doneWhen } = {}) {
  if (!listenAfter) { await speak(text, lang); return { text: '', error: 'muted', interrupted: false }; }
  if (!bargeIn || !sttSupported() || !canTalkOver()) {
    await speak(text, lang);
    onListening?.(true);
    const r = await listen({ lang, onInterim, silenceMs, startTimeoutMs, doneWhen });
    onListening?.(false);
    return { ...r, interrupted: false };
  }
  let interrupted = false;
  const sp = speak(text, lang).then(() => onListening?.(true));
  const r = await listen({
    lang, onInterim, silenceMs, startTimeoutMs, doneWhen, filterEcho: true,
    onSpeech: () => {
      if (isSpeaking()) { interrupted = true; stopSpeaking(); onBargeIn?.(); }
      onListening?.(true);
    },
  });
  await sp.catch(() => {});
  onListening?.(false);
  return { ...r, interrupted };
}

/* ============================== Ask with retry (onboarding) ============================== */

const RETRY = {
  hi: ['माफ़ कीजिए, मैं आपको सुन नहीं पाई। कृपया दोबारा बोलिए।', 'फिर से थोड़ा धीरे और साफ़ बोलिए।', 'अभी भी साफ़ नहीं सुनाई दिया। आप नीचे लिखकर भी बता सकते हैं।'],
  en: ["Sorry, I couldn't hear you. Please say that again.", 'Please speak a little slower and clearer.', 'Still not clear. You can also type it below.'],
};

/**
 * Ask by voice until we get a usable answer. The farmer may answer while the question is still being read.
 * validate(text) => {ok:true, value} | {ok:false, reask?}
 * Returns {ok, value, text} or {ok:false, reason:'gave_up'|'denied'}
 */
export async function askWithRetry(question, { lang = 'hi', validate = (t) => ({ ok: !!t, value: t }), tries = 3, onCaption, onListening, silenceMs = 1800, doneWhen } = {}) {
  let say = question;
  for (let attempt = 0; attempt < tries; attempt++) {
    onCaption?.({ who: 'ai', text: say, final: true });
    const r = await speakAndListen(say, {
      lang, silenceMs, onListening, doneWhen,
      bargeIn: bargeInEnabled(),
      onInterim: (t) => onCaption?.({ who: 'user', text: t, final: false }),
    });
    if (r.error === 'not-allowed') return { ok: false, reason: 'denied' };
    if (r.text) {
      onCaption?.({ who: 'user', text: r.text, final: true });
      const v = await validate(r.text);
      if (v?.ok) return { ok: true, value: v.value, text: r.text };
      say = v?.reask || RETRY[lang][Math.min(attempt, 2)];
      continue;
    }
    say = RETRY[lang][Math.min(attempt, 2)];
  }
  onCaption?.({ who: 'ai', text: RETRY[lang][2], final: true });
  return { ok: false, reason: 'gave_up' };
}

/* ============================== Yes / no ============================== */
// Devanagari has no \b word boundary in JS, so short words use (^|\s)...(\s|$)
const YES = /\b(haan|ha|haa|han|ji haan|jee|ji|yes|yeah|yep|ok|okay|theek|thik|sahi|bilkul|kar do|karo|confirm|correct)\b|हाँ|हां|(^|\s)(हा|जी)(\s|$|[,।])|ठीक|सही|बिल्कुल|कर दो|करो|ओके|यस/i;
const NO = /\b(nahi|nahin|na|no|nope|mat|cancel|galat|ruko|wrong)\b|नहीं|नही|(^|\s)(ना|मत)(\s|$|[,।])|गलत|ग़लत|रुको|कैंसिल|नो/i;
export function yesNo(text = '') {
  const t = text.toLowerCase();
  if (/(हाँ|हां)\s*या\s*(ना|नहीं)|haan ya na|yes or no/i.test(t)) return null; // the app's own question echoed back
  if (NO.test(t)) return 'no';
  if (YES.test(t)) return 'yes';
  return null;
}
