# Zenly backend

Node.js + Express. Three concerns: the **SMS agent**, the **vision judge**, and the **snitch**.

The LLM layer is **provider-agnostic** — Claude (Anthropic) by default, OpenAI by flipping one env var.
Neither vendor is hard-wired; `src/llm/` defines one interface (`chat` + `vision`) with an
implementation per provider.

## Setup

```bash
cd backend
npm install
cp .env.example .env   # fill in keys (works with none — see "degraded mode")
npm run dev            # or: npm start
```

## Switching LLM provider

```
LLM_PROVIDER=anthropic   # default; uses ANTHROPIC_API_KEY + ANTHROPIC_MODEL (claude-sonnet-4-6)
LLM_PROVIDER=openai      # uses OPENAI_API_KEY + OPENAI_MODEL (gpt-4o)
```

To add another vendor, implement `chat()` / `vision()` in `src/llm/<name>.js` and register it in
`src/llm/index.js`. Nothing else changes.

## Degraded mode (no keys yet)

The server boots and every route responds even with no API keys, so you can wire things up first:

- `POST /webhook/sms` → echoes the text back (proves the Twilio webhook works)
- `POST /judge` → returns `{ on_task: true, confidence: 0, reason: "llm_not_configured" }`
- `POST /snitch` → uses a canned message; logs instead of sending if Twilio is unset

## Routes

| Method | Path              | Purpose |
|--------|-------------------|---------|
| GET    | `/`               | health + config status |
| POST   | `/webhook/sms`    | Twilio inbound webhook → conversational agent (or echo) |
| POST   | `/judge`          | `{ task, imageBase64, mediaType? }` → `{ on_task, confidence, reason }` |
| POST   | `/snitch`         | `{ task, contactPhone, screenContent, userPhone? }` → funny shame SMS |
| POST   | `/session/start`  | `{ userPhone, task, durationMinutes, contactPhone }` → stores session + deeplink |
| GET    | `/session/:phone` | polling handoff for the iOS app |

## Quick local tests

```bash
# health
curl localhost:3000/

# inbound SMS (Twilio form-encoded shape) — echoes without an LLM key
curl -X POST localhost:3000/webhook/sms \
  --data-urlencode 'From=+15551112222' \
  --data-urlencode 'Body=zenly I want to write my essay for 45 min'

# session handoff -> deep link the app opens
curl -X POST localhost:3000/session/start -H 'content-type: application/json' \
  -d '{"userPhone":"+15551112222","task":"history essay","durationMinutes":45,"contactPhone":"+15553334444"}'
```

## Twilio wiring (when ready)

1. Buy a number, set the **Messaging** "A message comes in" webhook to
   `https://<your-public-host>/webhook/sms` (POST). Use `ngrok http 3000` to expose localhost.
2. Put `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in `.env` (needed for the
   outbound snitch text; inbound replies use TwiML and need no credentials).
