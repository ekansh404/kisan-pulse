'use client';
// Helpers for voice onboarding: parsing spoken numbers, land units, language, and AI slot extraction.

const DEV_DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
const WORDS = {
  zero: 0, shunya: 0, 'शून्य': 0, 'जीरो': 0, 'ज़ीरो': 0,
  one: 1, ek: 1, 'एक': 1, two: 2, do: 2, 'दो': 2, three: 3, teen: 3, 'तीन': 3,
  four: 4, char: 4, chaar: 4, 'चार': 4, five: 5, paanch: 5, panch: 5, 'पांच': 5, 'पाँच': 5,
  six: 6, chhe: 6, che: 6, 'छह': 6, 'छः': 6, 'छै': 6, seven: 7, saat: 7, 'सात': 7,
  eight: 8, aath: 8, 'आठ': 8, nine: 9, nau: 9, 'नौ': 9,
};

/** "९८ seven 6..." -> "9876..." */
export function spokenDigits(text = '') {
  let s = text.replace(/[०-९]/g, (d) => DEV_DIGITS[d]);
  s = s.split(/\s+/).map((w) => (WORDS[w.toLowerCase()] !== undefined ? String(WORDS[w.toLowerCase()]) : w)).join(' ');
  return s.replace(/\D/g, '');
}

export function parsePhone(text) {
  let d = spokenDigits(text);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function parseOtp(text, len) {
  const d = spokenDigits(text);
  return d.length === len ? d : null;
}

export function detectLang(text = '') {
  const s = text.toLowerCase();
  if (/english|इंग्लिश|अंग्रेज़ी|अंग्रेजी|angrezi/.test(s)) return 'en';
  if (/hindi|हिंदी|हिन्दी/.test(s)) return 'hi';
  return null;
}

// 1 bigha differs by state. UP/Bihar "pucca bigha" ≈ 0.625 acre. We always read the acres back to confirm.
const TO_ACRES = { acre: 1, hectare: 2.471, bigha: 0.625, biswa: 0.03125, kanal: 0.125, guntha: 0.025 };
export function toAcres(value, unit = 'acre') {
  const f = TO_ACRES[unit] ?? 1;
  return Math.round(Number(value) * f * 100) / 100;
}

/** Ask the server AI to pull a field out of a free sentence. field: name|place|land|crops|phone|otp|farmer_id */
export async function extract(field, text, lang = 'hi') {
  try {
    const r = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, text, lang }),
    });
    return await r.json();
  } catch {
    return { ok: false };
  }
}


/* ---------------- Local parsers (fast, no AI needed for common answers) ---------------- */

const NAME_FILLER = /(मेरा|मेरी|मेरे|शुभ|नाम|है|हैं|हूँ|हूं|जी|मैं|मै|का|की|बोलते|कहते|लोग|my|name|is|i|am|im|mera|meri|naam|hai|hain|hoon|hu|ji|main|mai|mujhe|log|kehte|bolte)/i;
/** "मेरा नाम रमेश कुमार है" -> "रमेश कुमार" (null if unsure) */
export function parseName(text = '') {
  const words = text.replace(/[।.,!?]/g, ' ').split(/\s+/).filter(Boolean).filter((w) => !new RegExp('^' + NAME_FILLER.source + '$', 'i').test(w));
  if (words.length < 1 || words.length > 3) return null;
  return words.map((w) => (/^[a-z]/i.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ');
}

const NUM_WORDS = {
  'आधा': 0.5, 'आधी': 0.5, 'aadha': 0.5, 'डेढ़': 1.5, 'डेढ': 1.5, 'dedh': 1.5, 'ढाई': 2.5, 'dhai': 2.5, 'dhaai': 2.5,
  'एक': 1, 'ek': 1, 'दो': 2, 'do': 2, 'तीन': 3, 'teen': 3, 'चार': 4, 'char': 4, 'chaar': 4, 'पांच': 5, 'पाँच': 5, 'panch': 5, 'paanch': 5,
  'छह': 6, 'छः': 6, 'chhe': 6, 'che': 6, 'सात': 7, 'saat': 7, 'आठ': 8, 'aath': 8, 'नौ': 9, 'nau': 9, 'दस': 10, 'das': 10,
  'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'पन्द्रह': 15, 'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20, 'bees': 20,
  'पच्चीस': 25, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'सौ': 100,
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'half': 0.5,
};
const UNITS = [
  [/बीघा|बिगहा|बीघे|bigha|beegha|bigaha/i, 'bigha'],
  [/एकड़|एकड|एकर|acre|ekad|ekar/i, 'acre'],
  [/हेक्टेयर|हेक्टर|hectare|hectre|hektar/i, 'hectare'],
  [/बिस्वा|biswa/i, 'biswa'],
];
/** "ढाई बीघा" -> {value:2.5, unit:'bigha'}; "साढ़े तीन एकड़" -> {value:3.5, unit:'acre'} */
export function parseLand(text = '') {
  const t = text.replace(/[०-९]/g, (d) => DEV_DIGITS[d]).toLowerCase();
  let value = null;
  const num = t.match(/\d+(\.\d+)?/);
  if (num) value = parseFloat(num[0]);
  else {
    for (const w of t.split(/\s+/)) if (NUM_WORDS[w] !== undefined) { value = NUM_WORDS[w]; break; }
  }
  if (value == null) return null;
  if (/साढ़े|साढे|sadhe|saadhe/.test(t)) value += 0.5;
  else if (/सवा|sawa|sava/.test(t)) value += 0.25;
  else if (/पौने|paune/.test(t)) value -= 0.25;
  const unit = (UNITS.find(([re]) => re.test(t)) || [null, 'bigha'])[1];
  return value > 0 ? { value, unit } : null;
}

const CROPS = {
  wheat: /गेहूं|गेहूँ|गेंहू|गेहू|gehun|gehu|gehoon|wheat/i, paddy: /धान|dhan|paddy/i, rice: /चावल|chawal|rice/i,
  sugarcane: /गन्ना|गन्ने|ganna|sugarcane/i, potato: /आलू|aalu|aloo|potato/i, mustard: /सरसों|सरसो|sarson|mustard/i,
  maize: /मक्का|makka|maize|corn/i, chana: /चना|chana|gram/i, arhar: /अरहर|arhar|tur dal/i, moong: /मूंग|moong/i,
  urad: /उड़द|उरद|urad/i, masoor: /मसूर|masoor|lentil/i, peas: /मटर|matar|peas/i, onion: /प्याज|pyaz|pyaaz|onion/i,
  tomato: /टमाटर|tamatar|tomato/i, garlic: /लहसुन|lahsun|garlic/i, bajra: /बाजरा|bajra|millet/i, barley: /जौ|jau|barley/i,
  mentha: /मेंथा|पिपरमिंट|mentha/i, vegetables: /सब्ज़ी|सब्जी|sabzi|sabji|vegetable/i, banana: /केला|kela|banana/i, mango: /आम के|आम का|बाग|mango/i,
  groundnut: /मूंगफली|moongfali|groundnut/i, soybean: /सोयाबीन|soybean/i, cotton: /कपास|kapas|cotton/i, cauliflower: /गोभी|gobhi|cauliflower/i,
};
/** "गेहूं और धान, थोड़ा आलू" -> ['wheat','paddy','potato'] */
export function parseCrops(text = '') {
  return Object.entries(CROPS).filter(([, re]) => re.test(text)).map(([k]) => k);
}

// Hindi place names -> English (geocoding works best in English). UP districts + Lucknow blocks + big cities.
const PLACES = {
  'आगरा': 'Agra', 'अलीगढ़': 'Aligarh', 'अंबेडकर नगर': 'Ambedkar Nagar', 'अमेठी': 'Amethi', 'अमरोहा': 'Amroha', 'औरैया': 'Auraiya', 'अयोध्या': 'Ayodhya', 'फैजाबाद': 'Ayodhya',
  'आजमगढ़': 'Azamgarh', 'आज़मगढ़': 'Azamgarh', 'बागपत': 'Baghpat', 'बहराइच': 'Bahraich', 'बलिया': 'Ballia', 'बलरामपुर': 'Balrampur', 'बांदा': 'Banda', 'बाँदा': 'Banda',
  'बाराबंकी': 'Barabanki', 'बरेली': 'Bareilly', 'बस्ती': 'Basti', 'भदोही': 'Bhadohi', 'बिजनौर': 'Bijnor', 'बदायूं': 'Budaun', 'बदायूँ': 'Budaun', 'बुलंदशहर': 'Bulandshahr',
  'चंदौली': 'Chandauli', 'चित्रकूट': 'Chitrakoot', 'देवरिया': 'Deoria', 'एटा': 'Etah', 'इटावा': 'Etawah', 'फर्रुखाबाद': 'Farrukhabad', 'फतेहपुर': 'Fatehpur', 'फिरोजाबाद': 'Firozabad',
  'नोएडा': 'Noida', 'गाजियाबाद': 'Ghaziabad', 'गाज़ियाबाद': 'Ghaziabad', 'गाजीपुर': 'Ghazipur', 'गाज़ीपुर': 'Ghazipur', 'गोंडा': 'Gonda', 'गोरखपुर': 'Gorakhpur', 'हमीरपुर': 'Hamirpur',
  'हापुड़': 'Hapur', 'हरदोई': 'Hardoi', 'हाथरस': 'Hathras', 'जालौन': 'Jalaun', 'उरई': 'Orai', 'जौनपुर': 'Jaunpur', 'झांसी': 'Jhansi', 'झाँसी': 'Jhansi', 'कन्नौज': 'Kannauj', 'कानपुर': 'Kanpur',
  'कासगंज': 'Kasganj', 'कौशांबी': 'Kaushambi', 'कुशीनगर': 'Kushinagar', 'लखीमपुर': 'Lakhimpur', 'ललितपुर': 'Lalitpur', 'लखनऊ': 'Lucknow', 'महाराजगंज': 'Maharajganj', 'महोबा': 'Mahoba',
  'मैनपुरी': 'Mainpuri', 'मथुरा': 'Mathura', 'मऊ': 'Mau', 'मेरठ': 'Meerut', 'मिर्जापुर': 'Mirzapur', 'मिर्ज़ापुर': 'Mirzapur', 'मुरादाबाद': 'Moradabad', 'मुजफ्फरनगर': 'Muzaffarnagar',
  'मुज़फ्फरनगर': 'Muzaffarnagar', 'पीलीभीत': 'Pilibhit', 'प्रतापगढ़': 'Pratapgarh', 'प्रयागराज': 'Prayagraj', 'इलाहाबाद': 'Prayagraj', 'रायबरेली': 'Rae Bareli', 'रामपुर': 'Rampur',
  'सहारनपुर': 'Saharanpur', 'संभल': 'Sambhal', 'शाहजहांपुर': 'Shahjahanpur', 'शाहजहाँपुर': 'Shahjahanpur', 'शामली': 'Shamli', 'श्रावस्ती': 'Shravasti', 'सिद्धार्थनगर': 'Siddharthnagar',
  'सीतापुर': 'Sitapur', 'सोनभद्र': 'Sonbhadra', 'सुल्तानपुर': 'Sultanpur', 'उन्नाव': 'Unnao', 'वाराणसी': 'Varanasi', 'बनारस': 'Varanasi',
  'मलिहाबाद': 'Malihabad', 'बख्शी का तालाब': 'Bakshi Ka Talab', 'बीकेटी': 'Bakshi Ka Talab', 'मोहनलालगंज': 'Mohanlalganj', 'काकोरी': 'Kakori', 'इटौंजा': 'Itaunja', 'गोसाईगंज': 'Gosainganj', 'चिनहट': 'Chinhat',
  'दिल्ली': 'Delhi', 'पटना': 'Patna', 'जयपुर': 'Jaipur', 'भोपाल': 'Bhopal', 'देहरादून': 'Dehradun', 'नागपुर': 'Nagpur', 'इंदौर': 'Indore',
};
const PLACE_FILLER = /^(मेरा|मेरी|गाँव|गांव|गाव|ज़िला|जिला|जनपद|है|हैं|और|से|में|का|की|के|हूँ|हूं|मैं|ब्लॉक|तहसील|mera|gaon|gaanv|zila|jila|district|village|hai|aur|se|me|mein|ka|ki|ke|hoon|block|tehsil|from|i|am|is|my|and|in|of)$/i;
/** Possible place names to try with geocoding, best first: ["Malihabad", "Lucknow", ...] */
export function placeCandidates(text = '') {
  const out = [];
  let rest = text;
  for (const [hi, en] of Object.entries(PLACES).sort((a, b) => b[0].length - a[0].length)) {
    if (rest.includes(hi)) { out.push(en); rest = rest.replace(hi, ' '); }
  }
  const words = rest.replace(/[।.,!?]/g, ' ').split(/\s+/).filter((w) => w && !PLACE_FILLER.test(w));
  for (const w of words) if (w.length > 2) out.push(w);
  return [...new Set(out)];
}
