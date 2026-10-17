// GET /api/health -> quick check that every key and the database work (open it in the browser).
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const out = {
    gemini_key: Boolean(process.env.GEMINI_API_KEY),
    gemini_model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    data_gov_key: Boolean(process.env.DATA_GOV_IN_API_KEY),
    otp_mode: process.env.NEXT_PUBLIC_OTP_MODE || 'demo',
    tts: process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : process.env.TTS_PROVIDER === 'gemini' ? 'gemini' : 'browser',
    db: 'not configured',
  };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (key.startsWith('sb_publishable') || /"role":"anon"/.test(decodeRole(key))) {
    out.db_key_warning = 'SUPABASE_SERVICE_ROLE_KEY is the PUBLIC (anon/publishable) key. Use the service_role / Secret key.';
  }
  const s = db();
  if (s) {
    const checks = {};
    for (const t of ['farmers', 'partners', 'requests', 'api_cache', 'messages']) {
      const { count, error } = await s.from(t).select('*', { count: 'exact', head: true });
      checks[t] = error ? 'ERROR: ' + error.message : `ok (${count ?? 0} rows)`;
    }
    out.db = checks;
  }
  return Response.json(out);
}

function decodeRole(jwt) {
  try { return Buffer.from(jwt.split('.')[1], 'base64').toString(); } catch { return ''; }
}
