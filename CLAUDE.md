# Kisan Pulse: notes for Claude Code

Voice-first farming assistant (Next.js 15 App Router, plain JavaScript, no TypeScript, no Tailwind).
Team Git-Set-Go, hackathon build. Hindi is the default language, English optional.

## Run
- `npm run dev` → http://localhost:3000 (Chrome; mic works on localhost)
- `npm run build` must pass before any push to `main`

## Architecture
- Voice: `lib/voice.js` (Web Speech API STT `hi-IN`/`en-IN`, speechSynthesis TTS with female-voice picker, `askWithRetry`, `yesNo`, `submitTyped`)
- Page 1: `app/page.js` (greeting, alerts, giant mic) → `components/VoiceOverlay.js` (full-screen voice mode, big captions, हाँ/ना confirm)
- Brain: `app/api/chat/route.js` (Gemini REST via `lib/gemini.js`) + tools in `lib/agent/tools.js`
- Data (real): `lib/data/{geo,weather,mandi,soil,schemes}.js`, `data/schemes.json`
- Marketplace (seeded): `lib/market.js`, `app/api/{partners,actions}`, `supabase/seed.sql`
- Onboarding + login: `app/onboarding/page.js`, `lib/onboarding.js`, `lib/firebase.js` (OTP mode `demo` = 1234 for now), `app/api/{extract,farmer}`
- DB: Supabase via `lib/db.js` (server only, service key). Schema in `supabase/schema.sql`.

## Ownership (do NOT edit other people's files when working for one person)
- Ekansh: lib/voice.js, lib/i18n.js, lib/session.js, lib/gemini.js, lib/db.js, lib/agent/*, app/api/chat, app/page.js, app/layout.js, app/globals.css, components/*, supabase/*, configs
- Person 2: app/onboarding, lib/onboarding.js, lib/firebase.js, app/api/extract, app/api/farmer
- Person 3: lib/data/*, data/schemes.json, app/api/{weather,mandi,soil,schemes,geocode}
- Person 4: app/{services,mandi,schemes,profile}, lib/market.js, app/api/{partners,actions}

## Rules
- Keep function names/shapes stable: getWeather, getMandiPrice, getSoil, checkSchemes, geocode, km, listPartners, executeAction.
- Never invent prices/weather in prompts or UI; numbers come from tools.
- Bookings are saved only after the farmer confirms (हाँ).
- Spoken text: short sentences, no markdown, no emojis.
- Never commit `.env.local`. Never hardcode keys.
- Simulated (must stay labelled "demo"): Farmer ID / land verification, payments, insurance & loan approvals.