'use client';
import { useEffect, useState } from 'react';
import { getFarmer, getLang, setLang as saveLang } from '@/lib/session';

// Logged-in farmer + language for any page. ready=false until localStorage is read.
export default function useFarmer() {
  const [farmer, setFarmer] = useState(null);
  const [lang, setLangState] = useState('hi');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setFarmer(getFarmer());
    setLangState(getLang());
    setReady(true);
  }, []);
  const setLang = (l) => { saveLang(l); setLangState(l); };
  return { farmer, lang, setLang, ready };
}
