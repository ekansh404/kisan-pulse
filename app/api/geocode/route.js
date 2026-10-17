import { geocode } from '@/lib/data/geo';

export async function GET(req) {
  const q = new URL(req.url).searchParams.get('q');
  if (!q) return Response.json({ error: 'q_required' }, { status: 400 });
  const g = await geocode(q).catch(() => null);
  return g ? Response.json(g) : Response.json({ error: 'not_found' }, { status: 404 });
}