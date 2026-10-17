// STUB — Person 3 replaces this file.
import { getWeather } from '@/lib/data/weather';
export async function GET() { return Response.json(await getWeather()); }
