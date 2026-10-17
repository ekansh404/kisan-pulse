// Soil at a location. ISRIC SoilGrids v2 (free, no key). Cached forever per location.
// Docs: https://rest.isric.org/soilgrids/v2.0/docs
import { cacheGet, cacheSet } from '@/lib/db';

export async function getSoil(lat, lon) {
  const key = `soil:${(+lat).toFixed(2)}:${(+lon).toFixed(2)}`;
  const hit = await cacheGet(key);
  if (hit) return { ...hit.value, cached: true };

  const props = ['phh2o', 'soc', 'clay', 'sand', 'silt', 'nitrogen'];
  const url =
    `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}` +
    props.map((p) => `&property=${p}`).join('') + `&depth=0-5cm&depth=5-15cm&value=mean`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000); // SoilGrids can be slow
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('soilgrids ' + res.status);
    const d = await res.json();
    const v = {};
    for (const layer of d.properties?.layers || []) {
      const top = layer.depths?.find((x) => x.label === '5-15cm') || layer.depths?.[0];
      const raw = top?.values?.mean;
      if (raw == null) continue;
      v[layer.name] = raw / (layer.unit_measure?.d_factor || 1);
    }
    if (!Object.keys(v).length) return { available: false, source: 'SoilGrids' };
    const out = {
      available: true,
      source: 'ISRIC SoilGrids (satellite model, 250 m)',
      ph: round(v.phh2o, 1),
      organic_carbon_g_kg: round(v.soc, 1),
      nitrogen_g_kg: round(v.nitrogen, 2),
      clay_pct: round(v.clay), sand_pct: round(v.sand), silt_pct: round(v.silt),
      texture: texture(v.sand, v.clay),
      ph_note: v.phh2o == null ? null : v.phh2o < 6.5 ? 'acidic' : v.phh2o > 7.8 ? 'alkaline' : 'neutral',
      note: 'Model estimate. A Soil Health Card lab test is more accurate.',
    };
    await cacheSet(key, out);
    return out;
  } catch (e) {
    return { available: false, source: 'SoilGrids', error: String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const round = (x, n = 0) => (x == null ? null : Math.round(x * 10 ** n) / 10 ** n);
function texture(sand, clay) {
  if (sand == null || clay == null) return null;
  if (clay >= 40) return 'clay (चिकनी मिट्टी)';
  if (sand >= 70) return 'sandy (बलुई मिट्टी)';
  if (clay >= 27) return 'clay loam (चिकनी दोमट)';
  if (sand >= 50) return 'sandy loam (बलुई दोमट)';
  return 'loam (दोमट मिट्टी)';
}