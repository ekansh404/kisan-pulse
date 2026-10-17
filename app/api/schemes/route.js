// POST /api/schemes  body: { farmer: {land_acres, crops, ...}, lang }
import { checkSchemes } from '@/lib/data/schemes';

export async function POST(req) {
  const { farmer = {}, lang = 'hi' } = await req.json().catch(() => ({}));
  return Response.json({ schemes: checkSchemes(farmer, lang) });
}