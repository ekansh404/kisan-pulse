// Real mandi prices. Agmarknet daily prices via data.gov.in (free key).
// Dataset: "Current Daily Price of Various Commodities from Various Markets (Mandi)"
// https://www.data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi
import { cacheGet, cacheSet } from '@/lib/db';

const RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';

// Spoken crop name -> Agmarknet commodity name
export const COMMODITY = {
  wheat: 'Wheat', gehun: 'Wheat', gehu: 'Wheat', 'गेहूं': 'Wheat', 'गेहूँ': 'Wheat',
  paddy: 'Paddy(Dhan)(Common)', dhan: 'Paddy(Dhan)(Common)', 'धान': 'Paddy(Dhan)(Common)',
  rice: 'Rice', chawal: 'Rice', 'चावल': 'Rice',
  mustard: 'Mustard', sarson: 'Mustard', 'सरसों': 'Mustard',
  potato: 'Potato', aloo: 'Potato', aalu: 'Potato', 'आलू': 'Potato',
  onion: 'Onion', pyaz: 'Onion', pyaaz: 'Onion', 'प्याज': 'Onion', 'प्याज़': 'Onion',
  tomato: 'Tomato', tamatar: 'Tomato', 'टमाटर': 'Tomato',
  maize: 'Maize', makka: 'Maize', 'मक्का': 'Maize',
  arhar: 'Arhar (Tur/Red Gram)(Whole)', tur: 'Arhar (Tur/Red Gram)(Whole)', 'अरहर': 'Arhar (Tur/Red Gram)(Whole)',
  chana: 'Bengal Gram(Gram)(Whole)', gram: 'Bengal Gram(Gram)(Whole)', 'चना': 'Bengal Gram(Gram)(Whole)',
  moong: 'Green Gram (Moong)(Whole)', 'मूंग': 'Green Gram (Moong)(Whole)',
  masoor: 'Lentil (Masur)(Whole)', 'मसूर': 'Lentil (Masur)(Whole)',
  soybean: 'Soyabean', 'सोयाबीन': 'Soyabean',
  garlic: 'Garlic', lahsun: 'Garlic', 'लहसुन': 'Garlic',
  cauliflower: 'Cauliflower', gobhi: 'Cauliflower', 'गोभी': 'Cauliflower',
};

export function toCommodity(name = '') {
  const k = name.toLowerCase().trim();
  return COMMODITY[k] || COMMODITY[name.trim()] || name.charAt(0).toUpperCase() + name.slice(1);
}

async function query(filters) {
  const key = process.env.DATA_GOV_IN_API_KEY;
  if (!key) throw new Error('DATA_GOV_IN_API_KEY missing');
  // data.gov.in has used both filter styles; try "field" then "field.keyword"
  for (const style of ['', '.keyword']) {
    const qs = Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => `&filters[${k}${style}]=${encodeURIComponent(v)}`)
      .join('');
    const url = `https://api.data.gov.in/resource/${RESOURCE}?api-key=${key}&format=json&limit=100${qs}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.records?.length) return d.records;
    } catch {
      /* try next style */
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

/**
 * getMandiPrice({ crop:'gehun', state:'Uttar Pradesh', district:'Lucknow' })
 * Tries district -> state. Caches 6 hours, falls back to last cached result if the API is down.
 */
export async function getMandiPrice({ crop, state, district }) {
  const commodity = toCommodity(crop);
  const key = `mandi:${commodity}:${state || ''}:${district || ''}`.toLowerCase();
  const hit = await cacheGet(key, 360);
  if (hit && !hit.stale) return { ...hit.value, cached: true };

  let scope = 'district';
  let rows = [];
  try {
    if (district) rows = await query({ state, district, commodity });
    if (!rows.length) { scope = 'state'; rows = await query({ state, commodity }); }
  } catch (e) {
    if (hit) return { ...hit.value, cached: true, stale: true };
    return { found: false, commodity, error: String(e.message || e) };
  }

  if (!rows.length) {
    if (hit) return { ...hit.value, cached: true, stale: true };
    return { found: false, commodity, note: 'No mandi reported this crop today in this area.' };
  }

  const markets = rows
    .map((r) => ({
      market: r.market, district: r.district, variety: r.variety, date: r.arrival_date,
      min: +r.min_price, max: +r.max_price, modal: +r.modal_price,
    }))
    .sort((a, b) => b.modal - a.modal)
    .slice(0, 8);
  const avg = Math.round(markets.reduce((s, m) => s + m.modal, 0) / markets.length);
  const out = {
    found: true, commodity, scope, unit: '₹/quintal',
    source: 'Agmarknet via data.gov.in',
    date: markets[0].date,
    average_modal: avg,
    best: markets[0],
    markets,
  };
  await cacheSet(key, out);
  return out;
}