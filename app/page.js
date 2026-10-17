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

  // Real weather + alerts for the farmer's location
  useEffect(() => {
    if (!farmer?.lat) return;
    setWeatherError(false);
    fetch(`/api/weather?lat=${farmer.lat}&lon=${farmer.lon}&lang=${lang}`)
      .then((r) => r.json())
      .then((w) => { if (w.error) setWeatherError(true); else setWeather(w); })
      .catch(() => setWeatherError(true));
  }, [farmer, lang]);

  const greetingText = () => {
    if (!farmer) return '';
    const hi = lang !== 'en';
    const a = weather?.alerts || [];
    const alertLine = a.length
      ? (hi ? 'आज की चेतावनी: ' : "Today's alert: ") + a.slice(0, 2).map((x) => `${x.title}. ${x.advice}`).join(' ')
      : weather ? L.noAlerts : '';
    const tail = hi ? 'कुछ भी पूछने के लिए बड़ा माइक दबाइए।' : 'Tap the big mic to ask anything.';
    return `${L.greet(farmer.name)}। ${weather ? (hi ? `अभी ${weather.current.temp} डिग्री, ${weather.current.text}।` : `It is ${weather.current.temp} degrees, ${weather.current.text}.`) : ''} ${alertLine} ${tail}`;
  };

  // Speak greeting + alerts once (browsers may block audio until the first tap; the speaker button replays it)
  useEffect(() => {
    if (!farmer || !weather || greeted.current) return;
    greeted.current = true;
    speak(greetingText(), lang).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmer, weather]);

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
