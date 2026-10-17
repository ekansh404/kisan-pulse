'use client';
// PROFILE + SETTINGS: farmer details, simulated Farmer ID, language, voice test, logout.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import Icon from '@/components/Icon';
import useFarmer from '@/components/useFarmer';
import { logout } from '@/lib/session';
import { speak, pickVoice, sttSupported } from '@/lib/voice';

export default function Profile() {
  const router = useRouter();
  const { farmer, lang, setLang, ready } = useFarmer();
  const en = lang === 'en';
  const [voice, setVoice] = useState('');

  useEffect(() => { pickVoice(lang).then((v) => setVoice(v ? `${v.name} (${v.lang})` : en ? 'Default voice' : 'डिफ़ॉल्ट आवाज़')); }, [lang, en]);

  useEffect(() => { if (ready && !farmer) router.replace('/onboarding'); }, [ready, farmer, router]);
  if (!ready || !farmer) return null;

  const row = (k, v) => (<><div className="row sb"><span className="p">{k}</span><b style={{ textAlign: 'right' }}>{v || '—'}</b></div><div className="line" /></>);

  return (
    <>
      <Header title={en ? 'Profile & settings' : 'प्रोफ़ाइल और सेटिंग'} sub={farmer.phone} />
      <main className="page">
        <div className="card" style={{ background: 'var(--deep)', color: '#fff' }}>
          <div className="row sb"><span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', color: '#F4E3B0' }}>{en ? 'FARMER ID' : 'किसान पहचान'}</span><span className="chip c-amber">{en ? 'Demo verified' : 'डेमो सत्यापित'}</span></div>
          <p className="h1">{farmer.name}</p>
          <p className="p" style={{ opacity: .9 }}>{[farmer.village, farmer.district, farmer.state].filter(Boolean).join(', ')}</p>
          <p className="h3" style={{ letterSpacing: '.06em' }}>{farmer.farmer_id_sim}</p>
        </div>

        <div className="card">
          {row(en ? 'Land' : 'ज़मीन', farmer.land_value ? `${farmer.land_value} ${farmer.land_unit} (≈${farmer.land_acres} ${en ? 'acre' : 'एकड़'})` : '')}
          {row(en ? 'Crops' : 'फसलें', (farmer.crops || []).join(', '))}
          {row(en ? 'Mobile' : 'मोबाइल', farmer.phone)}
          {row(en ? 'Consent' : 'सहमति', en ? 'Given: advice, alerts, schemes' : 'दी गई: सलाह, चेतावनी, योजनाएँ')}
        </div>

        <div className="card">
          <p className="h3">{en ? 'Language' : 'भाषा'}</p>
          <div className="row">
            <button className={`btn sm ${lang === 'hi' ? '' : 'alt'}`} style={{ flex: 1 }} onClick={() => setLang('hi')}>हिंदी</button>
            <button className={`btn sm ${lang === 'en' ? '' : 'alt'}`} style={{ flex: 1 }} onClick={() => setLang('en')}>English</button>
          </div>
          <p className="h3">{en ? 'Voice' : 'आवाज़'}</p>
          <p className="mut">{voice}</p>
          <p className="mut">{en ? 'Microphone: ' : 'माइक: '}{sttSupported() ? (en ? 'supported' : 'चालू') : (en ? 'not supported, use Chrome' : 'नहीं चल रहा, Chrome में खोलें')}</p>
          <button className="spk" onClick={() => speak(en ? 'Namaskar! This is how I sound.' : 'नमस्कार! मेरी आवाज़ ऐसी सुनाई देगी।', lang)}><Icon name="spk" />{en ? 'Test voice' : 'आवाज़ जाँचें'}</button>
        </div>

        <div className="card">
          <p className="h3">{en ? 'Data sources' : 'जानकारी कहाँ से'}</p>
          <p className="mut">Weather: Open-Meteo · Mandi: Agmarknet (data.gov.in) · Soil: ISRIC SoilGrids · Schemes: official portals · AI: Google Gemini</p>
          <p className="mut">{en ? 'Simulated in this prototype: Farmer ID / land verification, payments, insurance & loan approvals.' : 'इस प्रोटोटाइप में सिम्युलेटेड: किसान ID / ज़मीन जाँच, भुगतान, बीमा और लोन मंज़ूरी।'}</p>
        </div>

        <button className="btn alt" onClick={() => { logout(); router.replace('/onboarding'); }}>{en ? 'Log out' : 'लॉग आउट'}</button>
      </main>
      <BottomNav lang={lang} />
    </>
  );
}