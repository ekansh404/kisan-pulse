'use client';
// HOME (page 1): greeting + today's alerts + one giant mic. Tapping the mic opens the full-screen voice overlay.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import VoiceOverlay from '@/components/VoiceOverlay';
import Icon from '@/components/Icon';
import useFarmer from '@/components/useFarmer';
import { t } from '@/lib/i18n';
import { speak, isVoiceMuted, setVoiceMuted, onSpeakingChange } from '@/lib/voice';

export default function Home() {
  const router = useRouter();
  const { farmer, lang, setLang, ready } = useFarmer();
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(false);
  const [open, setOpen] = useState(false);
  const [firstQ, setFirstQ] = useState(null);
  const greeted = useRef(false);
  const [muted, setMuted] = useState(false);
  const [talking, setTalking] = useState(false);
  useEffect(() => {
    setMuted(isVoiceMuted());
    const off = onSpeakingChange(setTalking);
    const onMute = (e) => setMuted(!!e.detail);
    window.addEventListener('kp-voice-muted', onMute);
    return () => { off(); window.removeEventListener('kp-voice-muted', onMute); };
  }, []);
  const toggleMute = () => setVoiceMuted(!isVoiceMuted());
  const listenNow = () => { if (isVoiceMuted()) setVoiceMuted(false); speak(weatherBriefing(), lang); };
  const L = t(lang);

  // Not registered on this phone -> voice onboarding
  useEffect(() => {
    if (ready && !farmer) router.replace('/onboarding');
  }, [ready, farmer, router]);

  // Real weather + alerts for the farmer's location (onboarding already fetched it -> instant)
  useEffect(() => {
    if (!farmer?.lat) return;
    setWeatherError(false);
    try {
      const c = JSON.parse(sessionStorage.getItem('kp_weather') || 'null');
      if (c && c.lang === lang && Date.now() - c.at < 30 * 60000) { setWeather(c.w); return; }
    } catch {}
    fetch(`/api/weather?lat=${farmer.lat}&lon=${farmer.lon}&lang=${lang}`)
      .then((r) => r.json())
      .then((w) => {
        if (w.error) return setWeatherError(true);
        setWeather(w);
        try { sessionStorage.setItem('kp_weather', JSON.stringify({ w, lang, at: Date.now() })); } catch {}
      })
      .catch(() => setWeatherError(true));
  }, [farmer, lang]);

  // What the assistant says when home opens: ONE fixed line. Same text every time, so its audio is
  // saved on the phone after the first play (no voice API call again) and no weather call is waited for.
  const staticGreeting = (intro = '') => {
    if (!farmer) return '';
    const n = farmer.name;
    if (lang === 'en') {
      const ask = 'How may I help you?';
      if (intro === 'new') return `Congratulations ${n} ji, you are registered! ${ask}`;
      if (intro === 'back') return `Welcome back, ${n} ji! ${ask}`;
      return `Namaskar ${n} ji, ${ask.toLowerCase()}`;
    }
    const ask = 'मैं आपकी किस प्रकार सहायता कर सकती हूँ?';
    if (intro === 'new') return `बधाई हो ${n} जी, आपका पंजीकरण सफल हो गया! ${ask}`;
    if (intro === 'back') return `${n} जी, आपका दोबारा स्वागत है! ${ask}`;
    return `नमस्कार ${n} जी, ${ask}`;
  };

  // "आज की जानकारी सुनें": today's and tomorrow's weather and rain, plus any weather alerts. Numbers only from the weather API.
  const weatherBriefing = () => {
    const hi = lang !== 'en';
    if (!weather?.current) return hi ? 'माफ़ कीजिए, अभी मौसम की जानकारी नहीं मिल पाई। थोड़ी देर में फिर दबाइए।' : 'Sorry, the weather is not available right now. Please try again in a moment.';
    const place = farmer.district || farmer.village || '';
    const [d0, d1] = weather.days || [];
    const rain = (d) => {
      if (!d) return '';
      const mm = Number(d.rain_mm) || 0;
      const p = d.rain_prob != null ? Number(d.rain_prob) : null;
      if (mm >= 1) return hi ? `लगभग ${Math.round(mm)} मिलीमीटर बारिश हो सकती है${p != null ? `, संभावना ${p} प्रतिशत` : ''}` : `about ${Math.round(mm)} mm of rain is likely${p != null ? `, ${p} percent chance` : ''}`;
      if (p != null && p >= 30) return hi ? `बारिश की संभावना ${p} प्रतिशत है` : `${p} percent chance of rain`;
      return hi ? 'बारिश की उम्मीद नहीं है' : 'no rain expected';
    };
    const parts = [];
    parts.push(hi ? `${place} में अभी ${weather.current.temp} डिग्री है, ${weather.current.text}।` : `In ${place} it is ${weather.current.temp} degrees now, ${weather.current.text}.`);
    if (d0) parts.push(hi ? `आज ${d0.max} डिग्री तक जाएगा, ${rain(d0)}।` : `Today up to ${d0.max} degrees, ${rain(d0)}.`);
    if (d1) parts.push(hi ? `कल ${d1.max} डिग्री तक जाएगा, ${rain(d1)}।` : `Tomorrow up to ${d1.max} degrees, ${rain(d1)}.`);
    const a = weather.alerts || [];
    if (a.length) parts.push((hi ? 'मौसम चेतावनी: ' : 'Weather alert: ') + a.slice(0, 2).map((x) => `${x.title}। ${x.advice}`).join(' '));
    else parts.push(hi ? 'आज मौसम से फसल को कोई ख़तरा नहीं है।' : 'No weather risk for your crops today.');
    return parts.join(' ');
  };

  // Speak the fixed line right away, once per app session (refreshing or coming back to home does not repeat it).
  useEffect(() => {
    if (!farmer || greeted.current) return;
    greeted.current = true;
    let intro = '';
    let done = false;
    try {
      intro = sessionStorage.getItem('kp_intro') || '';
      sessionStorage.removeItem('kp_intro');
      done = !intro && sessionStorage.getItem('kp_greeted') === '1';
      sessionStorage.setItem('kp_greeted', '1');
    } catch {}
    if (!done) speak(staticGreeting(intro), lang, { cache: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmer]);

  if (!ready || !farmer) return null;
  const alerts = weather?.alerts || [];
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-IN' : 'hi-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <Header
        title={L.app}
        sub={L.tagline}
        right={
          <>
            <button className="hb" onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')} aria-label="Language">{lang === 'hi' ? 'EN' : 'हिं'}</button>
            <button className={`hb ${talking && !muted ? 'live' : ''} ${muted ? 'muted' : ''}`} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? (lang === 'en' ? 'Unmute voice' : 'आवाज़ चालू करें') : (lang === 'en' ? 'Mute voice' : 'आवाज़ बंद करें')}>
              <Icon name={muted ? 'spkOff' : 'spk'} />
            </button>
          </>
        }
      />
      <main className="page home">
        <section className="hero rise">
          <div className="hero-top">
            <div style={{ minWidth: 0 }}>
              <p className="eyebrow">{today}</p>
              <p className="h1">{L.greet(farmer.name)}</p>
              <p className="mut">{[farmer.village, farmer.district].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</p>
            </div>
            {weather?.current ? (
              <div className="wx" aria-label="weather">
                <b>{weather.current.temp}°</b>
                <span>{weather.current.text}</span>
              </div>
            ) : (
              <div className="wx ghost" aria-hidden="true"><b>--°</b><span>{weatherError ? (lang === 'en' ? 'No data' : 'उपलब्ध नहीं') : '…'}</span></div>
            )}
          </div>
          {weather?.days?.length > 1 && (
            <div className="wx-days">
              {weather.days.slice(1, 4).map((d, i) => (
                <div key={d.date} className="wx-day">
                  <span>{lang === 'en' ? ['Tomorrow', 'Day 3', 'Day 4'][i] : ['कल', 'परसों', 'नरसों'][i]}</span>
                  <b>{d.max}°</b>
                  <small>{d.rain_mm > 0 ? `${d.rain_mm} mm` : d.text}</small>
                </div>
              ))}
            </div>
          )}
          <button className="listen-chip" onClick={listenNow}>
            <Icon name="spk" />{lang === 'en' ? 'Listen to today' : 'आज की जानकारी सुनें'}
          </button>
        </section>

        {alerts.length ? (
          alerts.slice(0, 2).map((a, i) => (
            <div key={i} className={`alert ${a.level} rise`} role="status" style={{ animationDelay: `${80 + i * 60}ms` }}>
              <span className="alert-ic"><Icon name="alert" /></span>
              <div><p className="h3">{a.title}</p><p className="p" style={{ fontSize: 15 }}>{a.advice}</p></div>
            </div>
          ))
        ) : weather ? (
          <div className="alert ok rise"><span className="alert-ic"><Icon name="check" /></span><p className="p">{L.noAlerts}</p></div>
        ) : null}

        <section className="mic-zone">
          <div className="mic-rings">
            <button className="mic-giant" onClick={() => { setFirstQ(null); setOpen(true); }} aria-label={L.tapMic}>
              <Icon name="mic" />
            </button>
          </div>
          <p className="mic-label">{L.tapMic}</p>
          <div className="examples" role="list">
            {L.examples.map((q) => (
              <button key={q} role="listitem" className="ex" onClick={() => { setFirstQ(q); setOpen(true); }}>{q}</button>
            ))}
          </div>
        </section>
      </main>
      <BottomNav lang={lang} />
      <VoiceOverlay open={open} onClose={() => setOpen(false)} farmer={farmer} lang={lang} firstQuestion={firstQ} />
    </>
  );
}
