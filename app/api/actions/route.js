// POST /api/actions  body: { farmerId, type: 'book_machine'|'order_input'|'hire_labour'|'sell_crop', partnerId?, payload }
// Only called AFTER the farmer said "haan" (voice) or tapped confirm.
import { executeAction } from '@/lib/market';
import { db } from '@/lib/db';

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const out = await executeAction(body);
  return Response.json(out, { status: out.ok ? 200 : 400 });
}

// GET /api/actions?farmerId=...  -> my bookings / orders
export async function GET(req) {
  const farmerId = new URL(req.url).searchParams.get('farmerId');
  const s = db();
  if (!s || !farmerId) return Response.json({ requests: [] });
  const { data } = await s
    .from('requests')
    .select('*, partner:partners(name, name_hi, phone, type)')
    .eq('farmer_id', farmerId)
    .order('created_at', { ascending: false })
    .limit(20);
  return Response.json({ requests: data || [] });
}
