'use client';
// Who is logged in on this phone. Hackathon-simple: kept in localStorage.
const KEY = 'kp_farmer';
const LANG = 'kp_lang';

export function getFarmer() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function setFarmer(f) {
  try { localStorage.setItem(KEY, JSON.stringify(f)); if (f?.lang) setLang(f.lang); } catch {}
}
export function logout() {
  try { localStorage.removeItem(KEY); } catch {}
}
export function getLang() {
  try { return localStorage.getItem(LANG) || 'hi'; } catch { return 'hi'; }
}
export function setLang(l) {
  try { localStorage.setItem(LANG, l); } catch {}
}
