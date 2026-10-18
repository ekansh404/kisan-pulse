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
  const listenNow = () => { if (isVoiceMuted()) setVoiceMuted(false); speak(greetingText(), lang); };
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

  // What the assistant says when home opens. Right after onboarding it starts with the welcome.
  const greetingText = (intro = '') => {
    if (!farmer) return '';
    const hi = lang !== 'en';
    const name = farmer.name;
    const crop = farmer.crops?.[0];
    const a = weather?.alerts || [];
    const parts = [];
    if (intro === 'new') parts.push(hi ? `बधाई हो ${name} जी, आपका पंजीकरण सफल हो गया!` : `Congratulations ${name} ji, you are registered!`);
    else if (intro === 'back') parts.push(hi ? `${name} जी, आपका दोबारा स्वागत है!` : `Welcome back, ${name} ji!`);
    else parts.push(L.greet(name) + (hi ? '।' : '.'));
    if (weather?.current) {
      const tmr = weather.days?.[1];
      parts.push(hi
        ? `${farmer.district || farmer.village} में अभी ${weather.current.temp} डिग्री है, ${weather.current.text}।${tmr ? ` कल ${tmr.max} डिग्री तक, ${tmr.text}।` : ''}`
        : `In ${farmer.district || farmer.village} it is ${weather.current.temp} degrees, ${weather.current.text}.${tmr ? ` Tomorrow up to ${tmr.max} degrees, ${tmr.text}.` : ''}`);
    }
    if (a.length) parts.push((hi ? 'ध्यान दीजिए: ' : 'Please note: ') + a.slice(0, 2).map((x) => `${x.title}। ${x.advice}`).join(' '));
    else if (weather) parts.push(hi ? `आज ${crop ? 'आपकी फसल के लिए ' : ''}मौसम से कोई ख़तरा नहीं है।` : 'No weather risk for your farm today.');
    parts.push(hi
      ? `आप मुझसे ${crop ? 'अपनी फसल का ' : ''}मंडी भाव, मौसम, सरकारी योजना या ट्रैक्टर के बारे में पूछ सकते हैं। बस बड़ा माइक दबाइए।`
      : 'Ask me about mandi prices, weather, government schemes or a tractor. Just tap the big mic.');
    return parts.join(' ');
  };

  // Speak as soon as home opens: right away if weather is ready, otherwise after at most 1.5 s without it.
  useEffect(() => {
    if (!farmer || greeted.current) return;
    let intro = '';
    try { intro = sessionStorage.getItem('kp_intro') || ''; } catch {}
    const go = () => {
      if (greeted.current) return;
      greeted.current = true;
      try { sessionStorage.removeItem('kp_intro'); } catch {}
      speak(greetingText(intro), lang).catch(() => {});
    };
    if (weather || weatherError) { go(); return; }
    const t = setTimeout(go, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmer, weather, weatherError]);

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
