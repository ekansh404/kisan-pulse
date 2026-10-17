'use client';
// SCHEMES: eligibility from data/schemes.json rules + farmer profile. Each card can be read aloud.
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import Icon from '@/components/Icon';
import useFarmer from '@/components/useFarmer';
import { speak } from '@/lib/voice';

const STATUS = { eligible: ['पात्र', 'Eligible', 'c-ok'], check: ['जाँच बाकी', 'Needs check', 'c-amber'], not_eligible: ['पात्र नहीं', 'Not eligible', 'c-gr'] };

export default function Schemes() {
  const { farmer, lang, ready } = useFarmer();
  const en = lang === 'en';
  const [list, setList] = useState(null);

  useEffect(() => {
    if (!ready) return;
    fetch('/api/schemes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ farmer, lang }) })
      .then((r) => r.json()).then((d) => setList(d.schemes || [])).catch(() => setList([]));
  }, [ready, farmer, lang]);

  const n = list?.filter((s) => s.status === 'eligible').length || 0;
  const sayAll = () => speak(en ? `You are eligible for ${n} schemes.` : `आप ${n} योजनाओं के लिए पात्र हैं।`, lang);

  return (
    <>
      <Header title={en ? 'Government schemes' : 'सरकारी योजनाएँ'} sub={en ? `${n} eligible` : `${n} योजनाओं के लिए पात्र`} onSpeak={sayAll} />
      <main className="page">
        {list === null && <p className="mut">…</p>}
        {list?.map((s) => (
          <div key={s.id} className="card">
            <div className="row sb" style={{ alignItems: 'flex-start' }}>
              <p className="h3">{s.name}</p>
              <span className={`chip ${STATUS[s.status][2]}`}>{STATUS[s.status][en ? 1 : 0]}</span>
            </div>
            <p className="p">{s.benefit}</p>
            {s.why?.length > 0 && <p className="mut">{s.why.join(' · ')}</p>}
            <p className="mut"><b>{en ? 'Documents: ' : 'काग़ज़: '}</b>{s.documents.join(', ')}</p>
            <p className="mut"><b>{en ? 'How: ' : 'कैसे: '}</b>{s.how}</p>
            <div className="row">
              <button className="spk" onClick={() => speak(`${s.name}. ${s.benefit}. ${s.how}`, lang)}><Icon name="spk" />{en ? 'Listen' : 'सुनें'}</button>
              <a className="spk" href={s.source} target="_blank" rel="noreferrer">{en ? 'Official site' : 'सरकारी वेबसाइट'}</a>
            </div>
          </div>
        ))}
        <p className="tiny">{en ? 'Rules from official scheme websites. Final approval is by the government department.' : 'नियम सरकारी वेबसाइटों से। अंतिम मंज़ूरी सरकारी विभाग देता है।'}</p>
      </main>
      <BottomNav lang={lang} />
    </>
  );
}