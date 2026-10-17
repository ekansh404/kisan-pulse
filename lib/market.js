// Marketplace on SEEDED partner data: machines, agri stores, labour, buyers.
// Server-only (uses lib/db).
import { db } from '@/lib/db';
import { km } from '@/lib/data/geo';

export const TYPES = ['machine', 'store', 'labour', 'buyer'];

export async function listPartners({ type, lat, lon, need, limit = 5 }) {
  const s = db();
  if (!s) return [];
  let q = s.from('partners').select('*').limit(60);
  if (type) q = q.eq('type', type);
  const { data, error } = await q;
  if (error || !data) return [];
  const needle = (need || '').toLowerCase();
  return data
    .map((p) => ({ ...p, distance_km: km(+lat, +lon, p.lat, p.lon) }))
    .map((p) => ({ ...p, match: needle ? JSON.stringify(p.details).toLowerCase().includes(needle) : true }))
    .sort((a, b) => (b.match - a.match) || ((a.distance_km ?? 999) - (b.distance_km ?? 999)))
    .slice(0, limit);
}

const ACTION_TO_PARTNER = { book_machine: 'machine', order_input: 'store', hire_labour: 'labour', sell_crop: 'buyer' };

/** Save a confirmed action. Returns {ok, request, partner, message_hi, message_en} */
export async function executeAction({ farmerId, type, partnerId, payload = {} }) {
  const s = db();
  if (!s) return { ok: false, error: 'db_not_configured' };
  if (!ACTION_TO_PARTNER[type]) return { ok: false, error: 'bad_type' };

  let partner = null;
  if (partnerId) {
    const { data } = await s.from('partners').select('*').eq('id', partnerId).maybeSingle();
    partner = data;
  }
  if (!partner) {
    // choose the nearest partner of that type
    const { data: f } = farmerId ? await s.from('farmers').select('lat,lon').eq('id', farmerId).maybeSingle() : { data: null };
    const list = await listPartners({ type: ACTION_TO_PARTNER[type], lat: f?.lat, lon: f?.lon, need: payload.need, limit: 1 });
    partner = list[0] || null;
  }
  const { data: request, error } = await s
    .from('requests')
    .insert({ farmer_id: farmerId || null, type, partner_id: partner?.id || null, payload, status: 'confirmed' })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };

  const who = partner ? (partner.name_hi || partner.name) : 'नज़दीकी पार्टनर';
  const whoEn = partner?.name || 'nearest partner';
  const msg = {
    book_machine: [`${who} के साथ ${payload.need || 'मशीन'} बुक हो गई। वो आपको फ़ोन करेंगे।`, `${payload.need || 'Machine'} booked with ${whoEn}. They will call you.`],
    order_input: [`${who} पर आपका ऑर्डर (${payload.need || 'सामान'}) भेज दिया गया।`, `Order for ${payload.need || 'items'} sent to ${whoEn}.`],
    hire_labour: [`${payload.count || ''} मज़दूरों की माँग ${who} को भेज दी गई।`, `Labour request (${payload.count || ''}) sent to ${whoEn}.`],
    sell_crop: [`${payload.crop || 'फसल'} बेचने का ऑफ़र ${who} को भेज दिया गया।`, `Sell offer for ${payload.crop || 'crop'} sent to ${whoEn}.`],
  }[type];
  return { ok: true, request, partner, message_hi: msg[0], message_en: msg[1] };
}
