import { getMandiPrice } from '@/lib/data/mandi';

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const crop = p.get('crop');
  if (!crop) return Response.json({ error: 'crop_required' }, { status: 400 });
  const out = await getMandiPrice({ crop, state: p.get('state') || '', district: p.get('district') || '' });
  return Response.json(out);
}