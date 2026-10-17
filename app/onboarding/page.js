'use client';
// VOICE ONBOARDING
// 1 Namaskar + language  2 name  3 mobile + OTP  -> returning farmer? welcome back -> home
// new farmer: 4 village/district  5 land  6 crops  7 Farmer ID (simulated)  8 consent  9 save -> home
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { askWithRetry, speak, submitTyped, yesNo, stopListening, stopSpeaking } from '@/lib/voice';
import { setFarmer, setLang as saveLang } from '@/lib/session';
import { parsePhone, parseOtp, detectLang, toAcres, extract } from '@/lib/onboarding';
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
  const langRef = useRef('hi');

  const onCaption = ({ who, text }) => (who === 'ai' ? (setAiCap(text), setUserCap('')) : setUserCap(text));

  // ask until we get a valid answer (farmer can always type instead)
  async function ask(q, validate) {
    for (;;) {
      const r = await askWithRetry(q, { lang: langRef.current, validate, onCaption, onListening: setListening });
      if (r.ok) return r.value;
      q = langRef.current === 'en' ? 'You can also type the answer below. ' + q : 'आप नीचे लिखकर भी जवाब दे सकते हैं। ' + q;
    }
  }
  const yn = (text) => { const v = yesNo(text); return v ? { ok: true, value: v } : { ok: false, reask: S[langRef.current].yn }; };
  const tell = async (text) => { setAiCap(text); setUserCap(''); await speak(text, langRef.current); };

  async function run() {
    setStarted(true);
    try {
      // 1. Namaskar + language (always asked in Hindi first)
      setStep(0);
      const lang = await ask(S.hi.lang, (t) => { const l = detectLang(t); return l ? { ok: true, value: l } : { ok: false, reask: S.hi.langRe }; });
      langRef.current = lang;
      saveLang(lang);
      const T = S[lang];

      // 2. Name (repeat back to confirm)
      setStep(1);
      let name;
      for (;;) {
        name = await ask(T.name, async (t) => {
          const words = t.trim().split(/\s+/);
          if (words.length <= 2 && !/naam|नाम|name/i.test(t)) return { ok: true, value: t.trim() };
          const x = await extract('name', t, lang);
          return x.ok && x.value ? { ok: true, value: x.value } : { ok: false, reask: T.nameRe };
        });
        if ((await ask(T.nameOk(name), yn)) === 'yes') break;
      }

      // 3. Mobile + OTP
      setStep(2);
      let phone;
      for (;;) {
        phone = await ask(T.phone(name), async (t) => {
          const p = parsePhone(t) || (await extract('phone', t, lang).then((x) => (x.ok ? parsePhone(String(x.value)) : null)));
          return p ? { ok: true, value: p } : { ok: false, reask: T.phoneRe };
        });
        if ((await ask(T.phoneOk(phone), yn)) === 'yes') break;
      }
      let sent = await sendOtp(phone);
      if (!sent.ok) { await tell(T.otpFail); sent = await sendOtp(phone); }
      if (!sent.ok) { await tell(T.error); return setStarted(false); }

      let proof = null;
      for (let i = 0; i < 4 && !proof; i++) {
        const code = await ask(i === 0 ? T.otpSent : T.otpWrong, async (t) => {
          const c = parseOtp(t, OTP_LEN) || (await extract('otp', t, lang).then((x) => (x.ok ? parseOtp(String(x.value), OTP_LEN) : null)));
          return c ? { ok: true, value: c } : { ok: false, reask: T.otpRe };
        });
        const v = await verifyOtp(code);
        if (v.ok) proof = v.proof;
      }
      if (!proof) { await tell(T.error); return setStarted(false); }

      // Returning farmer? -> greet again and go home
      const login = await post({ action: 'login', phone, proof });
      if (!login.ok) { await tell(T.error); return setStarted(false); }
      if (login.exists) {
        setFarmer({ ...login.farmer, lang });
        await tell(T.welcomeBack(login.farmer.name));
        return router.replace('/');
      }

      // ---------- New farmer: registration ----------
      await tell(T.newUser);

      // 4. Village / district -> real geocoding
      setStep(3);
      let place;
      for (;;) {
        place = await ask(T.place, async (t) => {
          const x = await extract('place', t, lang);
          const v = x.ok ? x.value : { district: t };
          const g = (v.village && (await geo(v.village))) || (v.district && (await geo(v.district)));
          if (!g) return { ok: false, reask: T.placeRe };
          return { ok: true, value: { village: v.village || g.name, district: g.district || v.district, state: g.state || v.state, lat: g.lat, lon: g.lon } };
        });
        if ((await ask(T.placeOk(place.district, place.state), yn)) === 'yes') break;
      }

      // 5. Land
      setStep(4);
      let land;
      for (;;) {
        land = await ask(T.land, async (t) => {
          const x = await extract('land', t, lang);
          return x.ok && Number(x.value?.value) > 0 ? { ok: true, value: x.value } : { ok: false, reask: T.landRe };
        });
        land.acres = toAcres(land.value, land.unit);
        const unitWord = lang === 'en' ? land.unit : { bigha: 'बीघा', acre: 'एकड़', hectare: 'हेक्टेयर', biswa: 'बिस्वा' }[land.unit] || land.unit;
        if ((await ask(T.landOk(land.value, unitWord, land.acres), yn)) === 'yes') break;
      }

      // 6. Crops
      setStep(5);
      const crops = await ask(T.crops, async (t) => {
        const x = await extract('crops', t, lang);
        return x.ok && x.value?.length ? { ok: true, value: x.value } : { ok: false, reask: T.cropsRe };
      });

      // 7. Farmer ID (SIMULATED — real AgriStack verification needs a state MoU)
      setStep(6);
      let farmer_id_sim;
      if ((await ask(T.fid, yn)) === 'yes') {
        farmer_id_sim = await ask(T.fidNum, async (t) => {
          const x = await extract('farmer_id', t, lang);
          return x.ok ? { ok: true, value: String(x.value) } : { ok: false };
        });
        await tell(T.fidOk);
      } else {
        farmer_id_sim = 'SIM-' + (place.state || 'IN').slice(0, 2).toUpperCase() + '-' + Math.floor(10000000 + Math.random() * 89999999);
        await tell(T.fidMade);
      }

      // 8. Consent
      setStep(7);
      if ((await ask(T.consent, yn)) !== 'yes') { await tell(T.noConsent); return setStarted(false); }

      // 9. Save
      const reg = await post({
        action: 'register', phone, proof,
        profile: { name, lang, ...place, land_value: land.value, land_unit: land.unit, land_acres: land.acres, crops, farmer_id_sim },
      });
      if (!reg.ok) { await tell(T.error); return setStarted(false); }
      setFarmer({ ...reg.farmer, lang });
      await tell(T.saved(name));
      router.replace('/');
    } catch (e) {
      console.error(e);
      await tell(S[langRef.current].error);
      setStarted(false);
    }
  }

  function send(e) {
    e.preventDefault();
    if (!typed.trim()) return;
    submitTyped(typed);
    setTyped('');
  }

  const T = S[langRef.current];

  if (!started) {
    // A tap is required before the browser allows mic + speech
    return (
      <main className="vo" style={{ position: 'fixed' }}>
        <div className="vo-mid" style={{ gap: 22 }}>
          <span className="logo" style={{ width: 96, height: 96, borderRadius: 28, background: 'var(--tur)', color: 'var(--ink)', display: 'grid', placeItems: 'center' }}>
            <Icon name="leaf" style={{ width: 54, height: 54 }} />
          </span>
          <p className="h1" style={{ color: '#fff', fontSize: 36 }}>{T.title}</p>
          <p className="p" style={{ color: '#CFE6D3', textAlign: 'center' }}>बोलकर पंजीकरण करें · Register by voice</p>
          <button className="orb" onClick={run} aria-label={T.start}><Icon name="mic" /></button>
          <p className="h2" style={{ color: '#F4E3B0' }}>{T.start} · Start</p>
        </div>
        <div id="recaptcha" />
      </main>
    );
  }

  return (
    <main className="vo" style={{ position: 'fixed' }}>
      <div className="vo-top">
        <div className="row" style={{ gap: 6 }} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} style={{ width: 22, height: 6, borderRadius: 3, background: i <= step ? 'var(--tur)' : 'rgba(255,255,255,.25)' }} />
          ))}
        </div>
        <button className="vo-close" onClick={() => { stopListening(); stopSpeaking(); location.reload(); }} aria-label="Restart"><Icon name="x" /></button>
      </div>
      <div className="vo-mid">
        <span className={`orb ${listening ? 'listening' : 'speaking'}`} aria-hidden="true"><Icon name={listening ? 'mic' : 'spk'} /></span>
        <p className="vo-status">{listening ? (langRef.current === 'en' ? 'Listening… speak now' : 'सुन रही हूँ… अब बोलिए') : ''}</p>
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
    return await r.json();
  } catch {
    return { ok: false };
  }
}
async function geo(q) {
  try {
    const r = await fetch('/api/geocode?q=' + encodeURIComponent(q));
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}