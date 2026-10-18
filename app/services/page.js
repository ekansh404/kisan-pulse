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
  const [detail, setDetail] = useState(null); // booking shown in the details sheet
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
            <p className="h3">{en ? 'My bookings & orders' : 'मेरी बुकिंग / ऑर्डर'}</p>
            {mine.slice(0, 8).map((r) => {
              const meta = KIND[r.type] || KIND.book_machine;
              const cancelled = r.status === 'cancelled';
              return (
                <button key={r.id} className="req-row" onClick={() => setDetail(r)} aria-label={en ? 'View details' : 'विवरण देखें'}>
                  <span className="tic" style={{ background: meta.bg, color: meta.fg, width: 40, height: 40, borderRadius: 12 }}><Icon name={meta.icon} /></span>
                  <span className="req-main">
                    <b>{(en ? r.partner?.name : r.partner?.name_hi || r.partner?.name) || (en ? meta.en : meta.hi)}</b>
                    <small>{en ? meta.en : meta.hi}{r.payload?.need ? ` · ${r.payload.need}` : r.payload?.crop ? ` · ${r.payload.crop}` : ''}</small>
                  </span>
                  <span className={`chip ${cancelled ? 'c-gr' : 'c-ok'}`}>{cancelled ? (en ? 'Cancelled' : 'रद्द') : (en ? 'Confirmed' : 'पक्का')}</span>
                  <span className="req-more">{en ? 'Details' : 'विवरण'} ›</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="tiny">{en ? 'Demo partner listings · payments are simulated' : 'डेमो पार्टनर · भुगतान सिम्युलेटेड है'}</p>
      </main>
      {detail && <RequestSheet r={detail} en={en} lang={lang} farmerId={farmer?.id} onClose={() => setDetail(null)} onChanged={(upd, msg) => { setDetail(null); setMine((m) => m.map((x) => (x.id === upd.id ? { ...x, ...upd } : x))); setToast(msg); speak(msg, lang); setTimeout(() => setToast(''), 3500); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      <BottomNav lang={lang} />
    </>
  );
}

const KIND = {
  book_machine: { icon: 'tractor', hi: 'मशीन बुकिंग', en: 'Machine booking', bg: '#FBE3CF', fg: '#9A4A0F' },
  order_input: { icon: 'flask', hi: 'खाद-बीज ऑर्डर', en: 'Agri store order', bg: '#DDEFD9', fg: '#2C6E2F' },
  hire_labour: { icon: 'people', hi: 'मज़दूर माँग', en: 'Labour request', bg: '#F8DDE3', fg: '#8E2B47' },
  sell_crop: { icon: 'store', hi: 'फसल बिक्री ऑफ़र', en: 'Crop sale offer', bg: '#FBEFC8', fg: '#7A5A00' },
};

// Bottom sheet with full booking details + cancel (with a second confirm step)
function RequestSheet({ r, en, lang, farmerId, onClose, onChanged }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const meta = KIND[r.type] || KIND.book_machine;
  const p = r.partner || {};
  const pay = r.payload || {};
  const cancelled = r.status === 'cancelled';
  const when = r.created_at ? new Date(r.created_at).toLocaleString(en ? 'en-IN' : 'hi-IN', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : '';
  const unit = UNIT[p.rate_unit]?.[en ? 1 : 0];
  const rows = [
    [en ? 'Partner' : 'पार्टनर', en ? p.name : p.name_hi || p.name],
    [en ? 'Place' : 'जगह', [p.village, p.district].filter(Boolean).join(', ')],
    [en ? 'What' : 'क्या', pay.need || p.details?.machine || p.details?.items?.slice(0, 3).join(', ')],
    [en ? 'Crop' : 'फसल', pay.crop],
    [en ? 'Quantity' : 'मात्रा', pay.quantity_quintal ? `${pay.quantity_quintal} ${en ? 'quintal' : 'क्विंटल'}` : null],
    [en ? 'People' : 'लोग', pay.count],
    [en ? 'When needed' : 'कब', pay.date],
    [en ? 'Rate' : 'दर', p.rate ? `₹${p.rate}${unit ? ' / ' + unit : ''}` : null],
    [en ? 'Booked on' : 'बुकिंग का समय', when],
    [en ? 'Booking ID' : 'बुकिंग नंबर', String(r.id || '').slice(0, 8).toUpperCase()],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');

  async function cancel() {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/actions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, farmerId, status: 'cancelled' }) });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error);
      onChanged({ ...r, status: 'cancelled' }, en ? `${meta.en} cancelled. ${p.name || ''} has been informed.` : `${meta.hi} रद्द कर दी गई। ${p.name_hi || p.name || ''} को सूचना दे दी गई है।`);
    } catch {
      setErr(en ? 'Could not cancel. Please try again.' : 'रद्द नहीं हो पाया, दोबारा कोशिश करें।');
      setBusy(false);
    }
  }

  const sayIt = () => speak(rows.map(([k, v]) => `${k}: ${v}`).join('। '), lang);

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <span className="sheet-grip" aria-hidden="true" />
        <div className="row sb">
          <div className="row" style={{ gap: 10 }}>
            <span className="tic" style={{ background: meta.bg, color: meta.fg, width: 44, height: 44, borderRadius: 14 }}><Icon name={meta.icon} /></span>
            <div><p className="h3">{en ? meta.en : meta.hi}</p><span className={`chip ${cancelled ? 'c-gr' : 'c-ok'}`}>{cancelled ? (en ? 'Cancelled' : 'रद्द') : (en ? 'Confirmed' : 'पक्का')}</span></div>
          </div>
          <button className="hb" onClick={onClose} aria-label={en ? 'Close' : 'बंद करें'}><Icon name="x" /></button>
        </div>
        <dl className="kv">
          {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
        </dl>
        <div className="row">
          {p.phone && <a className="btn sm alt" style={{ flex: 1 }} href={`tel:${p.phone}`}><Icon name="phone" />{en ? 'Call' : 'कॉल करें'}</a>}
          <button className="btn sm alt" style={{ flex: 1 }} onClick={sayIt}><Icon name="spk" />{en ? 'Listen' : 'सुनें'}</button>
        </div>
        {!cancelled && !asking && (
          <button className="btn sm danger" onClick={() => { setAsking(true); speak(en ? 'Do you want to cancel? Yes or no?' : 'क्या आप इसे रद्द करना चाहते हैं? हाँ या ना?', lang); }}>
            <Icon name="x" />{en ? 'Cancel booking' : 'बुकिंग रद्द करें'}
          </button>
        )}
        {asking && (
          <div className="card" style={{ background: '#FFF6F4', borderColor: '#F3C9C2' }}>
            <p className="p">{en ? 'Cancel this booking?' : 'क्या यह बुकिंग रद्द करनी है?'}</p>
            <div className="row">
              <button className="btn sm danger" style={{ flex: 1 }} disabled={busy} onClick={cancel}>{busy ? '…' : en ? 'Yes, cancel' : 'हाँ, रद्द करें'}</button>
              <button className="btn sm alt" style={{ flex: 1 }} disabled={busy} onClick={() => setAsking(false)}>{en ? 'No' : 'नहीं'}</button>
            </div>
            {err && <p className="mut" style={{ color: 'var(--red)' }}>{err}</p>}
          </div>
        )}
        <p className="tiny">{en ? 'Demo partner · payment is simulated' : 'डेमो पार्टनर · भुगतान सिम्युलेटेड है'}</p>
      </div>
    </div>
  );
}
