'use client';
// SERVICES: book machines, order from agri stores, hire labour, sell crop to buyers (SEEDED partner data).
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import Icon from '@/components/Icon';
import useFarmer from '@/components/useFarmer';
import { speak } from '@/lib/voice';

const TABS = [
  { type: 'machine', action: 'book_machine', icon: 'tractor', hi: 'मशीन', en: 'Machines', btnHi: 'बुक करें', btnEn: 'Book', bg: '#FBE3CF', fg: '#9A4A0F' },
  { type: 'store', action: 'order_input', icon: 'flask', hi: 'खाद-बीज', en: 'Agri store', btnHi: 'ऑर्डर करें', btnEn: 'Order', bg: '#DDEFD9', fg: '#2C6E2F' },
  { type: 'labour', action: 'hire_labour', icon: 'people', hi: 'मज़दूर', en: 'Labour', btnHi: 'बुलाएँ', btnEn: 'Hire', bg: '#F8DDE3', fg: '#8E2B47' },
  { type: 'buyer', action: 'sell_crop', icon: 'store', hi: 'फसल बेचें', en: 'Sell crop', btnHi: 'ऑफ़र भेजें', btnEn: 'Send offer', bg: '#FBEFC8', fg: '#7A5A00' },
];
const UNIT = { hour: ['घंटा', 'hour'], day: ['दिन', 'day'], quintal: ['क्विंटल', 'quintal'], item: ['', ''] };

export default function Services() {
  const { farmer, lang, ready } = useFarmer();
  const en = lang === 'en';
  const [tab, setTab] = useState(TABS[0]);
  const [list, setList] = useState(null);
  const [ask, setAsk] = useState(null); // partner awaiting confirm
  const [mine, setMine] = useState([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!ready) return;
    setList(null);
    const q = new URLSearchParams({ type: tab.type, lat: farmer?.lat ?? '', lon: farmer?.lon ?? '' });
    fetch('/api/partners?' + q).then((r) => r.json()).then((d) => setList(d.partners || [])).catch(() => setList([]));
  }, [tab, ready, farmer]);

  const loadMine = () => farmer?.id && fetch('/api/actions?farmerId=' + farmer.id).then((r) => r.json()).then((d) => setMine(d.requests || [])).catch(() => {});
  useEffect(() => { loadMine(); /* eslint-disable-next-line */ }, [farmer]);

  function startConfirm(p) {
    setAsk(p);
    const name = en ? p.name : p.name_hi || p.name;
    speak(en ? `${name}. Shall I confirm? Yes or no?` : `${name}। क्या मैं पक्का कर दूँ? हाँ या ना?`, lang);
  }

  async function confirm(p) {
    setAsk(null);
    const payload = { need: p.details?.machine || p.details?.items?.[0] || tab.en, crop: farmer?.crops?.[0], count: p.details?.size };
    const r = await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmerId: farmer?.id, type: tab.action, partnerId: p.id, payload }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    const msg = r.ok ? (en ? r.message_en : r.message_hi) : en ? 'Could not save.' : 'सेव नहीं हुआ।';
    setToast(msg);
    speak(msg, lang);
    setTimeout(() => setToast(''), 3500);
    loadMine();
  }

  return (
    <>
      <Header title={en ? 'Services' : 'सेवाएँ'} sub={en ? 'Machines · store · labour · buyers' : 'मशीन · दुकान · मज़दूर · खरीदार'} />
      <main className="page">
        <div className="grid3" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          {TABS.map((t) => (
            <button key={t.type} className="tile" aria-pressed={tab.type === t.type} onClick={() => setTab(t)}>
              <span className="tic" style={{ background: t.bg, color: t.fg, width: 46, height: 46 }}><Icon name={t.icon} /></span>
              <span className="tl" style={{ fontSize: 13 }}>{en ? t.en : t.hi}</span>
            </button>
          ))}
        </div>

        {list === null && <p className="mut">{en ? 'Loading…' : 'लोड हो रहा है…'}</p>}
        {list?.length === 0 && <div className="card"><p className="p">{en ? 'No partners found. Run supabase/seed.sql.' : 'कोई पार्टनर नहीं मिला।'}</p></div>}
        {list?.map((p) => {
          const name = en ? p.name : p.name_hi || p.name;
          const what = p.details?.machine_hi && !en ? p.details.machine_hi : p.details?.machine || p.details?.items?.slice(0, 3).join(', ') || p.details?.skills?.join(', ') || p.details?.crops?.filter((c) => /[a-z]/i.test(c) === en).join(', ');
          return (
            <div key={p.id} className="card">
              <div className="row">
                <span className="av">{name.charAt(0)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="h3">{name}</p>
                  <p className="mut">{what}{p.distance_km != null ? ` · ${p.distance_km} km` : ''}</p>
                </div>
                <span className="chip c-gr">{p.rating} ★</span>
              </div>
              {p.rate && <p className="h2">₹{p.rate}{UNIT[p.rate_unit]?.[en ? 1 : 0] ? ` / ${UNIT[p.rate_unit][en ? 1 : 0]}` : ''}</p>}
              {ask?.id === p.id ? (
                <div className="row">
                  <button className="btn y" style={{ flex: 1 }} onClick={() => confirm(p)}><Icon name="check" />{en ? 'Yes' : 'हाँ'}</button>
                  <button className="btn alt" style={{ flex: 1 }} onClick={() => setAsk(null)}><Icon name="x" />{en ? 'No' : 'ना'}</button>
                </div>
              ) : (
                <div className="row">
                  <button className="btn sm" style={{ flex: 1 }} onClick={() => startConfirm(p)}>{en ? tab.btnEn : tab.btnHi}</button>
                  <a className="btn sm alt" style={{ flex: 1 }} href={`tel:${p.phone}`}><Icon name="phone" />{en ? 'Call' : 'कॉल'}</a>
                </div>
              )}
            </div>
          );
        })}

        {mine.length > 0 && (
          <div className="card">
            <p className="h3">{en ? 'My requests' : 'मेरी बुकिंग / ऑर्डर'}</p>
            {mine.slice(0, 6).map((r) => (
              <div key={r.id} className="row sb">
                <span className="p" style={{ fontSize: 15 }}>{(en ? r.partner?.name : r.partner?.name_hi || r.partner?.name) || r.type} · {r.payload?.need || r.payload?.crop || ''}</span>
                <span className="chip c-ok">{en ? 'Confirmed' : 'पक्का'}</span>
              </div>
            ))}
          </div>
        )}
        <p className="tiny">{en ? 'Demo partner listings · payments are simulated' : 'डेमो पार्टनर · भुगतान सिम्युलेटेड है'}</p>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
      <BottomNav lang={lang} />
    </>
  );
}
