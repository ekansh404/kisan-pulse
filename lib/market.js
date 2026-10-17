// STUB — Person 4 replaces this file with real Supabase-backed partners + actions.
export const TYPES = ['machine', 'store', 'labour', 'buyer'];
export async function listPartners() {
  return [{ id: 'stub-1', type: 'machine', name: 'Suresh Yadav (stub)', name_hi: 'सुरेश यादव (स्टब)', distance_km: 3, rate: 800, rate_unit: 'hour', rating: 4.6, details: { machine: 'Tractor' } }];
}
export async function executeAction({ type, payload = {} }) {
  return { ok: true, request: { id: 'stub', type, payload }, partner: null, message_hi: 'डेमो: आपका अनुरोध भेज दिया गया।', message_en: 'Demo: request sent.' };
}
