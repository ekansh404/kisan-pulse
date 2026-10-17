// POST /api/extract  { field, text, lang } -> { ok, value }
// Uses Gemini only to turn a spoken sentence into a clean value ("mera naam Ramesh Kumar hai" -> "Ramesh Kumar").
import { gemini, geminiReady, safeJson } from '@/lib/gemini';

const SPEC = {
  name: 'Return {"ok":true,"value":"<person name only, as spoken, keep Devanagari if spoken in Hindi>"}. If no name is present return {"ok":false}.',
  place: 'Return {"ok":true,"value":{"village":"<village/town in English letters or null>","district":"<district in English letters>","state":"<Indian state in English, guess from district if not said>"}}. If no place is present return {"ok":false}.',
  land: 'Return {"ok":true,"value":{"value":<number>,"unit":"acre|bigha|hectare|biswa|kanal|guntha"}}. "dhai"=2.5, "dedh"=1.5, "sawa"=+0.25, "paune"=-0.25. If unit is not said use "bigha". If no amount return {"ok":false}.',
  crops: 'Return {"ok":true,"value":["<crop names in simple English lowercase, e.g. wheat, paddy, sugarcane, potato, mustard>"]}. If no crop return {"ok":false}.',
  phone: 'Return {"ok":true,"value":"<10 digit Indian mobile number>"} converting Hindi/English number words to digits. If not exactly 10 digits return {"ok":false}.',
  otp: 'Return {"ok":true,"value":"<only the digits>"} converting number words to digits. If no digits return {"ok":false}.',
  farmer_id: 'Return {"ok":true,"value":"<the ID as letters/digits without spaces>"}. If none return {"ok":false}.',
};

export async function POST(req) {
  const { field, text = '' } = await req.json().catch(() => ({}));
  if (!SPEC[field]) return Response.json({ ok: false, error: 'bad_field' }, { status: 400 });
  if (!geminiReady()) return Response.json({ ok: false, error: 'no_ai_key' });
  try {
    const out = await gemini({
      system: 'You extract one value from what an Indian farmer said (Hindi, Hinglish or English, from speech recognition, may have small errors). Reply with JSON only.',
      contents: [{ role: 'user', parts: [{ text: `Field: ${field}\nRule: ${SPEC[field]}\nFarmer said: "${text}"` }] }],
      json: true,
      temperature: 0,
    });
    const j = safeJson(out.text, { ok: false });
    return Response.json(j && typeof j === 'object' ? j : { ok: false });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) });
  }
}