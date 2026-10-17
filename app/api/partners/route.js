// GET /api/partners?type=machine&lat=26.8&lon=80.9&need=tractor
import { listPartners } from '@/lib/market';

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const list = await listPartners({
    type: p.get('type') || undefined,
    lat: p.get('lat'), lon: p.get('lon'),
    need: p.get('need') || '',
    limit: Number(p.get('limit') || 10),
  });
  return Response.json({ partners: list });
}
