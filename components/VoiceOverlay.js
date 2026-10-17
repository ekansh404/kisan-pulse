'use client';
// Full-screen two-way voice conversation (opens from the giant mic).
// - The mic stays open while the assistant talks: start speaking and it stops (barge-in).
// - A pause of ~1.8 s (not 0.5 s) ends your turn, so short breaks don't cut you off.
// - Side buttons: mute/unmute the mic, mute/unmute the assistant's voice.
// - Tap the orb: while it talks = stop it and talk; while listening = "I'm done"; when idle = talk.
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import {
  listen, speak, speakAndListen, stopListening, cancelListening, isListening,
  stopSpeaking, submitTyped, yesNo, sttSupported, bargeInEnabled, setBargeIn,
} from '@/lib/voice';
import { t } from '@/lib/i18n';

const TXT = {
  hi: {
    hint: 'माइक दबाकर फिर बोलिए', muted: 'माइक बंद है', sorry: 'माफ़ कीजिए, मैं आपको सुन नहीं पाई। कृपया दोबारा बोलिए।',
    speakingOpen: 'बोल रही हूँ… आप बीच में बोल सकते हैं', micOn: 'माइक चालू', micOff: 'माइक बंद', voiceOn: 'आवाज़ चालू', voiceOff: 'आवाज़ बंद',
    barge: 'बीच में टोकना', on: 'चालू', off: 'बंद', you: 'आप', save: 'सेव नहीं हो पाया, दोबारा कोशिश करें।',
  },
  en: {
    hint: 'Tap the mic to speak again', muted: 'Mic is muted', sorry: "Sorry, I couldn't hear you. Please speak again.",
    speakingOpen: 'Speaking… you can talk over me', micOn: 'Mic on', micOff: 'Mic off', voiceOn: 'Voice on', voiceOff: 'Voice off',
    barge: 'Interrupt', on: 'on', off: 'off', you: 'You', save: 'Could not save. Please try again.',
  },
};

export default function VoiceOverlay({ open, onClose, farmer, lang = 'hi', firstQuestion }) {
  const L = t(lang);
  const X = TXT[lang] || TXT.hi;
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [userCap, setUserCap] = useState('');
  const [aiCap, setAiCap] = useState('');
  const [card, setCard] = useState(null);
  const [pending, setPending] = useState(null);
  const [typed, setTyped] = useState('');
  const [hint, setHint] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [barge, setBarge] = useState(true);

  const history = useRef([]);
  const alive = useRef(false);
  const runId = useRef(0);
  const pendingRef = useRef(null);
  const micMutedRef = useRef(false);
  const voiceMutedRef = useRef(false);
  pendingRef.current = pending;
  micMutedRef.current = micMuted;
  voiceMutedRef.current = voiceMuted;

  useEffect(() => { setBarge(bargeInEnabled()); }, []);

  useEffect(() => {
    if (!open) return;
    alive.current = true;
    stopSpeaking(); // the home greeting must not be heard as the farmer's words
    setUserCap(''); setCard(null); setPending(null); setHint('');
    setAiCap(sttSupported() ? '' : L.noMic);
    conversation(firstQuestion || null, { userTapped: !firstQuestion });
    return () => { alive.current = false; runId.current++; cancelListening(); stopSpeaking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---------- the conversation loop ---------- */
  async function conversation(startText, { userTapped = false, reply: startReply = null } = {}) {
    const id = ++runId.current;
    const live = () => alive.current && id === runId.current;
    let input = startText;
    let retried = false;
    let preset = startReply; // an answer that is already known (e.g. after tapping हाँ)

    while (live()) {
      // 1) get what the farmer said
      if (!input && !preset) {
        if (micMutedRef.current) { setState('idle'); setHint(X.muted); return; }
        setState('listening'); setHint(''); setUserCap('');
        const r = await listen({ lang, onInterim: setUserCap });
        if (!live()) return;
        if (r.error === 'not-allowed') { setState('idle'); setAiCap(L.noMic); return; }
        if (!r.text) {
          if (userTapped && !retried && !micMutedRef.current) {
            retried = true;
            setAiCap(X.sorry); setState('speaking');
            if (!voiceMutedRef.current) await speak(X.sorry, lang);
            continue;
          }
          setState('idle'); setHint(micMutedRef.current ? X.muted : X.hint); return;
        }
        input = r.text;
      }
      if (input) setUserCap(input);

      // 2) think
      const reply = preset || (await respond(input));
      preset = null; input = null; userTapped = false;
      if (!live()) return;
      if (!reply) continue;

      // 3) answer, with the mic open for the farmer's next words
      setAiCap(reply);
      if (voiceMutedRef.current) {
        if (micMutedRef.current) { setState('idle'); return; }
        continue; // no voice: go straight back to listening
      }
      setState('speaking');
      const r = await speakAndListen(reply, {
        lang,
        bargeIn: barge && !micMutedRef.current,
        listenAfter: !micMutedRef.current,
        onInterim: (t) => { setUserCap(t); },
        onBargeIn: () => setState('listening'),
        onListening: (on) => { if (on && live()) setState('listening'); },
      });
      if (!live()) return;
      if (r.text) { input = r.text; continue; }
      setState('idle'); setHint(micMutedRef.current ? X.muted : X.hint); return;
    }
  }

  /* ---------- one answer: confirm a pending action, or ask the AI ---------- */
  async function respond(text) {
    const p = pendingRef.current;
    if (p) {
      const yn = yesNo(text);
      if (yn) return confirmAction(yn === 'yes');
      setPending(null); // not a yes/no: treat as a new question
    }
    setState('thinking');
    setCard(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId: farmer?.id, farmer, lang, message: text, history: history.current }),
      });
      const data = await res.json();
      history.current = [...history.current, { role: 'user', text }, { role: 'assistant', text: data.reply }].slice(-10);
      setCard(data.cards?.[0] || null);
      setPending(data.pending || null);
      return data.reply;
    } catch {
      return L.offline;
    }
  }

  async function confirmAction(yes) {
    const p = pendingRef.current;
    setPending(null);
    if (!yes || !p) return L.cancelled;
    setState('thinking');
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId: farmer?.id, type: p.type, partnerId: p.partnerId, payload: p.payload }),
      });
      const out = await res.json();
      const msg = out.ok ? (lang === 'en' ? out.message_en : out.message_hi) : X.save;
      history.current = [...history.current, { role: 'assistant', text: msg }];
      return msg;
    } catch {
      return L.offline;
    }
  }

  /* ---------- controls ---------- */
  function orbTap() {
    if (state === 'speaking') { stopSpeaking(); return; }      // mic is already open: just talk
    if (state === 'listening') { stopListening(); return; }    // "I'm done", send now
    if (state === 'idle') {
      if (micMuted) setMicMuted(false);
      conversation(null, { userTapped: true });
    }
  }

  function toggleMic() {
    const next = !micMuted;
    setMicMuted(next);
    micMutedRef.current = next;
    if (next) { cancelListening(); }
    else if (state === 'idle') conversation(null, { userTapped: true });
  }

  function toggleVoice() {
    const next = !voiceMuted;
    setVoiceMuted(next);
    voiceMutedRef.current = next;
    if (next) stopSpeaking();
  }

  function toggleBarge() {
    const next = !barge;
    setBarge(next);
    setBargeIn(next);
  }

  async function confirmTap(yes) {
    runId.current++; // stop the running loop
    cancelListening(); stopSpeaking();
    const id = runId.current;
    const msg = await confirmAction(yes);
    if (!alive.current || id !== runId.current) return;
    conversation(null, { reply: msg });
  }

  function sendTyped(e) {
    e.preventDefault();
    const v = typed.trim();
    if (!v || state === 'thinking') return;
    setTyped('');
    setUserCap(v);
    if (isListening()) submitTyped(v); // ends the current turn with this text
    else { stopSpeaking(); conversation(v); }
  }

  function close() {
    alive.current = false;
    runId.current++;
    cancelListening(); stopSpeaking();
    onClose?.();
  }

  if (!open) return null;
  const status = {
    idle: hint || L.tapMic,
    listening: L.listening,
    thinking: L.thinking,
    speaking: barge && !micMuted ? X.speakingOpen : L.speaking,
  }[state];

  return (
    <div className="vo" role="dialog" aria-modal="true" aria-label="Voice assistant">
      <div className="vo-top">
        <div className="vo-brand">
          <img src="/logo.png" alt="Kisan Pulse" />
          <span className="vo-status" aria-live="polite">{status}</span>
        </div>
        <button className="vo-close" onClick={close} aria-label={L.close}><Icon name="x" /></button>
      </div>

      <div className="vo-side">
        <button className={`vo-tg ${micMuted ? 'off' : ''}`} onClick={toggleMic} aria-pressed={micMuted} aria-label={micMuted ? X.micOff : X.micOn}>
          <Icon name={micMuted ? 'micOff' : 'mic'} /><span>{micMuted ? X.micOff : X.micOn}</span>
        </button>
        <button className={`vo-tg ${voiceMuted ? 'off' : ''}`} onClick={toggleVoice} aria-pressed={voiceMuted} aria-label={voiceMuted ? X.voiceOff : X.voiceOn}>
          <Icon name={voiceMuted ? 'spkOff' : 'spk'} /><span>{voiceMuted ? X.voiceOff : X.voiceOn}</span>
        </button>
        <button className={`vo-tg small ${barge ? '' : 'off'}`} onClick={toggleBarge} aria-pressed={barge}>
          <span>{X.barge}: {barge ? X.on : X.off}</span>
        </button>
      </div>

      <div className="vo-mid">
        <button className={`orb ${state}`} onClick={orbTap} aria-label={status}>
          <Icon name={state === 'speaking' ? 'spk' : micMuted ? 'micOff' : 'mic'} />
        </button>
        {card && <MiniCard card={card} lang={lang} />}
        {pending && (
          <div className="vo-confirm">
            <button className="btn y" onClick={() => confirmTap(true)}><Icon name="check" />{L.yes}</button>
            <button className="btn alt" onClick={() => confirmTap(false)}><Icon name="x" />{L.no}</button>
          </div>
        )}
      </div>

      <div className="caps" aria-live="polite">
        {userCap && (<div><p className="cap-label">{X.you}</p><p className="cap-user">{userCap}</p></div>)}
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
