# Offishall Stores

Static frontend + Express.js API (as a Vercel serverless function) for signup, verification and sign-in.

## Project layout

- `index.html`, `dashboard.html`, … — frontend pages
- `script.js` — UI, cart, auth calls to `/api`
- `api/index.js` — Express API (signup, verify, resend, signin, health)
- `vercel.json` — routes `/api/*` to the function
- `.env.example` — environment variables to set in Vercel

## API

| Method | Route | Body |
| --- | --- | --- |
| POST | `/api/signup` | `{ username, email, password }` |
| POST | `/api/verify` | `{ email, otp }` |
| POST | `/api/resend` | `{ email }` |
| POST | `/api/signin` | `{ email, password }` |
| GET | `/api/health` | — |

## Deploy on Vercel

1. Create a free MongoDB Atlas cluster and copy its connection string.
2. Push this repo to GitHub and import it in Vercel (Framework Preset: **Other**, no build command).
3. Add the variables from `.env.example` under Project Settings → Environment Variables.
4. Redeploy.

## Run locally

```bash
npm install
npm i -g vercel
vercel dev
```
