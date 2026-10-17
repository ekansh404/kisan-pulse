// POST /api/chat  -> the voice assistant brain (Gemini + tools)
// body: { farmerId?, farmer?, lang:'hi'|'en', message, history:[{role:'user'|'assistant', text}] }
// returns: { reply, cards:[], pending: null | {type, partnerId, payload, partner} }
import { gemini, geminiReady } from '@/lib/gemini';
import { DECLARATIONS, runTool } from '@/lib/agent/tools';
import { db } from '@/lib/db';

export const maxDuration = 30;

function systemPrompt(f, lang) {
  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `You are "Kisan Pulse", a warm female voice assistant for Indian farmers. Today is ${today}.
Reply language: ${lang === 'en' ? 'simple Indian English' : 'simple spoken Hindi in Devanagari (use common words, not Sanskritised Hindi)'}.

FARMER PROFILE:
name: ${f.name || 'unknown'} | village: ${f.village || '?'} | district: ${f.district || '?'} | state: ${f.state || '?'}
land: ${f.land_acres ? f.land_acres + ' acres' : '?'} | crops: ${(f.crops || []).join(', ') || '?'}

HOW TO ANSWER (this is read aloud, so):
- 2 to 4 short sentences. No markdown, no lists, no emojis, no symbols like * or #.
- Address the farmer as "${f.name ? f.name + ' जी' : 'आप'}".
- For weather, prices, soil, schemes, partners: ALWAYS call the tool. Never invent numbers. If a tool returns an error or nothing, say the data is not available right now and suggest what they can do.
- Crop advice: use your agronomy knowledge for their crop, season (today's date) and the soil/weather tools when useful. Give one clear next step. For pesticide/fertiliser doses, say to follow the product label or the local KVK / agriculture officer.

CONFIDENCE RULES:
- If you have enough information, answer directly and confidently.
- If something essential is missing (e.g. which crop, how many labourers, how much to sell), ask ONE short follow-up question instead of guessing.
- Never ask more than one follow-up for the same request. If it is still unclear after that, give your best answer and say what you assumed. Do not keep polishing or asking.
- If the message is off-topic or unclear noise, briefly say you didn't understand and give one example of what they can ask.

ACTIONS (book tractor, order fertiliser, hire labour, sell crop):
- Use propose_action. It does NOT book anything. After it, say who/what/price in one sentence and end with "${lang === 'en' ? 'Shall I confirm? Yes or no?' : 'क्या मैं पक्का कर दूँ? हाँ या ना?'}"
- Never say something is booked/ordered yourself.

HONESTY: Farmer ID / land verification, insurance claims, loans and payments are demo-only in this prototype. Say so if asked.`;
}

export async function POST(req) {
  const { farmerId, farmer: clientFarmer = {}, lang = 'hi', message = '', history = [] } = await req.json().catch(() => ({}));
  if (!message.trim()) return Response.json({ reply: '', cards: [], pending: null });
  if (!geminiReady()) {
    return Response.json({ reply: lang === 'en' ? 'AI key is not set on the server.' : 'सर्वर पर AI की चाबी (API key) नहीं लगी है।', cards: [], pending: null });
  }

  // Fresh profile from DB if we have it
  let farmer = clientFarmer;
  const s = db();
  if (s && farmerId) {
    const { data } = await s.from('farmers').select('*').eq('id', farmerId).maybeSingle();
    if (data) farmer = data;
  }

  const contents = [
    ...history.slice(-8).map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const cards = [];
  let pending = null;
  let reply = '';
  try {
    for (let round = 0; round < 4; round++) {
      const out = await gemini({ system: systemPrompt(farmer, lang), contents, tools: DECLARATIONS });
      if (!out.calls.length) { reply = out.text; break; }
      contents.push({ role: 'model', parts: out.parts });
      const responses = [];
      for (const call of out.calls) {
        const r = await runTool(call.name, call.args || {}, farmer, lang);
        if (r.card) cards.push(r.card);
        if (r.pending) pending = r.pending;
        responses.push({ functionResponse: { name: call.name, response: r.result } });
      }
      contents.push({ role: 'user', parts: responses });
    }
  } catch (e) {
    console.error(e);
    reply = lang === 'en' ? 'Sorry, there is a problem with the internet. Please ask again.' : 'माफ़ कीजिए, इंटरनेट में दिक्कत है। कृपया दोबारा पूछिए।';
  }

  if (!reply) reply = lang === 'en' ? 'Sorry, I could not answer that. Please ask again.' : 'माफ़ कीजिए, मैं जवाब नहीं दे पाई। कृपया दोबारा पूछिए।';
  if (pending && !/हाँ या ना|yes or no/i.test(reply)) reply += lang === 'en' ? ' Shall I confirm? Yes or no?' : ' क्या मैं पक्का कर दूँ? हाँ या ना?';

  // log (best effort)
  if (s && farmerId) {
    s.from('messages').insert([{ farmer_id: farmerId, role: 'user', text: message }, { farmer_id: farmerId, role: 'assistant', text: reply }]).then(() => {});
  }
  return Response.json({ reply, cards, pending });
}
