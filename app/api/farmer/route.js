// POST /api/farmer
//  { action:'login',    phone, proof }           -> { ok, exists, farmer }
//  { action:'register', phone, proof, profile }  -> { ok, farmer }
//  { action:'update',   id, phone, patch }       -> { ok, farmer }   (profile/settings page)
// proof = { idToken } (Firebase) or { demo:'1234' } (demo mode)
import { db } from '@/lib/db';

async function phoneVerified(phone, proof = {}) {
  if (process.env.NEXT_PUBLIC_OTP_MODE !== 'firebase') return proof.demo === '1234';
  if (!proof.idToken) return false;
  // Ask Google who this token belongs to (no firebase-admin needed)
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: proof.idToken }),
  });
  if (!r.ok) return false;
  const d = await r.json();
  return d.users?.[0]?.phoneNumber === '+91' + phone;
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const s = db();
  if (!s) return Response.json({ ok: false, error: 'db_not_configured' }, { status: 500 });
  const phone = String(body.phone || '').replace(/\D/g, '').slice(-10);

  if (body.action === 'login') {
    if (!(await phoneVerified(phone, body.proof))) return Response.json({ ok: false, error: 'otp_invalid' }, { status: 401 });
    const { data, error } = await s.from('farmers').select('*').eq('phone', '+91' + phone).maybeSingle();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    if (data) await s.from('farmers').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id);
    return Response.json({ ok: true, exists: !!data, farmer: data || null });
  }

  if (body.action === 'register') {
    if (!(await phoneVerified(phone, body.proof))) return Response.json({ ok: false, error: 'otp_invalid' }, { status: 401 });
    const p = body.profile || {};
    const row = {
      phone: '+91' + phone,
      name: p.name, lang: p.lang || 'hi',
      village: p.village, district: p.district, state: p.state, lat: p.lat, lon: p.lon,
      land_value: p.land_value, land_unit: p.land_unit, land_acres: p.land_acres,
      crops: p.crops || [],
      farmer_id_sim: p.farmer_id_sim,
      consent: { data: true, alerts: true, at: new Date().toISOString() },
    };
    const { data, error } = await s.from('farmers').upsert(row, { onConflict: 'phone' }).select().single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
    return Response.json({ ok: true, farmer: data });
  }

  if (body.action === 'update') {
    const allowed = ['name', 'lang', 'village', 'district', 'state', 'lat', 'lon', 'land_value', 'land_unit', 'land_acres', 'crops'];
    const patch = Object.fromEntries(Object.entries(body.patch || {}).filter(([k]) => allowed.includes(k)));
    const { data, error } = await s.from('farmers').update(patch).eq('id', body.id).eq('phone', '+91' + phone).select().single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
    return Response.json({ ok: true, farmer: data });
  }

  return Response.json({ ok: false, error: 'bad_action' }, { status: 400 });
}