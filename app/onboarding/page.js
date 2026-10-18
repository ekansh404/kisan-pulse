'use client';
// VOICE ONBOARDING
// 1 Namaskar + language  2 name  3 mobile + OTP  -> returning farmer? welcome back -> home
// new farmer: 4 village/district  5 land  6 crops  7 Farmer ID (simulated)  8 consent  9 save -> home
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import AiLoader from '@/components/ui/ai-loader';
import { askWithRetry, speak, submitTyped, yesNo, stopListening, cancelListening, stopSpeaking, isSpeaking } from '@/lib/voice';
import { setFarmer, setLang as saveLang } from '@/lib/session';
import { parsePhone, parseOtp, detectLang, toAcres, extract, parseName, parseLand, parseCrops, placeCandidates } from '@/lib/onboarding';
import { sendOtp, verifyOtp, OTP_MODE, OTP_LEN, DEMO_OTP } from '@/lib/firebase';

// Everything the assistant says, in both languages
const S = {
  hi: {
    lang: 'नमस्कार! मैं किसान पल्स हूँ, आपकी खेती की साथी। आप हिंदी में बात करेंगे या English में?',
    langRe: 'कृपया "हिंदी" या "English" बोलिए।',
    name: 'आपका शुभ नाम क्या है?',
    nameOk: (n) => `आपका नाम ${n} है, सही है? हाँ या ना?`,
    nameRe: 'माफ़ कीजिए, नाम साफ़ नहीं सुनाई दिया। सिर्फ़ अपना नाम बोलिए।',
    phone: (n) => `${n} जी, अपना दस अंकों का मोबाइल नंबर बोलिए।`,
    phoneRe: 'नंबर पूरा नहीं मिला। दस अंक एक-एक करके धीरे बोलिए।',
    phoneOk: (p) => `आपका नंबर ${p.split('').join(' ')} है, सही है? हाँ या ना?`,
    otpSent: OTP_MODE === 'demo' ? `डेमो के लिए आपका OTP ${DEMO_OTP.split('').join(' ')} है। OTP बोलिए।` : 'आपके फ़ोन पर छह अंकों का OTP भेजा है। वो OTP बोलिए।',
    otpFail: 'OTP भेजने में दिक्कत आई। एक बार फिर कोशिश करते हैं।',
    otpRe: `OTP ${OTP_LEN} अंकों का होता है। फिर से बोलिए।`,
    otpWrong: 'यह OTP गलत है। दोबारा बोलिए।',
    welcomeBack: (n) => `${n} जी, आपका दोबारा स्वागत है! चलिए, होम पेज पर चलते हैं।`,
    newUser: 'आप नए हैं। बस चार छोटे सवाल, फिर आपका पंजीकरण हो जाएगा।',
    place: 'आपका गाँव और ज़िला कौन सा है?',
    placeRe: 'माफ़ कीजिए, यह जगह नहीं मिली। सिर्फ़ अपने ज़िले का नाम बोलिए।',
    placeOk: (d, s) => `आप ${d} ज़िला, ${s} से हैं, सही है? हाँ या ना?`,
    land: 'आपके पास कितनी ज़मीन है? बीघा या एकड़ में बताइए।',
    landRe: 'ज़मीन कितनी है, जैसे "पाँच बीघा" या "दो एकड़" बोलिए।',
    landOk: (v, u, a) => `${v} ${u}, यानी लगभग ${a} एकड़। सही है? हाँ या ना?`,
    crops: 'आप कौन-कौन सी फसल उगाते हैं?',
    cropsRe: 'फसल का नाम बोलिए, जैसे गेहूं, धान, गन्ना।',
    fid: 'क्या आपके पास किसान ID यानी Farmer ID है? हाँ या ना?',
    fidNum: 'अपनी किसान ID बोलिए।',
    fidMade: 'ठीक है, मैंने आपकी डेमो किसान ID बना दी है। असली ID AgriStack से जुड़ने पर बनेगी।',
    fidOk: 'धन्यवाद। आपकी ID की जाँच डेमो में हो गई।',
    consent: 'आपकी जानकारी सिर्फ़ खेती की सलाह, मौसम चेतावनी और सरकारी योजनाओं के लिए इस्तेमाल होगी। आपकी मंज़ूरी के बिना किसी को नहीं दी जाएगी। क्या आप सहमति देते हैं? हाँ या ना?',
    noConsent: 'कोई बात नहीं। बिना सहमति के मैं आपकी जानकारी सेव नहीं करूँगी। आप जब चाहें फिर से शुरू कर सकते हैं।',
    saved: (n) => `बधाई हो ${n} जी, आपका पंजीकरण हो गया! अब होम पेज पर आपके मौसम की चेतावनी और बड़ा माइक मिलेगा।`,
    error: 'सर्वर से जुड़ने में दिक्कत आई। कृपया इंटरनेट देखकर फिर से शुरू कीजिए।',
    yn: 'कृपया हाँ या ना में बताइए।',
    start: 'शुरू करें', title: 'किसान पल्स', sub: 'बोलकर पंजीकरण करें',
  },
  en: {
    lang: 'Namaskar! I am Kisan Pulse, your farming companion. Would you like to talk in Hindi or English?',
    langRe: 'Please say "Hindi" or "English".',
    name: 'What is your name?',
    nameOk: (n) => `Your name is ${n}, right? Yes or no?`,
    nameRe: "Sorry, I didn't catch your name. Please say only your name.",
    phone: (n) => `${n} ji, please say your 10 digit mobile number.`,
    phoneRe: 'I did not get all ten digits. Please say them slowly, one by one.',
    phoneOk: (p) => `Your number is ${p.split('').join(' ')}, right? Yes or no?`,
    otpSent: OTP_MODE === 'demo' ? `For the demo, your OTP is ${DEMO_OTP.split('').join(' ')}. Please say the OTP.` : 'I have sent a six digit OTP to your phone. Please say the OTP.',
    otpFail: 'There was a problem sending the OTP. Let us try once more.',
    otpRe: `The OTP has ${OTP_LEN} digits. Please say it again.`,
    otpWrong: 'That OTP is wrong. Please say it again.',
    welcomeBack: (n) => `Welcome back, ${n} ji! Taking you to the home page.`,
    newUser: 'You are new here. Just four short questions and you are registered.',
    place: 'Which village and district are you from?',
    placeRe: 'Sorry, I could not find that place. Please say only your district name.',
    placeOk: (d, s) => `You are from ${d} district, ${s}, right? Yes or no?`,
    land: 'How much land do you have? In bigha or acres.',
    landRe: 'Please say the land, like "five bigha" or "two acres".',
    landOk: (v, u, a) => `${v} ${u}, that is about ${a} acres. Right? Yes or no?`,
    crops: 'Which crops do you grow?',
    cropsRe: 'Please say the crop names, like wheat, paddy, sugarcane.',
    fid: 'Do you have a Farmer ID? Yes or no?',
    fidNum: 'Please say your Farmer ID.',
    fidMade: 'Okay, I have created a demo Farmer ID for you. The real ID comes from AgriStack.',
    fidOk: 'Thank you. Your ID is verified in demo mode.',
    consent: 'Your details will be used only for farming advice, weather alerts and government schemes, and will not be shared without your permission. Do you agree? Yes or no?',
    noConsent: 'No problem. Without your consent I will not save your details. You can start again anytime.',
    saved: (n) => `Congratulations ${n} ji, you are registered! The home page has your weather alerts and the big mic.`,
    error: 'Could not reach the server. Please check the internet and start again.',
    yn: 'Please answer yes or no.',
    start: 'Start', title: 'Kisan Pulse', sub: 'Register by voice',
  },
};

const STEPS = ['भाषा', 'नाम', 'मोबाइल', 'गाँव', 'ज़मीन', 'फसल', 'ID', 'सहमति'];

export default function Onboarding() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [listening, setListening] = useState(false);
  const [aiCap, setAiCap] = useState('');
  const [userCap, setUserCap] = useState('');
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState('');
  const langRef = useRef('hi');

  const onCaption = ({ who, text }) => (who === 'ai' ? (setAiCap(text), setUserCap('')) : setUserCap(text));

  // Ask until we get a valid answer (the farmer can always type instead).
  // silenceMs: how long a pause ends the answer. Numbers get longer (people pause between digits).
  // doneWhen: stop listening the moment the answer is complete (OTP digits, हाँ/ना) instead of waiting for silence
  async function ask(q, validate, silenceMs = 1800, doneWhen) {
    for (;;) {
      const r = await askWithRetry(q, { lang: langRef.current, validate, onCaption, onListening: setListening, silenceMs, doneWhen });
      if (r.ok) return r.value;
      if (r.reason === 'denied') throw new Error(langRef.current === 'en' ? 'Microphone permission denied. Allow the mic in Chrome, or type below.' : 'माइक की अनुमति नहीं मिली। Chrome में माइक Allow करें या नीचे लिखें।');
      q = langRef.current === 'en' ? 'You can also type the answer below. ' + q : 'आप नीचे लिखकर भी जवाब दे सकते हैं। ' + q;
    }
  }
  const yn = (text) => { const v = yesNo(text); return v ? { ok: true, value: v } : { ok: false, reask: S[langRef.current].yn }; };
  const askYN = (q) => ask(q, yn, 1800, (t) => !!yesNo(t));
  const tell = async (text) => { setAiCap(text); setUserCap(''); setListening(false); await speak(text, langRef.current); };
  const fail = async (T, why) => {
    setProblem(why || '');
    await tell(T.error);
  };

  async function run() {
    setStarted(true);
    setProblem('');
    try {
      // 1. Namaskar + language (asked in Hindi). Anything said in Hindi counts as Hindi.
      setStep(0);
      const lang = await ask(S.hi.lang, (t) => {
        const l = detectLang(t) || (/[ऀ-ॿ]/.test(t) ? 'hi' : null);
        return l ? { ok: true, value: l } : { ok: false, reask: S.hi.langRe };
      }, 1500, (t) => !!detectLang(t));
      langRef.current = lang;
      saveLang(lang);
      const T = S[lang];

      // 2. Name (local parse first, AI only if needed; read back to confirm)
      setStep(1);
      let name;
      for (;;) {
        name = await ask(T.name, async (t) => {
          const local = parseName(t);
          if (local) return { ok: true, value: local };
          const x = await extract('name', t, lang);
          return x.ok && x.value ? { ok: true, value: x.value } : { ok: false, reask: T.nameRe };
        });
        if ((await askYN(T.nameOk(name))) === 'yes') break;
      }

      // 3. Mobile + OTP (longer pause allowed while saying digits)
      setStep(2);
      let phone;
      for (;;) {
        phone = await ask(T.phone(name), async (t) => {
          const p = parsePhone(t) || (await extract('phone', t, lang).then((x) => (x.ok ? parsePhone(String(x.value)) : null)));
          return p ? { ok: true, value: p } : { ok: false, reask: T.phoneRe };
        }, 2800, (t) => !!parsePhone(t));
        if ((await askYN(T.phoneOk(phone))) === 'yes') break;
      }
      let sent = await sendOtp(phone);
      if (!sent.ok) { await tell(T.otpFail); sent = await sendOtp(phone); }
      if (!sent.ok) { await fail(T, 'OTP: ' + (sent.error || 'send failed')); return; }

      let proof = null;
      for (let i = 0; i < 4 && !proof; i++) {
        const code = await ask(i === 0 ? T.otpSent : T.otpWrong, async (t) => {
          const c = parseOtp(t, OTP_LEN) || (await extract('otp', t, lang).then((x) => (x.ok ? parseOtp(String(x.value), OTP_LEN) : null)));
          return c ? { ok: true, value: c } : { ok: false, reask: T.otpRe };
        }, 2800, (t) => !!parseOtp(t, OTP_LEN));
        const v = await verifyOtp(code);
        if (v.ok) proof = v.proof;
      }
      if (!proof) { await fail(T, 'OTP not verified'); return; }

      // Returning farmer? -> welcome back -> home
      const login = await post({ action: 'login', phone, proof });
      if (!login.ok) { await fail(T, 'Login: ' + (login.error || 'server error')); return; }
      if (login.exists) {
        setFarmer({ ...login.farmer, lang });
        return goHome('back'); // home greets "दोबारा स्वागत है" with today's weather, no extra wait here
      }

      // ---------- New farmer: registration ----------
      await tell(T.newUser);

      // 4. Village / district -> real geocoding (Hindi names mapped locally, AI as backup)
      setStep(3);
      let place;
      for (;;) {
        place = await ask(T.place, async (t) => {
          let g = null;
          let village = null;
          const cands = placeCandidates(t).slice(0, 4);
          for (const c of cands) {
            g = await geo(c);
            if (g) { village = c; break; }
          }
          if (!g) {
            const x = await extract('place', t, lang);
            if (x.ok) {
              g = (x.value.village && (await geo(x.value.village))) || (x.value.district && (await geo(x.value.district)));
              village = x.value.village || x.value.district;
            }
          }
          if (!g) return { ok: false, reask: T.placeRe };
          const alts = (g.candidates || []).slice(1).filter((c) => c.lat != null);
          return { ok: true, value: { village: village || g.name, district: g.district || g.name, state: g.state || '', lat: g.lat, lon: g.lon, alts } };
        });
        // Same name exists in many states: on "ना", offer the next match before asking again
        let confirmed = false;
        for (const opt of [place, ...(place.alts || []).map((c) => ({ village: place.village, district: c.district, state: c.state, lat: c.lat, lon: c.lon }))].slice(0, 3)) {
          if ((await askYN(T.placeOk(opt.district, opt.state || 'India'))) === 'yes') { place = opt; confirmed = true; break; }
        }
        if (confirmed) break;
      }
      delete place.alts;
      prefetchWeather(place.lat, place.lon, lang); // ready before home opens

      // 5. Land
      setStep(4);
      let land;
      for (;;) {
        land = await ask(T.land, async (t) => {
          const local = parseLand(t);
          if (local) return { ok: true, value: local };
          const x = await extract('land', t, lang);
          return x.ok && Number(x.value?.value) > 0 ? { ok: true, value: x.value } : { ok: false, reask: T.landRe };
        }, 2200);
        land.acres = toAcres(land.value, land.unit);
        const unitWord = lang === 'en' ? land.unit : { bigha: 'बीघा', acre: 'एकड़', hectare: 'हेक्टेयर', biswa: 'बिस्वा' }[land.unit] || land.unit;
        if ((await askYN(T.landOk(land.value, unitWord, land.acres))) === 'yes') break;
      }

      // 6. Crops
      setStep(5);
      const crops = await ask(T.crops, async (t) => {
        const local = parseCrops(t);
        if (local.length) return { ok: true, value: local };
        const x = await extract('crops', t, lang);
        return x.ok && x.value?.length ? { ok: true, value: x.value } : { ok: false, reask: T.cropsRe };
      }, 2200);

      // 7. Farmer ID (SIMULATED — real AgriStack verification needs a state MoU)
      setStep(6);
      let farmer_id_sim;
      if ((await askYN(T.fid)) === 'yes') {
        farmer_id_sim = await ask(T.fidNum, async (t) => {
          const id = t.replace(/[^a-z0-9]/gi, '').toUpperCase();
          return id.length >= 4 ? { ok: true, value: id } : { ok: false };
        }, 2800);
        await tell(T.fidOk);
      } else {
        farmer_id_sim = 'SIM-' + ((place.state || 'IN').split(/\s+/).map((w) => w[0]).join('').toUpperCase() || 'IN') + '-' + Math.floor(10000000 + Math.random() * 89999999);
        await tell(T.fidMade);
      }

      // 8. Consent
      setStep(7);
      if ((await askYN(T.consent)) !== 'yes') { await tell(T.noConsent); setStarted(false); return; }

      // 9. Save -> home
      const reg = await post({
        action: 'register', phone, proof,
        profile: { name, lang, ...place, land_value: land.value, land_unit: land.unit, land_acres: land.acres, crops, farmer_id_sim },
      });
      if (!reg.ok || !reg.farmer) { await fail(T, 'Register: ' + (reg.error || 'server error')); return; }
      setFarmer({ ...reg.farmer, lang });
      goHome('new'); // home says "बधाई हो… पंजीकरण सफल" + weather + what to ask, straight away
    } catch (e) {
      console.error(e);
      setProblem(String(e?.message || e));
      await tell(S[langRef.current].error);
    }
  }

  // Go to home. If the router doesn't move (old cached page), force a full load.
  function goHome(intro) {
    cancelListening(); stopSpeaking();
    try { if (intro) sessionStorage.setItem('kp_intro', intro); } catch {}
    router.replace('/');
    setTimeout(() => { if (location.pathname.startsWith('/onboarding')) location.href = '/'; }, 1500);
  }

  function send(e) {
    e.preventDefault();
    if (!typed.trim()) return;
    submitTyped(typed);
    setTyped('');
  }

  // Tap the orb: while it talks = skip to answering; while listening = "I'm done"
  function orbTap() {
    if (isSpeaking()) stopSpeaking();
    else stopListening();
  }

  // Reviewers / judges: skip onboarding with a ready demo profile. Profile is sample data,
  // but everything after it (weather, mandi, schemes, AI answers) is fetched live for Lucknow.
  const [guestBusy, setGuestBusy] = useState(false);
  async function continueAsGuest() {
    if (guestBusy) return;
    setGuestBusy(true);
    const profile = {
      name: 'देव सिंह', lang: 'hi', village: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh',
      lat: 26.8467, lon: 80.9462, land_value: 2, land_unit: 'acre', land_acres: 2,
      crops: ['wheat', 'potato', 'mustard'], farmer_id_sim: 'SIM-UP-GUEST01',
    };
    let farmer = { id: null, phone: '+919000000001', ...profile };
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch('/api/farmer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ action: 'register', phone: '9000000001', proof: { demo: DEMO_OTP || '1234' }, profile }),
      }).then((x) => x.json());
      clearTimeout(t);
      if (r?.ok && r.farmer) farmer = r.farmer; // saved guest row -> bookings work too
    } catch {}
    saveLang('hi');
    setFarmer({ ...farmer, lang: 'hi', guest: true });
    prefetchWeather(profile.lat, profile.lon, 'hi');
    goHome('');
  }

  const T = S[langRef.current];

  if (!started) {
    // A tap is required before the browser allows mic + speech
    return (
      <main className="vo" style={{ position: 'fixed' }}>
        <div className="vo-mid" style={{ gap: 22 }}>
          <img className="ob-logo" src="/logo.png" alt="Kisan Pulse" />
          <p className="h1" style={{ color: 'var(--deep)', fontSize: 36 }}>{T.title}</p>
          <p className="p" style={{ color: 'var(--mut)', textAlign: 'center' }}>बोलकर पंजीकरण करें · Register by voice</p>
          <button className="orb" onClick={run} aria-label={T.start}><Icon name="mic" /></button>
          <p className="h2" style={{ color: 'var(--earth)' }}>{T.start} · Start</p>
          <button className="btn guest-btn" onClick={continueAsGuest} disabled={guestBusy}>
            {guestBusy ? 'खुल रहा है… Opening…' : (<>Continue as Guest<small>अतिथि के रूप में जारी रखें</small></>)}
          </button>
          <button className="guest-skip" onClick={continueAsGuest} disabled={guestBusy}>पंजीकरण छोड़ें · Skip onboarding (demo: देव सिंह, Lucknow, 2 acre)</button>
        </div>
        <div id="recaptcha" />
      </main>
    );
  }

  return (
    <main className="vo" style={{ position: 'fixed' }}>
      <div className="vo-top">
        <div className="row" style={{ gap: 6 }} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          <img src="/logo.png" alt="" style={{ width: 30, height: 36, objectFit: 'contain', marginRight: 4 }} />
          {STEPS.map((s, i) => (
            <span key={s} style={{ width: 22, height: 6, borderRadius: 3, background: i <= step ? 'var(--leaf)' : 'var(--line)' }} />
          ))}
        </div>
        <button className="vo-close" onClick={() => { cancelListening(); stopSpeaking(); location.reload(); }} aria-label="Restart"><Icon name="x" /></button>
      </div>
      <div className="vo-mid">
        {listening ? (
          <button className="orb listening" onClick={orbTap} aria-label="Tap when done"><Icon name="mic" /></button>
        ) : (
          <button className="orb-loader" onClick={orbTap} aria-label="Skip">
            <AiLoader size={176} text={langRef.current === 'en' ? 'Speaking' : 'बोल रही हूँ'} />
          </button>
        )}
        <p className="vo-status">{listening ? (langRef.current === 'en' ? 'Listening… speak now (tap when done)' : 'सुन रही हूँ… बोलिए (पूरा होने पर दबाएँ)') : ''}</p>
        {problem && (
          <div className="vo-card" role="alert">
            <p className="p" style={{ fontSize: 14 }}>{problem}</p>
            <button className="btn sm" onClick={run}>{langRef.current === 'en' ? 'Try again' : 'फिर से शुरू करें'}</button>
          </div>
        )}
      </div>
      <div className="caps" aria-live="polite">
        {userCap && <div><p className="cap-label">{langRef.current === 'en' ? 'You' : 'आप'}</p><p className="cap-user">{userCap}</p></div>}
        {aiCap && <div><p className="cap-label">Kisan Pulse</p><p className="cap-ai">{aiCap}</p></div>}
      </div>
      <form className="vo-type" onSubmit={send}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={langRef.current === 'en' ? 'or type here…' : 'या यहाँ लिखें…'} aria-label="Type answer" />
        <button type="submit" aria-label="Send"><Icon name="send" /></button>
      </form>
      <div id="recaptcha" />
    </main>
  );
}

async function post(body) {
  try {
    const r = await fetch('/api/farmer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ok: false, error: j.error || 'HTTP ' + r.status };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}
function prefetchWeather(lat, lon, lang) {
  fetch(`/api/weather?lat=${lat}&lon=${lon}&lang=${lang}`)
    .then((r) => r.json())
    .then((w) => { if (!w.error) sessionStorage.setItem('kp_weather', JSON.stringify({ w, lang, at: Date.now() })); })
    .catch(() => {});
}
async function geo(q) {
  try {
    const r = await fetch('/api/geocode?q=' + encodeURIComponent(q));
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
