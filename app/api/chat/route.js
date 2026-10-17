// POST /api/chat  -> the voice assistant brain (Gemini + tools)
// body: { farmerId?, farmer?, lang:'hi'|'en', message, history:[{role:'user'|'assistant', text}] }
// returns: { reply, cards:[], pending: null | {type, partnerId, payload, partner} }
//
// Speed: we guess which live data the question needs (weather / mandi / schemes / soil), fetch it in
// parallel BEFORE calling Gemini, and give it to the model. Most answers then need ONE Gemini call
// instead of two or three. Tools stay available for anything else (other places, bookings, partners).
import { gemini, geminiReady, stripMarkdown } from '@/lib/gemini';
import { DECLARATIONS, runTool } from '@/lib/agent/tools';
import { COMMODITY } from '@/lib/data/mandi';
import { db } from '@/lib/db';

export const maxDuration = 30;

const RX = {
  weather: /मौसम|बारिश|बरसात|बादल|तापमान|गर्मी|ठंड|सर्दी|पाला|ओले|आंधी|तूफ़ान|तूफान|हवा|धूप|weather|rain|temperature|forecast|mausam|baarish|barish|garmi|thand/i,
  mandi: /भाव|दाम|रेट|कीमत|मंडी|बेच|बिक्री|price|rate|mandi|bhav|bhaav|daam|sell|market/i,
  schemes: /योजना|स्कीम|सब्सिडी|पेंशन|बीमा|लोन|कर्ज़|कर्ज|किसान सम्मान|पीएम किसान|सरकारी|scheme|yojana|subsidy|insurance|bima|loan|kcc|pm.?kisan|government/i,
  soil: /मिट्टी|मिटटी|खाद|उर्वरक|यूरिया|डीएपी|पोटाश|soil|fertili[sz]er|urea|dap|mitti|khad/i,
};
const CROP_KEYS = Object.keys(COMMODITY).sort((a, b) => b.length - a.length);

function findCrop(msg, farmer) {
  const m = msg.toLowerCase();
  const hit = CROP_KEYS.find((k) => m.includes(k.toLowerCase()));
  return hit || farmer.crops?.[0] || null;
}

const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

// Keep the injected data small: fewer tokens = faster answer
function slim(kind, d) {
  if (!d || d.error) return d;
  if (kind === 'weather') return { place: d.place, now: d.current, next3days: d.days?.slice(0, 3).map(({ date, max, min, rain_mm, rain_prob, text }) => ({ date, max, min, rain_mm, rain_prob, text })), alerts: d.alerts?.map((a) => a.title + ': ' + a.advice) };
  if (kind === 'mandi') return d.found ? { crop: d.commodity, date: d.date, unit: '₹/quintal', average: d.average_modal, best: d.best, others: d.markets?.slice(1, 4).map((x) => ({ market: x.market, modal: x.modal })), cached: !!d.cached } : { found: false, note: d.note || d.error };
  if (kind === 'schemes') return d.schemes?.filter((s) => s.status !== 'not_eligible').map((s) => ({ name: s.name, status: s.status, benefit: s.benefit, how: s.how }));
  return d;
}

async function prefetch(message, farmer, lang) {
  const jobs = [];
  if (RX.weather.test(message) && farmer.lat != null) jobs.push(['weather', 'get_weather', {}]);
  if (RX.mandi.test(message)) { const crop = findCrop(message, farmer); if (crop) jobs.push(['mandi', 'get_mandi_price', { crop }]); }
  if (RX.schemes.test(message)) jobs.push(['schemes', 'check_schemes', {}]);
  if (RX.soil.test(message) && farmer.lat != null) jobs.push(['soil', 'get_soil', {}]);
  const out = await Promise.all(jobs.map(([kind, tool, args]) => withTimeout(runTool(tool, args, farmer, lang), 7000, { result: { error: 'timeout' } }).then((r) => [kind, r])));
  const data = {};
  const cards = [];
  for (const [kind, r] of out) {
    data[kind] = slim(kind, r.result);
    if (r.card) cards.push(r.card);
  }
  return { data, cards };
}

function systemPrompt(f, lang) {
  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const month = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long' });
  const name = f.name ? `${f.name} जी` : lang === 'en' ? 'ji' : 'आप';
  return `You are "Kisan Pulse" (किसान पल्स), a caring, experienced woman agronomist from rural Uttar Pradesh, talking to a farmer on the phone. You are practical, warm and confident, like a trusted didi from the Krishi Vigyan Kendra. Today is ${today} (${month}).

FARMER: ${f.name || 'unknown'} | ${[f.village, f.district, f.state].filter(Boolean).join(', ') || 'location unknown'} | land ${f.land_acres ? f.land_acres + ' acres' : 'unknown'} | crops ${(f.crops || []).join(', ') || 'unknown'}

UNDERSTANDING THE FARMER:
- The message comes from phone speech recognition. It can have mistakes, missing words, Hinglish or dialect (Awadhi/Bhojpuri). Work out what a farmer most likely meant (e.g. "मंडी भाग" = मंडी भाव, "गेंहू/गेहू" = गेहूं, "यूरीया" = यूरिया, "बारिस" = बारिश) and answer that. Don't comment on the mistakes.
- Use the conversation so far: "उसका", "और", "कल का?" refer to the previous topic.
- Think about the farmer's real situation: their crop, this month's crop stage in UP, their land size, the weather. Give advice that fits them, not generic text.

HOW TO SPEAK (read aloud by a voice):
- ${lang === 'en' ? 'Simple Indian English.' : 'Everyday spoken Hindi in Devanagari, the way people talk in UP villages. No heavy Sanskrit words, no English jargon.'}
- Start with the direct answer. 2 or 3 short sentences, under 50 words. No lists, no markdown, no emojis, no brackets.
- Numbers the way people say them: "चौबीस सौ पचास रुपये क्विंटल" or "2450 रुपये क्विंटल", "24 मिलीमीटर".
- Address the farmer as "${name}" at most once. End with one concrete thing to do (what, when, how much) when it helps.

DATA:
- LIVE DATA may be attached under the farmer's message: real and fresh, use it directly; don't call the same tool again.
- LIVE DATA weather is for the farmer's own village. Another place → call get_weather with that place.
- Other live facts (another crop's price, soil, partners) → call the tool. Never invent prices, weather or scheme money. If data has an error, say it isn't available right now and give the best practical advice anyway.
- Pesticide/fertiliser: name the right type and timing; for exact dose say "पैकेट पर लिखी मात्रा" or nearest KVK.

DECIDING:
- Enough information → answer confidently.
- Missing something essential (which crop to price, how many labourers, how many quintals to sell) → ask ONE short question.
- Never ask the same follow-up twice; give your best answer and state the assumption.
- If the message is just noise or one unclear word, say "मैं ठीक से समझ नहीं पाई" and give one example question.

ACTIONS (tractor, fertiliser/seed order, labour, selling crop): call propose_action (it does not book). Then say who, what and price in one sentence and end with "${lang === 'en' ? 'Shall I confirm? Yes or no?' : 'क्या मैं पक्का कर दूँ? हाँ या ना?'}". Never say it is booked yourself.

HONESTY: Farmer ID / land verification, insurance claims, loans and payments are demo-only in this prototype.`;
}

const msgFor = (lang) => ({
  busy: lang === 'en' ? 'The server is busy right now. Please ask again in a moment.' : 'सर्वर अभी व्यस्त है। कृपया थोड़ी देर में फिर पूछिए।',
  net: lang === 'en' ? 'Sorry, there is a problem with the internet. Please ask again.' : 'माफ़ कीजिए, इंटरनेट में दिक्कत है। कृपया दोबारा पूछिए।',
  none: lang === 'en' ? "Sorry, I couldn't answer that. Please ask again." : 'माफ़ कीजिए, मैं जवाब नहीं दे पाई। कृपया दोबारा पूछिए।',
  key: lang === 'en' ? 'AI key is not set on the server.' : 'सर्वर पर AI की चाबी (API key) नहीं लगी है।',
});

export async function POST(req) {
  const t0 = Date.now();
  const { farmerId, farmer: clientFarmer = {}, lang = 'hi', message = '', history = [] } = await req.json().catch(() => ({}));
  const M = msgFor(lang);
  if (!message.trim()) return Response.json({ reply: '', cards: [], pending: null });
  if (!geminiReady()) return Response.json({ reply: M.key, cards: [], pending: null });

  // Profile from DB (fresh) — in parallel with nothing else blocking
  let farmer = clientFarmer;
  const s = db();
  if (s && farmerId) {
    const { data } = await withTimeout(s.from('farmers').select('*').eq('id', farmerId).maybeSingle(), 2500, { data: null });
    if (data) farmer = data;
  }

  // Live data the question obviously needs, fetched in parallel
  const pre = await prefetch(message, farmer, lang);
  const live = Object.keys(pre.data).length ? `\n\n[LIVE DATA, fetched just now]\n${JSON.stringify(pre.data)}` : '';

  const contents = [
    ...history.slice(-6).map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: message + live }] },
  ];

  const cards = [...pre.cards];
  let pending = null;
  let reply = '';
  try {
    for (let round = 0; round < 3; round++) {
      const out = await gemini({ system: systemPrompt(farmer, lang), contents, tools: DECLARATIONS, maxTokens: 400, timeoutMs: 14000, think: round === 0 });
      if (!out.calls.length) { reply = out.text; break; }
      contents.push({ role: 'model', parts: out.parts });
      const results = await Promise.all(out.calls.map((c) => runTool(c.name, c.args || {}, farmer, lang)));
      const responses = out.calls.map((c, i) => {
        const r = results[i];
        if (r.card) cards.push(r.card);
        if (r.pending) pending = r.pending;
        return { functionResponse: { name: c.name, response: r.result } };
      });
      contents.push({ role: 'user', parts: responses });
    }
  } catch (e) {
    console.error('chat error', e);
    reply = e?.busy || e?.name === 'AbortError' ? M.busy : M.net;
  }

  reply = stripMarkdown(reply) || M.none;
  if (pending && !/हाँ या ना|yes or no/i.test(reply)) reply += lang === 'en' ? ' Shall I confirm? Yes or no?' : ' क्या मैं पक्का कर दूँ? हाँ या ना?';

  if (s && farmerId) {
    s.from('messages').insert([{ farmer_id: farmerId, role: 'user', text: message }, { farmer_id: farmerId, role: 'assistant', text: reply }]).then(() => {}, () => {});
  }
  return Response.json({ reply, cards: cards.slice(0, 1), pending, ms: Date.now() - t0 });
}
