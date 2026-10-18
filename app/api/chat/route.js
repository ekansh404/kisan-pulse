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
  if (kind === 'mandi') return d.found ? { crop: d.commodity, date: d.date, not_today: !!d.recent, unit: '₹/quintal', average: d.average_modal, best: d.best, others: d.markets?.slice(1, 4).map((x) => ({ market: x.market, modal: x.modal })), cached: !!d.cached } : { found: false, note: d.note || d.error };
  if (kind === 'schemes') return d.schemes?.filter((s) => s.status !== 'not_eligible').map((s) => ({ name: s.name, status: s.status, benefit: s.benefit, needs_check: s.why, documents: s.documents, how_to_apply: s.how, official_site: s.source }));
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
- Talk like a person explaining to a neighbour, as a short story with a clear flow: what is happening -> what it means for THIS farmer -> what to do. 3 to 5 short sentences, about 60-90 words. No lists, no markdown, no emojis, no brackets.
- Numbers the way people say them: "2450 रुपये क्विंटल", "24 मिलीमीटर बारिश". Address the farmer as "${name}" at most once.
- Finish with ONE short follow-up question that helps them take the next step (skip it only when you are asking हाँ/ना to confirm a booking).

HOW TO EXPLAIN EACH TOPIC:
- Mandi price: today's best price and which mandi, how much other nearby mandis pay (the range), what that means (good day to sell or wait, which mandi is worth the trip), then ask e.g. whether to find a buyer or check another crop.
- Weather: what is coming today/tomorrow, the real risk for their crop at this stage, exactly what to do or avoid (spraying, irrigation, covering harvested crop), then ask if they want advice for their crop.
- Government schemes: name the scheme and its benefit in money terms, say clearly whether they look eligible (and what still needs checking), which documents they need, and the first step to apply (where to go / which website). If several schemes, give the top 2 briefly and ask which one to explain fully. When they pick one, walk them through documents and the application step by step.
- Soil / fertiliser / crop problems: what the data shows, what it means for their crop, what to apply and when; exact dose = "पैकेट पर लिखी मात्रा" or the nearest KVK.

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

PERSONA: You are Kisan Pulse, a farming assistant made by team Git-Set-Go. You only help with farming: weather and rain, mandi prices, government schemes, soil and fertiliser, crop care, and booking tractor, labour, seed or fertiliser. For questions about yourself or the app, answer in one or two short accurate sentences. For anything outside farming (films, cricket, politics, jokes, general knowledge), say politely in one sentence that you only help with farming, then ask a follow-up that brings them back, e.g. whether to tell today's weather or their crop's mandi price. Never pretend you did something you cannot do.

HONESTY: Farmer ID / land verification, insurance claims, loans and payments are demo-only in this prototype.`;
}

// Plain spoken summary of live data, used only if the AI can't answer right now
function narrate(d = {}, f = {}, lang = 'hi') {
  const hi = lang !== 'en';
  const out = [];
  const w = d.weather;
  if (w?.now) {
    out.push(hi ? `${w.place || f.district || ''} में अभी ${w.now.temp} डिग्री है, ${w.now.text}।` : `In ${w.place || f.district || ''} it is ${w.now.temp} degrees, ${w.now.text}.`);
    const t = w.next3days?.[1];
    if (t) out.push(hi ? `कल ${t.max} डिग्री तक रहेगा और ${t.rain_mm} मिलीमीटर बारिश का अनुमान है।` : `Tomorrow up to ${t.max} degrees with ${t.rain_mm} mm rain expected.`);
    if (w.alerts?.length) out.push(w.alerts[0]);
  }
  const m = d.mandi;
  if (m?.best) {
    out.push(hi ? `${m.crop} का आज सबसे अच्छा भाव ${m.best.market} मंडी में ${m.best.modal} रुपये क्विंटल है, और आसपास की मंडियों का औसत ${m.average} रुपये है।` : `${m.crop}: best price today ${m.best.modal} rupees per quintal at ${m.best.market}; nearby average ${m.average}.`);
  } else if (m && m.found === false) {
    out.push(hi ? 'आज आपके इलाके की मंडी से भाव दर्ज नहीं हुआ है।' : 'No mandi price has been reported in your area today.');
  }
  const sc = d.schemes;
  if (Array.isArray(sc) && sc.length) {
    const top = sc.filter((x) => x.status === 'eligible').slice(0, 2);
    if (top.length) out.push(hi ? `आप ${top.map((x) => x.name).join(' और ')} के लिए पात्र लगते हैं। ${top[0].benefit}। ${top[0].how_to_apply}` : `You look eligible for ${top.map((x) => x.name).join(' and ')}. ${top[0].benefit}. ${top[0].how_to_apply}`);
  }
  if (!out.length) return '';
  out.push(hi ? 'और कुछ जानना है तो पूछिए।' : 'Ask me if you want to know more.');
  return out.join(' ');
}

function normalizeHistory(history = []) {
  const out = [];
  for (const h of Array.isArray(history) ? history : []) {
    const text = String(h?.text || '').trim().slice(0, 700);
    if (!text) continue;
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].text += ' ' + text;
    else out.push({ role, text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out.slice(-6).length && out.slice(-6)[0].role !== 'user' ? out.slice(-5) : out.slice(-6);
}

// ---- Fixed personality for small talk: instant, no AI call, always the same accurate answer ----
// Only short messages with no farming topic in them land here. Each reply ends with a question
// that brings the farmer back to what the app can do.
const SMALL = [
  ['myname', /(मेरा|mera|my)\s*(नाम|naam|name)/i],
  ['maker', /किसने\s*बनाया|किसने\s*बनाई|who\s*(made|built|created)|kisne\s*banaya/i],
  ['name', /नाम|naam|your\s*name|who\s*are\s*you|कौन\s*हो|कौन\s*हैं|कौन\s*है\s*आप|kaun\s*ho|kaun\s*hai/i],
  ['cando', /क्या\s*(क्या|-क्या)?\s*कर\s*सकती|क्या\s*कर\s*सकते|किस\s*(काम|चीज़|चीज)|क्या\s*मदद|कैसे\s*मदद|क्या\s*पूछ|what\s*can\s*you|how\s*can\s*you\s*help|kya\s*kar\s*sakti|kya\s*kya|help$|मदद$/i],
  ['how', /कैसी\s*हो|कैसे\s*हो|कैसी\s*हैं|कैसे\s*हैं|क्या\s*हाल|how\s*are\s*you|kaisi\s*ho|kaise\s*ho|kya\s*haal/i],
  ['thanks', /धन्यवाद|शुक्रिया|थैंक|thank|dhanyavaad|dhanyavad|shukriya/i],
  ['bye', /अलविदा|बाय|फिर\s*मिलेंगे|बाद\s*में\s*बात|\bbye\b|good\s*night|शुभ\s*रात्रि/i],
  ['hello', /^(hello|hi|hey|helo|hlo|हेलो|हैलो|हलो|हाय|नमस्ते|नमस्कार|प्रणाम|राम\s*राम|जय\s*राम\s*जी\s*की|namaste|namaskar|ram\s*ram|good\s*morning|सुप्रभात)/i],
];

const CROP_HI = { wheat: 'गेहूं', paddy: 'धान', rice: 'चावल', sugarcane: 'गन्ने', potato: 'आलू', mustard: 'सरसों', maize: 'मक्का', chana: 'चने', arhar: 'अरहर', moong: 'मूंग', urad: 'उड़द', masoor: 'मसूर', peas: 'मटर', onion: 'प्याज', tomato: 'टमाटर', garlic: 'लहसुन', bajra: 'बाजरे', barley: 'जौ', mentha: 'मेंथा', banana: 'केले', mango: 'आम', groundnut: 'मूंगफली', soybean: 'सोयाबीन', cotton: 'कपास', cauliflower: 'गोभी' };
const CROP_EN = { paddy: 'paddy', chana: 'gram', arhar: 'arhar', vegetables: '' };

function smallTalk(message, f = {}, lang = 'hi') {
  const m = message.trim().replace(/[।?!.,]+/g, ' ').trim();
  if (!m || m.split(/\s+/).length > 8) return null;
  if (Object.values(RX).some((r) => r.test(m))) return null; // has a farming topic -> real answer
  if (CROP_KEYS.some((k) => m.toLowerCase().includes(k.toLowerCase()))) return null;
  const kind = SMALL.find(([, r]) => r.test(m))?.[0];
  if (!kind) return null;
  const hi = lang !== 'en';
  const name = f.name ? (hi ? `${f.name} जी` : `${f.name} ji`) : '';
  const c0 = f.crops?.[0];
  const crop = c0 ? (hi ? CROP_HI[c0] ?? (/[a-z]/i.test(c0) ? '' : c0) : CROP_EN[c0] ?? (/[a-z]/i.test(c0) ? c0 : '')) : '';
  const nudge = hi
    ? crop ? `आज ${crop} का मंडी भाव बताऊँ, या मौसम का हाल?` : 'आज मौसम का हाल बताऊँ, या मंडी भाव?'
    : crop ? `Shall I tell you today's ${crop} mandi price, or the weather?` : "Shall I tell you today's weather, or mandi prices?";
  const R = hi ? {
    hello: `नमस्कार${name ? ' ' + name : ''}! मैं आपकी किस प्रकार सहायता कर सकती हूँ? ${nudge}`,
    name: `मेरा नाम किसान पल्स है। मैं आपकी खेती की सहायक हूँ। ${nudge}`,
    myname: f.name ? `आपका नाम ${f.name} जी है। ${nudge}` : `आपका नाम अभी दर्ज नहीं है। ${nudge}`,
    maker: `मुझे टीम गिट-सेट-गो ने किसानों की मदद के लिए बनाया है। ${nudge}`,
    cando: `मैं आपको आज का मौसम और बारिश, मंडी भाव, सरकारी योजनाएँ, मिट्टी और खाद की सलाह बता सकती हूँ। ट्रैक्टर, मज़दूर या खाद की बुकिंग भी करवा सकती हूँ। ${nudge}`,
    how: `मैं ठीक हूँ, पूछने के लिए धन्यवाद${name ? ' ' + name : ''}। ${nudge}`,
    thanks: `आपका स्वागत है${name ? ' ' + name : ''}। कुछ और जानना हो तो बताइए। ${nudge}`,
    bye: `ठीक है${name ? ' ' + name : ''}, अपना ध्यान रखिए। जब भी ज़रूरत हो, बड़ा माइक दबाइए।`,
  } : {
    hello: `Namaskar${name ? ' ' + name : ''}! How may I help you? ${nudge}`,
    name: `My name is Kisan Pulse. I am your farming assistant. ${nudge}`,
    myname: f.name ? `Your name is ${f.name} ji. ${nudge}` : `Your name is not saved yet. ${nudge}`,
    maker: `I was made by team Git-Set-Go to help farmers. ${nudge}`,
    cando: `I can tell you today's weather and rain, mandi prices, government schemes, and soil and fertiliser advice. I can also book a tractor, labour or fertiliser for you. ${nudge}`,
    how: `I am fine, thank you for asking${name ? ' ' + name : ''}. ${nudge}`,
    thanks: `You are welcome${name ? ' ' + name : ''}. Tell me if you need anything else. ${nudge}`,
    bye: `Okay${name ? ' ' + name : ''}, take care. Tap the big mic whenever you need me.`,
  };
  return R[kind];
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

  const quick = smallTalk(message, clientFarmer, lang);
  if (quick) {
    const s0 = db();
    if (s0 && farmerId) s0.from('messages').insert([{ farmer_id: farmerId, role: 'user', text: message }, { farmer_id: farmerId, role: 'assistant', text: quick }]).then(() => {}, () => {});
    return Response.json({ reply: quick, cards: [], pending: null, ms: Date.now() - t0, debug: { path: 'persona' } });
  }
  if (!geminiReady()) return Response.json({ reply: M.key, cards: [], pending: null });

  // Profile from DB (fresh) — in parallel with nothing else blocking
  let farmer = clientFarmer;
  const s = db();
  if (s && farmerId) {
    const { data } = await withTimeout(s.from('farmers').select('*').eq('id', farmerId).maybeSingle(), 2500, { data: null });
    if (data) farmer = data;
  }

  // Clean conversation history: drop empties, merge same-speaker turns, must start with the farmer.
  const turns = normalizeHistory(history);

  // Live data the question needs. Follow-ups like "इसके कागज़ क्या लगेंगे?" have no keywords,
  // so we also look at the farmer's previous question to carry the topic forward.
  const lastUser = [...turns].reverse().find((t) => t.role === 'user')?.text || '';
  let pre = await prefetch(message, farmer, lang);
  if (!Object.keys(pre.data).length && lastUser && message.split(/\s+/).length <= 8) pre = await prefetch(lastUser + ' ' + message, farmer, lang);
  const live = Object.keys(pre.data).length ? `\n\n[LIVE DATA, fetched just now]\n${JSON.stringify(pre.data)}` : '';

  const cards = [...pre.cards];
  let pending = null;
  let reply = '';
  let debug = '';

  // Attempt 1: full conversation with tools. Attempt 2 (if Gemini rejects it): one compact turn.
  const attempts = [
    () => [...turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })), { role: 'user', parts: [{ text: message + live }] }],
    () => [{ role: 'user', parts: [{ text: (turns.length ? `Conversation so far:\n${turns.map((t) => (t.role === 'user' ? 'Farmer: ' : 'You: ') + t.text).join('\n')}\n\nFarmer now says: ` : '') + message + live }] }],
  ];
  for (let a = 0; a < attempts.length && !reply; a++) {
    const contents = attempts[a]();
    try {
      for (let round = 0; round < 3; round++) {
        const out = await gemini({ system: systemPrompt(farmer, lang), contents, tools: DECLARATIONS, maxTokens: 500, timeoutMs: 9000, think: a === 0 && round === 0 });
        if (!out.calls.length) { reply = out.text; break; }
        contents.push({ role: 'model', parts: out.parts });
        const results = await Promise.all(out.calls.map((c) => runTool(c.name, c.args || {}, farmer, lang)));
        const responses = out.calls.map((c, i) => {
          const r = results[i];
          if (r.card) cards.push(r.card);
          if (r.pending) pending = r.pending;
          return { functionResponse: { name: c.name, response: r.result && typeof r.result === 'object' && !Array.isArray(r.result) ? r.result : { result: r.result } } };
        });
        contents.push({ role: 'user', parts: responses });
      }
    } catch (e) {
      console.error(`chat attempt ${a + 1} failed`, e?.message);
      debug = String(e?.message || e).slice(0, 300);
    }
  }
  if (!reply) reply = narrate(pre.data, farmer, lang) || (/429|5\d\d|timeout/i.test(debug) ? M.busy : M.net);

  reply = stripMarkdown(reply) || narrate(pre.data, farmer, lang) || M.none;
  if (pending && !/हाँ या ना|yes or no/i.test(reply)) reply += lang === 'en' ? ' Shall I confirm? Yes or no?' : ' क्या मैं पक्का कर दूँ? हाँ या ना?';

  if (s && farmerId) {
    s.from('messages').insert([{ farmer_id: farmerId, role: 'user', text: message }, { farmer_id: farmerId, role: 'assistant', text: reply }]).then(() => {}, () => {});
  }
  return Response.json({ reply, cards: cards.slice(0, 1), pending, ms: Date.now() - t0, debug: debug || undefined });
}
