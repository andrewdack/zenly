# Zenly Spectrum Agent

Photon Spectrum tutorial-style iMessage agent, plus the optional Zenly HTTP API.

## Setup

```bash
npm install
cp .env.example .env
```

Paste the Photon dashboard credentials into `.env`:

```env
PROJECT_ID=
PROJECT_SECRET=
```

## Run the tutorial agent

This is the Photon tutorial flow: connect to Spectrum, listen to `app.messages`, and echo incoming text messages back into the same space.

```bash
npm run dev
```

For a built run:

```bash
npm run build
npm start
```

The running process is what makes the agent online for the Photon shared iMessage line.

## Optional API extras

The Express API is still available separately for focus checks, `/sendMessage`, and Swagger docs:

```bash
npm run dev:api
```

Then open the Swagger UI at [`http://localhost:3001/docs`](http://localhost:3001/docs). The raw OpenAPI document is available at [`http://localhost:3001/openapi.json`](http://localhost:3001/openapi.json).

Set `OPENROUTER_API_KEY` in `.env` for focus checks. The default vision model is `google/gemma-3-12b-it` via OpenRouter.

### `POST /isFocused`

`multipart/form-data` with an `image` field. Returns whether the user appears focused.

### `POST /sendMessage`

Sends a one-time accountability message through Photon Spectrum.

```json
{
  "to": "+15555555555",
  "message": "Time to lock in."
}
```

Only a single E.164 phone number is accepted. Group chats are intentionally unsupported.

On Photon Free/Pro shared-line projects, recipients must be added under Photon Dashboard > **Users** first. Otherwise `/sendMessage` returns `403 photon_target_not_allowed`.
