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

// Compare place names loosely: "Uttar Pradesh" == "uttar pradesh", "Sultanpur District" == "Sultanpur"
const norm = (v) => String(v || '').toLowerCase().replace(/district|zila|jila/g, '').replace(/[^a-z]/g, '');
const same = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

// Keep only rows that really are for the farmer's state / district / crop.
// (If data.gov.in ignores a filter it returns all-India rows; those must never reach the farmer.)
function matches(r, f) {
  if (f.state && !same(r.state, f.state)) return false;
  if (f.district && !same(r.district, f.district)) return false;
  if (f.commodity && norm(r.commodity) !== norm(f.commodity)) return false;
  return true;
}

async function query(filters) {
  const key = process.env.DATA_GOV_IN_API_KEY;
  if (!key) throw new Error('DATA_GOV_IN_API_KEY missing');
  if (!filters.state) return []; // without a state we would show prices from anywhere in India
  // data.gov.in has used both filter styles; try "field.keyword" then "field"
  for (const style of ['.keyword', '']) {
    const qs = Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => `&filters[${k}${style}]=${encodeURIComponent(v)}`)
      .join('');
    const url = `https://api.data.gov.in/resource/${RESOURCE}?api-key=${key}&format=json&limit=500${qs}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) continue;
      const d = await res.json();
      const rows = (d.records || []).filter((r) => matches(r, filters));
      if (rows.length) return rows;
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
  const key = `mandi2:${commodity}:${state || ''}:${district || ''}`.toLowerCase(); // v2: old cache could hold all-India rows
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
    return { found: false, commodity, state, note: `No mandi in ${state || 'your state'} reported this crop today.` };
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