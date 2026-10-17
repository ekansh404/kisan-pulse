// Server-only Supabase client. Import this ONLY inside app/api/* routes or lib/data/* (server code).
import { createClient } from '@supabase/supabase-js';

let client = null;

export function db() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // app still runs without DB (features degrade)
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Small helpers used by many files
export async function cacheGet(key, maxAgeMinutes) {
  const s = db();
  if (!s) return null;
  const { data } = await s.from('api_cache').select('value, updated_at').eq('key', key).maybeSingle();
  if (!data) return null;
  const age = (Date.now() - new Date(data.updated_at).getTime()) / 60000;
  if (maxAgeMinutes && age > maxAgeMinutes) return { stale: true, value: data.value };
  return { stale: false, value: data.value };
}

export async function cacheSet(key, value) {
  const s = db();
  if (!s) return;
  await s.from('api_cache').upsert({ key, value, updated_at: new Date().toISOString() });
}
