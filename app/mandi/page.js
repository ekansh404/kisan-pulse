'use client';
// MANDI: today's REAL prices from Agmarknet (data.gov.in) for the farmer's crops and district.
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import useFarmer from '@/components/useFarmer';
import { speak } from '@/lib/voice';

const COMMON = [['wheat', 'गेहूं'], ['paddy', 'धान'], ['mustard', 'सरसों'], ['potato', 'आलू'], ['onion', 'प्याज'], ['maize', 'मक्का'], ['chana', 'चना'], ['tomato', 'टमाटर']];

export default function Mandi() {
  const { farmer, lang, ready } = useFarmer();
  const en = lang === 'en';
  const [crop, setCrop] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const crops = [...new Set([...(farmer?.crops || []), ...COMMON.map((c) => c[0])])].slice(0, 8);
  const label = (c) => (en ? c : COMMON.find((x) => x[0] === c)?.[1] || c);

  useEffect(() => { if (ready) setCrop(farmer?.crops?.[0] || 'wheat'); }, [ready, farmer]);

  useEffect(() => {
    if (!crop) return;
    setLoading(true);
    const q = new URLSearchParams({ crop, state: farmer?.state || '', district: farmer?.district || '' });
    fetch('/api/mandi?' + q).then((r) => r.json()).then(setData).catch(() => setData({ found: false })).finally(() => setLoading(false));
  }, [crop, farmer]);

  const sayIt = () => {
    if (!data?.found) return speak(en ? 'Price not available right now.' : 'अभी भाव उपलब्ध नहीं है।', lang);
    const b = data.best;
    speak(en
      ? `${data.commodity}: best price today ${b.modal} rupees per quintal at ${b.market}. Average ${data.average_modal}.`
      : `${label(crop)} का आज का सबसे अच्छा भाव ${b.market} मंडी में ${b.modal} रुपये प्रति क्विंटल है। औसत भाव ${data.average_modal} रुपये है।`, lang);
  };

  return (
    <>
      <Header title={en ? 'Mandi prices' : 'मंडी भाव'} sub={`${farmer?.district || ''} · ₹/${en ? 'quintal' : 'क्विंटल'}`} onSpeak={sayIt} />
      <main className="page">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {crops.map((c) => (
            <button key={c} className="ex" style={crop === c ? { borderColor: 'var(--deep)', background: 'var(--soft)' } : undefined} onClick={() => setCrop(c)}>{label(c)}</button>
          ))}
        </div>

        {loading && <p className="mut">{en ? 'Fetching today’s price…' : 'आज का भाव ला रहे हैं…'}</p>}

        {!loading && data?.found && (
          <>
            <div className="card">
              <div className="row sb"><p className="h3">{en ? 'Best price today' : 'आज का सबसे अच्छा भाव'}</p><span className="chip c-ok">{data.scope === 'district' ? (en ? 'Your district' : 'आपका ज़िला') : (en ? 'Your state' : 'आपका राज्य')}</span></div>
              <p className="h1">₹{data.best.modal}</p>
              <p className="mut">{data.best.market}, {data.best.district} · {data.best.variety} · {data.date}</p>
            </div>
            <div className="card">
              <div className="row sb"><p className="h3">{en ? 'Markets' : 'मंडियाँ'}</p><span className="mut">min · modal · max</span></div>
              {data.markets.map((m) => (
                <div key={m.market + m.variety}>
                  <div className="row sb"><span className="p">{m.market}</span><b>₹{m.modal}</b></div>
                  <p className="mut" style={{ fontSize: 13 }}>₹{m.min} – ₹{m.max} · {m.variety}</p>
                </div>
              ))}
            </div>
            <p className="tiny">Source: {data.source}{data.stale ? ' · last saved price (API slow)' : ''}</p>
          </>
        )}

        {!loading && data && !data.found && (
          <div className="card"><p className="p">{en ? 'No mandi has reported this crop today in your area.' : 'आज आपके इलाके की किसी मंडी ने यह फसल दर्ज नहीं की।'}</p>{data.error && <p className="tiny">{data.error}</p>}</div>
        )}
      </main>
      <BottomNav lang={lang} />
    </>
  );
}