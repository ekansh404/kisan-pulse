# Kisan Pulse 🌾 — voice-first farming assistant

Team **Git-Set-Go** · Problem Statement 3: Agriculture & Rural Development

A farmer opens the app, hears **"Namaskar"**, registers fully by voice, and then asks anything (weather, mandi price, schemes, tractor, labour, selling crop) by tapping one giant mic. Answers are spoken back in Hindi or English with big captions on screen.

## Stack
- **Next.js 15 (App Router) PWA**, plain JavaScript
- **Voice:** browser Web Speech API (STT `hi-IN` / `en-IN`) + speechSynthesis (female voice preferred)
- **Brain:** Google Gemini Flash with function calling (`/api/chat`)
- **DB:** Supabase (Postgres)
- **Login:** Firebase phone OTP (or demo OTP `1234`)
- **Real data:** Open-Meteo (weather, geocoding), Agmarknet via data.gov.in (mandi), ISRIC SoilGrids (soil), official scheme rules (`data/schemes.json`)
- **Seeded (demo):** machine owners, agri stores, labour groups, buyers

## Run
```bash
npm install
cp .env.example .env.local   # fill keys
npm run dev                  # http://localhost:3000  (use Chrome)
```
Phone testing needs HTTPS → use the Vercel URL.

## Who owns what
| Area | Owner | Folders |
|---|---|---|
| Voice engine, home mic, AI agent, integration, deploy | Ekansh | `lib/voice.js`, `components/*`, `app/page.js`, `app/api/chat`, `lib/agent`, `lib/gemini.js`, `lib/db.js` |
| Voice onboarding + login | Person 2 | `app/onboarding`, `lib/onboarding.js`, `lib/firebase.js`, `app/api/extract`, `app/api/farmer` |
| Real data tools | Person 3 | `lib/data/*`, `data/schemes.json`, `app/api/{weather,mandi,soil,schemes,geocode}` |
| Screens + marketplace | Person 4 | `app/{services,mandi,schemes,profile}`, `lib/market.js`, `app/api/{partners,actions}`, `supabase/seed.sql` |

## Real vs simulated
Real: voice, conversation, weather + alerts, mandi prices, soil, scheme eligibility, OTP login, saving bookings.
Simulated: AgriStack Farmer ID / land verification, payments, insurance & loan approvals, partner listings.
