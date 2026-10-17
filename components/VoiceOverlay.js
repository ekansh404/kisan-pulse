'use client';
// Full-screen voice conversation. Opens when the giant mic is tapped.
// Loop: listen -> /api/chat -> speak -> listen again (hands-free). Big captions at the bottom.
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { listen, speak, stopListening, stopSpeaking, submitTyped, yesNo, sttSupported } from '@/lib/voice';
import { t } from '@/lib/i18n';

export default function VoiceOverlay({ open, onClose, farmer, lang = 'hi', firstQuestion }) {
  const L = t(lang);
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [userCap, setUserCap] = useState('');
  const [aiCap, setAiCap] = useState('');
  const [card, setCard] = useState(null);
  const [pending, setPending] = useState(null);
  const [typed, setTyped] = useState('');
  const history = useRef([]);
  const alive = useRef(false);
  const pendingRef = useRef(null);
  pendingRef.current = pending;

  useEffect(() => {
    if (!open) return;
    alive.current = true;
    setUserCap(''); setCard(null); setPending(null);
    setAiCap(sttSupported() ? '' : L.noMic);
    if (firstQuestion) { setUserCap(firstQuestion); handleText(firstQuestion); }
    else turn({ userTapped: true });
    return () => { alive.current = false; stopListening(); stopSpeaking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function say(text) {
    setAiCap(text);
    setState('speaking');
    await speak(text, lang);
    if (alive.current) setState('idle');
  }

  // One listening turn. userTapped=true means the farmer pressed the mic, so we retry once if we heard nothing.
  async function turn({ userTapped = false, retried = false } = {}) {
    if (!alive.current) return;
    await new Promise((r) => setTimeout(r, 250)); // let the speaker go quiet before the mic opens
    if (!alive.current) return;
    setState('listening');
    setUserCap('');
    const r = await listen({ lang, onInterim: setUserCap });
    if (!alive.current) return;
    if (r.error === 'not-allowed') { setState('idle'); setAiCap(L.noMic); return; }
    if (!r.text) {
      setState('idle');
      if (userTapped && !retried) {
        await say(lang === 'en' ? "Sorry, I couldn't hear you. Please speak again." : 'माफ़ कीजिए, मैं आपको सुन नहीं पाई। कृपया दोबारा बोलिए।');
        return turn({ userTapped: true, retried: true });
      }
      return; // stay idle, farmer taps the orb to talk again
    }
    setUserCap(r.text);
    await handleText(r.text);
  }

  async function handleText(text) {
    // 1) A pending action waiting for "haan ya na"
    const p = pendingRef.current;
    if (p) {
      const yn = yesNo(text);
      if (yn === 'yes') return confirm(true);
      if (yn === 'no') return confirm(false);
      // not a yes/no: drop the pending action and treat as a new question
      setPending(null);
    }
    // 2) Ask the brain
    setState('thinking');
    setCard(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId: farmer?.id, farmer, lang, message: text, history: history.current }),
      });
      const data = await res.json();
      if (!alive.current) return;
      history.current = [...history.current, { role: 'user', text }, { role: 'assistant', text: data.reply }].slice(-12);
      setCard(data.cards?.[0] || null);
      setPending(data.pending || null);
      await say(data.reply);
    } catch {
      await say(L.offline);
    }
    // hands-free: listen again after answering
    if (alive.current) turn({ userTapped: false });
  }

  async function confirm(yes) {
    const p = pendingRef.current;
    setPending(null);
    if (!yes || !p) { await say(L.cancelled); if (alive.current) turn(); return; }
    setState('thinking');
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId: farmer?.id, type: p.type, partnerId: p.partnerId, payload: p.payload }),
      });
      const out = await res.json();
      const msg = out.ok ? (lang === 'en' ? out.message_en : out.message_hi) : (lang === 'en' ? 'Could not save. Please try again.' : 'सेव नहीं हो पाया, दोबारा कोशिश करें।');
      history.current = [...history.current, { role: 'assistant', text: msg }];
      await say(msg);
    } catch {
      await say(L.offline);
    }
    if (alive.current) turn();
  }

  function orbTap() {
    if (state === 'listening') { stopListening(); return; }
    if (state === 'speaking') { stopSpeaking(); setState('idle'); return; }
    if (state === 'idle') turn({ userTapped: true });
  }

  function sendTyped(e) {
    e.preventDefault();
    const v = typed.trim();
    if (!v) return;
    setTyped('');
    setUserCap(v);
    if (state === 'listening') submitTyped(v); // resolves the active listen()
    else { stopSpeaking(); handleText(v); }
  }

  function close() {
    alive.current = false;
    stopListening(); stopSpeaking();
    onClose?.();
  }

  if (!open) return null;
  const status = { idle: L.tapMic, listening: L.listening, thinking: L.thinking, speaking: L.speaking }[state];

  return (
    <div className="vo" role="dialog" aria-modal="true" aria-label="Voice assistant">
      <div className="vo-top">
        <span className="vo-status" aria-live="polite">{status}</span>
        <button className="vo-close" onClick={close} aria-label={L.close}><Icon name="x" /></button>
      </div>

      <div className="vo-mid">
        <button className={`orb ${state}`} onClick={orbTap} aria-label={status}>
          <Icon name={state === 'speaking' ? 'spk' : 'mic'} />
        </button>
        {card && <MiniCard card={card} lang={lang} />}
        {pending && (
          <div className="vo-confirm">
            <button className="btn y" onClick={() => confirm(true)}><Icon name="check" />{L.yes}</button>
            <button className="btn alt" onClick={() => confirm(false)}><Icon name="x" />{L.no}</button>
          </div>
        )}
      </div>

      <div className="caps" aria-live="polite">
        {userCap && (<div><p className="cap-label">{lang === 'en' ? 'You' : 'आप'}</p><p className="cap-user">{userCap}</p></div>)}
        {aiCap && (<div><p className="cap-label">Kisan Pulse</p><p className="cap-ai">{aiCap}</p></div>)}
      </div>

      <form className="vo-type" onSubmit={sendTyped}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={L.typeInstead} aria-label={L.typeInstead} />
        <button type="submit" aria-label={L.send}><Icon name="send" /></button>
      </form>
    </div>
  );
}

// Small visual summary under the orb for weather / mandi / schemes / partners
function MiniCard({ card, lang }) {
  const en = lang === 'en';
  const d = card.data;
  if (card.kind === 'weather') {
    return (
      <div className="vo-card">
        <div className="row sb"><b className="h3">{d.place}</b><b className="h2">{d.current?.temp}°</b></div>
        <div className="row" style={{ gap: 6 }}>
          {d.days?.slice(0, 4).map((x, i) => (
            <div key={x.date} className="day"><span>{en ? ['Today', 'Tmrw', 'Day 3', 'Day 4'][i] : ['आज', 'कल', 'परसों', 'चौथा'][i]}</span><b>{x.max}°</b><span className="mut" style={{ fontSize: 12 }}>{x.rain_mm}mm</span></div>
          ))}
        </div>
        <p className="tiny">Open-Meteo</p>
      </div>
    );
  }
  if (card.kind === 'mandi') {
    return (
      <div className="vo-card">
        <div className="row sb"><b className="h3">{d.commodity}</b><span className="chip c-gr">₹/क्विंटल</span></div>
        {d.markets?.slice(0, 3).map((m) => (
          <div key={m.market + m.variety} className="row sb"><span className="p">{m.market}</span><b>₹{m.modal}</b></div>
        ))}
        <p className="tiny">Agmarknet · {d.date}{d.stale ? ' · cached' : ''}</p>
      </div>
    );
  }
  if (card.kind === 'schemes') {
    return (
      <div className="vo-card">
        {d.filter((s) => s.status === 'eligible').slice(0, 4).map((s) => (
          <div key={s.id} className="row sb"><span className="p">{s.name}</span><span className="chip c-ok">{en ? 'Eligible' : 'पात्र'}</span></div>
        ))}
      </div>
    );
  }
  if (card.kind === 'partners') {
    return (
      <div className="vo-card">
        {d.map((p) => (
          <div key={p.id} className="row sb"><span className="p">{p.name}{p.km != null ? ` · ${p.km} km` : ''}</span>{p.rate && <b>₹{p.rate}/{p.unit}</b>}</div>
        ))}
        <p className="tiny">{en ? 'Demo partners' : 'डेमो पार्टनर'}</p>
      </div>
    );
  }
  return null;
}
