import { getSoil } from '@/lib/data/soil';

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  if (!p.get('lat') || !p.get('lon')) return Response.json({ error: 'lat_lon_required' }, { status: 400 });
  return Response.json(await getSoil(p.get('lat'), p.get('lon')));
}