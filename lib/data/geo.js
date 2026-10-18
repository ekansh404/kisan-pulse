// Place name -> coordinates. Open-Meteo Geocoding (free, no key).
// Docs: https://open-meteo.com/en/docs/geocoding-api

export async function geocode(place) {
  if (!place) return null;
  const q = String(place).trim();
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json&countryCode=IN`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const data = await res.json();
  const list = data.results || [];
  if (!list.length) return null;
  // Prefer populated places (PPL*) and admin seats over rivers/hills etc.
  const ranked = list.sort((a, b) => rank(b) - rank(a));
  const r = ranked[0];
  return {
    name: r.name,
    district: r.admin2 || r.name,
    state: r.admin1 || '',
    lat: r.latitude,
    lon: r.longitude,
    candidates: ranked.slice(0, 4).map((c) => ({ name: c.name, district: c.admin2 || c.name, state: c.admin1 || '', lat: c.latitude, lon: c.longitude })),
  };
}

// Pilot region first: many Indian place names repeat across states (e.g. Sultanpur),
// so a town in the pilot state wins a tie. Set GEO_PREFER_STATE='' to turn off.
const PREFER = (process.env.GEO_PREFER_STATE ?? 'Uttar Pradesh').toLowerCase();

function rank(r) {
  let s = 0;
  if (PREFER && (r.admin1 || '').toLowerCase() === PREFER) s += 2.5;
  if (r.feature_code?.startsWith('PPL')) s += 3;
  if (r.feature_code === 'PPLA' || r.feature_code === 'PPLA2') s += 2;
  s += Math.min(3, Math.log10((r.population || 1) + 1) / 2);
  return s;
}

// Distance in km between two points (used to sort partners by nearness)
export function km(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null)) return null;
  const R = 6371, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}