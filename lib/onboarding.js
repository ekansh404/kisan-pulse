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