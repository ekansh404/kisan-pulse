// Tools the Gemini agent can call. READ tools run immediately.
// WRITE actions go through propose_action -> the farmer must say "haan" before /api/actions saves it.
import { getWeather } from '@/lib/data/weather';
import { getMandiPrice } from '@/lib/data/mandi';
import { getSoil } from '@/lib/data/soil';
import { checkSchemes } from '@/lib/data/schemes';
import { geocode } from '@/lib/data/geo';
import { listPartners } from '@/lib/market';

export const DECLARATIONS = [
  {
    name: 'get_weather',
    description: "Real 7-day weather forecast and farm alerts. Uses the farmer's village if place is not given.",
    parameters: { type: 'OBJECT', properties: { place: { type: 'STRING', description: 'Town/district name in English, e.g. Lucknow' } } },
  },
  {
    name: 'get_mandi_price',
    description: "Today's real mandi (market) price of a crop from Agmarknet, ₹ per quintal. Uses farmer's district/state if not given.",
    parameters: {
      type: 'OBJECT',
      properties: {
        crop: { type: 'STRING', description: 'Crop in English or Hindi, e.g. wheat, gehun, dhan, potato' },
        district: { type: 'STRING' },
        state: { type: 'STRING' },
      },
      required: ['crop'],
    },
  },
  {
    name: 'get_soil',
    description: "Soil pH, texture, organic carbon, nitrogen at the farmer's location (SoilGrids model estimate). Use for fertiliser / crop choice advice.",
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'check_schemes',
    description: 'Government schemes the farmer is eligible for, with benefit, documents and how to apply.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'find_partners',
    description: 'List nearby service partners: machine (tractor, harvester), store (seeds, fertiliser, pesticide), labour, buyer (to sell crop).',
    parameters: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['machine', 'store', 'labour', 'buyer'] },
        need: { type: 'STRING', description: 'What exactly, e.g. tractor, urea, katai, wheat' },
      },
      required: ['type'],
    },
  },
  {
    name: 'propose_action',
    description:
      'Prepare a booking/order/request. Does NOT execute. The app will ask the farmer to confirm with haan/na. ' +
      'Call only when you know what they need. book_machine needs: need. order_input needs: need. hire_labour needs: count. sell_crop needs: crop and quantity_quintal.',
    parameters: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['book_machine', 'order_input', 'hire_labour', 'sell_crop'] },
        need: { type: 'STRING', description: 'machine or item, e.g. tractor, urea 2 bags, katai' },
        count: { type: 'NUMBER', description: 'number of labourers' },
        days: { type: 'NUMBER' },
        date: { type: 'STRING', description: 'when, as said by farmer, e.g. kal, 10 November' },
        crop: { type: 'STRING' },
        quantity_quintal: { type: 'NUMBER' },
      },
      required: ['type'],
    },
  },
];

const TYPE_OF = { book_machine: 'machine', order_input: 'store', hire_labour: 'labour', sell_crop: 'buyer' };

/** Run one tool call. Returns {result, card?, pending?} */
export async function runTool(name, args = {}, farmer = {}, lang = 'hi') {
  try {
    switch (name) {
      case 'get_weather': {
        let lat = farmer.lat, lon = farmer.lon, place = farmer.district || farmer.village;
        if (args.place) {
          const g = await geocode(args.place);
          if (g) { lat = g.lat; lon = g.lon; place = g.name; }
        }
        if (lat == null) return { result: { error: 'location_unknown', ask: 'Ask which village/district' } };
        const w = await getWeather(lat, lon, lang);
        return { result: { place, ...w }, card: { kind: 'weather', data: { place, ...w } } };
      }
      case 'get_mandi_price': {
        const m = await getMandiPrice({ crop: args.crop, district: args.district || farmer.district, state: args.state || farmer.state });
        return { result: m, card: m.found ? { kind: 'mandi', data: m } : null };
      }
      case 'get_soil': {
        if (farmer.lat == null) return { result: { error: 'location_unknown' } };
        return { result: await getSoil(farmer.lat, farmer.lon) };
      }
      case 'check_schemes': {
        const s = checkSchemes(farmer, lang);
        return { result: { schemes: s }, card: { kind: 'schemes', data: s } };
      }
      case 'find_partners': {
        const list = await listPartners({ type: args.type, lat: farmer.lat, lon: farmer.lon, need: args.need, limit: 3 });
        const slim = list.map((p) => ({ id: p.id, name: lang === 'en' ? p.name : p.name_hi || p.name, km: p.distance_km, rate: p.rate, unit: p.rate_unit, rating: p.rating, details: p.details }));
        return { result: { partners: slim, demo_data: true }, card: { kind: 'partners', data: slim } };
      }
      case 'propose_action': {
        const type = args.type;
        const [best] = await listPartners({ type: TYPE_OF[type], lat: farmer.lat, lon: farmer.lon, need: args.need || args.crop, limit: 1 });
        const payload = { need: args.need, count: args.count, days: args.days, date: args.date, crop: args.crop, quantity_quintal: args.quantity_quintal };
        const pending = { type, partnerId: best?.id || null, payload, partner: best ? { name: best.name, name_hi: best.name_hi, km: best.distance_km, rate: best.rate, unit: best.rate_unit } : null };
        return { result: { prepared: true, partner: pending.partner, note: 'Now ask the farmer to confirm with haan ya na. Do not say it is booked.' }, pending };
      }
      default:
        return { result: { error: 'unknown_tool' } };
    }
  } catch (e) {
    return { result: { error: String(e.message || e) } };
  }
}
