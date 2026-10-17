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
import { speak } from '@/lib/voice';

export default function Home() {
  const router = useRouter();
  const { farmer, lang, setLang, ready } = useFarmer();
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(false);
  const [open, setOpen] = useState(false);
  const [firstQ, setFirstQ] = useState(null);
  const greeted = useRef(false);
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
        onSpeak={() => speak(greetingText(), lang)}
        right={<button className="hb" onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')} aria-label="Language">{lang === 'hi' ? 'EN' : 'हिं'}</button>}
      />
      <main className="page">
        <div>
          <p className="h1">{L.greet(farmer.name)}</p>
          <p className="mut">{today} · {farmer.district || farmer.village}{weather ? ` · ${weather.current.temp}°C, ${weather.current.text}` : ''}</p>
        </div>

        {alerts.length ? (
          alerts.slice(0, 2).map((a, i) => (
            <div key={i} className={`alert ${a.level}`} role="status">
              <Icon name="alert" style={{ width: 28, height: 28 }} />
              <div><p className="h3">{a.title}</p><p className="p" style={{ fontSize: 15 }}>{a.advice}</p></div>
            </div>
          ))
        ) : weather ? (
          <div className="alert ok"><Icon name="check" /><p className="p">{L.noAlerts}</p></div>
        ) : weatherError ? (
          <p className="mut weather-soft">{lang === 'en' ? 'Weather is not available right now.' : 'मौसम अभी उपलब्ध नहीं है'}</p>
        ) : null}

        <button className="spk repeat-btn" onClick={() => speak(greetingText(), lang)}>
          <Icon name="spk" />{lang === 'en' ? 'Repeat' : 'दोबारा सुनें'}
        </button>

        <section className="mic-zone">
          <button className="mic-giant" onClick={() => { setFirstQ(null); setOpen(true); }} aria-label={L.tapMic}>
            <Icon name="mic" />
          </button>
          <p className="mic-label">{L.tapMic}</p>
          <div className="examples">
            {L.examples.map((q) => (
              <button key={q} className="ex" onClick={() => { setFirstQ(q); setOpen(true); }}>{q}</button>
            ))}
          </div>
        </section>
      </main>
      <BottomNav lang={lang} />
      <VoiceOverlay open={open} onClose={() => setOpen(false)} farmer={farmer} lang={lang} firstQuestion={firstQ} />
    </>
  );
}
