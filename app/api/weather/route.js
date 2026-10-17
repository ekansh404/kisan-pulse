// GET /api/weather?lat=26.85&lon=80.95&lang=hi   (or ?place=Lucknow)
import { getWeather } from '@/lib/data/weather';
import { geocode } from '@/lib/data/geo';

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  let lat = p.get('lat'), lon = p.get('lon'), place = null;
  const lang = p.get('lang') || 'hi';
  try {
    if ((!lat || !lon) && p.get('place')) {
      place = await geocode(p.get('place'));
      if (!place) return Response.json({ error: 'place_not_found' }, { status: 404 });
      lat = place.lat; lon = place.lon;
    }
    if (!lat || !lon) return Response.json({ error: 'lat_lon_required' }, { status: 400 });
    const w = await getWeather(lat, lon, lang);
    return Response.json({ ...w, place });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}