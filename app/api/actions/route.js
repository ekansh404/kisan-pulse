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
    .select('*, partner:partners(name, name_hi, phone, type, village, district, rate, rate_unit, rating, details)')
    .eq('farmer_id', farmerId)
    .order('created_at', { ascending: false })
    .limit(20);
  return Response.json({ requests: data || [] });
}

// PATCH /api/actions  body: { id, farmerId, status: 'cancelled' }  -> cancel my booking/order
export async function PATCH(req) {
  const { id, farmerId, status } = await req.json().catch(() => ({}));
  const s = db();
  if (!s || !id || !farmerId) return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });
  if (status !== 'cancelled') return Response.json({ ok: false, error: 'only_cancel_allowed' }, { status: 400 });
  const { data, error } = await s
    .from('requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('farmer_id', farmerId) // a farmer can only cancel their own request
    .neq('status', 'done')
    .select('*, partner:partners(name, name_hi, phone, type)')
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  return Response.json({ ok: true, request: data });
}
