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

const HISTORY = '35985678-0d79-46b4-9ed6-6f13308a1d24'; // "Variety-wise Daily Market Prices" (past days)

// data.gov.in field names differ by dataset ("state" vs "State", "Min_Price" vs "min_price"): make them all lower case.
const lower = (r) => Object.fromEntries(Object.entries(r || {}).map(([k, v]) => [k.toLowerCase(), v]));

async function getJson(url, notes, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) { notes.push(`http ${res.status}`); return null; }
    const d = await res.json();
    if (d.error || d.message) notes.push(String(d.error || d.message).slice(0, 80));
    return d;
  } catch (e) {
    notes.push(e?.name === 'AbortError' ? 'timeout' : String(e?.message || e).slice(0, 80));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Whole of today's all-India sheet (~10-20k rows), kept in memory for 30 min. We filter it ourselves,
// so it works even when data.gov.in ignores or renames its filters.
let today = { at: 0, rows: [] };
async function todaySheet(key, notes) {
  if (Date.now() - today.at < 30 * 60000 && today.rows.length) return today.rows;
  const d = await getJson(`https://api.data.gov.in/resource/${RESOURCE}?api-key=${key}&format=json&limit=20000`, notes, 12000);
  const rows = (d?.records || []).map(lower);
  notes.push(`today rows ${rows.length}`);
  if (rows.length) today = { at: Date.now(), rows };
  return rows;
}

// Filtered request (both filter styles), then our own exact filtering
async function filtered(resource, filters, key, notes, ms = 8000) {
  for (const style of ['.keyword', '']) {
    const qs = Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => `&filters[${k}${style}]=${encodeURIComponent(v)}`)
      .join('');
    const d = await getJson(`https://api.data.gov.in/resource/${resource}?api-key=${key}&format=json&limit=1000${qs}`, notes, ms);
    const rows = (d?.records || []).map(lower);
    if (rows.length) return rows;
  }
  return [];
}

const pick = (rows, f) => rows.filter((r) => matches(r, f));

// IST date "dd/mm/yyyy", n days ago
function istDate(n) {
  const d = new Date(Date.now() + 5.5 * 3600000 - n * 86400000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

// Mandis are often shut on Sundays/holidays, so today's sheet can be nearly empty. Then use the most
// recent day in the last week that has prices for this crop in this state.
async function recentDays(f, key, notes) {
  const days = [1, 2, 3, 4, 5];
  const res = await Promise.all(days.map(async (n) => {
    const date = istDate(n);
    let rows = await filtered(HISTORY, { State: f.state, Commodity: f.commodity, Arrival_Date: date }, key, []);
    if (!rows.length) rows = await filtered(HISTORY, { state: f.state, commodity: f.commodity, arrival_date: date }, key, []);
    return pick(rows, { state: f.state, commodity: f.commodity });
  }));
  const i = res.findIndex((r) => r.length);
  notes.push(`history ${i < 0 ? 'none' : istDate(days[i])}`);
  return i < 0 ? [] : res[i];
}

/** Rows for this crop: district (today) -> state (today) -> state (latest day in past week). */
async function findRows({ state, district, commodity }, notes) {
  const key = process.env.DATA_GOV_IN_API_KEY;
  if (!key) throw new Error('DATA_GOV_IN_API_KEY missing');
  if (!state) return { rows: [], scope: 'none' }; // without a state we would show prices from anywhere in India

  // Today's prices and the last few days are fetched at the same time, so a slow/empty day costs no extra wait.
  const [todayRows, oldP] = [filtered(RESOURCE, { state, commodity }, key, notes), recentDays({ state, commodity }, key, notes)];
  let all = pick(await todayRows, { state, commodity });
  if (!all.length) all = pick(await todaySheet(key, notes), { state, commodity });
  if (all.length) {
    oldP.catch(() => {});
    const near = district ? pick(all, { district }) : [];
    return near.length ? { rows: near, scope: 'district' } : { rows: all, scope: 'state' };
  }
  const old = await oldP;
  const near = district ? pick(old, { district }) : [];
  return near.length ? { rows: near, scope: 'district', recent: true } : { rows: old, scope: 'state', recent: true };
}

/**
 * getMandiPrice({ crop:'gehun', state:'Uttar Pradesh', district:'Lucknow' })
 * Tries district -> state. Caches 6 hours, falls back to last cached result if the API is down.
 */
export async function getMandiPrice({ crop, state, district }) {
  const commodity = toCommodity(crop);
  const key = `mandi2:${commodity}:${state || ''}:${district || ''}`.toLowerCase(); // v2: old cache could hold all-India rows
  const hit = await cacheGet(key, 180);
  if (hit && !hit.stale) return { ...hit.value, cached: true };

  const notes = [];
  let found;
  try {
    found = await findRows({ state, district, commodity }, notes);
  } catch (e) {
    if (hit) return { ...hit.value, cached: true, stale: true };
    return { found: false, commodity, error: String(e.message || e) };
  }
  const { rows, scope, recent } = found;

  if (!rows.length) {
    if (hit) return { ...hit.value, cached: true, stale: true };
    const down = notes.includes('today rows 0') && notes.some((n) => /^http|timeout|fetch|limit|key/i.test(n));
    return { found: false, commodity, state, api_down: down, note: down ? 'Mandi price service (data.gov.in) is not responding right now.' : `No mandi in ${state || 'your state'} reported this crop in the last few days.`, debug: notes };
  }

  const markets = rows
    .map((r) => ({
      market: r.market, district: r.district, variety: r.variety, date: r.arrival_date,
      min: +r.min_price, max: +r.max_price, modal: +r.modal_price,
    }))
    .filter((m) => m.modal > 0)
    .sort((a, b) => b.modal - a.modal)
    .slice(0, 8);
  if (!markets.length) return { found: false, commodity, state, note: 'No valid price rows.', debug: notes };
  const avg = Math.round(markets.reduce((s, m) => s + m.modal, 0) / markets.length);
  const out = {
    found: true, commodity, scope, recent: !!recent, unit: '₹/quintal',
    source: 'Agmarknet via data.gov.in',
    date: markets[0].date,
    average_modal: avg,
    best: markets[0],
    markets,
  };
  await cacheSet(key, out);
  return out;
}