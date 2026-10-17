'use client';
// Phone OTP. NEXT_PUBLIC_OTP_MODE=firebase sends a real SMS via Firebase Auth.
// NEXT_PUBLIC_OTP_MODE=demo skips SMS: the OTP is always 1234 (backup for the stage).
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

export const OTP_MODE = process.env.NEXT_PUBLIC_OTP_MODE === 'firebase' ? 'firebase' : 'demo';
export const OTP_LEN = OTP_MODE === 'firebase' ? 6 : 4;
export const DEMO_OTP = '1234';

let confirmation = null;
let verifier = null;

function auth() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const app = getApps()[0] || initializeApp(cfg);
  const a = getAuth(app);
  a.languageCode = 'hi';
  return a;
}

/** Send OTP to a 10-digit Indian number. Needs <div id="recaptcha"></div> on the page. */
export async function sendOtp(phone10) {
  if (OTP_MODE === 'demo') return { ok: true };
  try {
    const a = auth();
    if (!verifier) verifier = new RecaptchaVerifier(a, 'recaptcha', { size: 'invisible' });
    confirmation = await signInWithPhoneNumber(a, '+91' + phone10, verifier);
    return { ok: true };
  } catch (e) {
    console.error('sendOtp', e);
    try { verifier?.clear(); } catch {}
    verifier = null;
    return { ok: false, error: e.code || String(e) };
  }
}

/** Check the OTP. Returns {ok, proof} where proof is sent to the server to prove the phone. */
export async function verifyOtp(code) {
  if (OTP_MODE === 'demo') return code === DEMO_OTP ? { ok: true, proof: { demo: code } } : { ok: false };
  try {
    const cred = await confirmation.confirm(code);
    const idToken = await cred.user.getIdToken();
    return { ok: true, proof: { idToken } };
  } catch (e) {
    return { ok: false, error: e.code || String(e) };
  }
}