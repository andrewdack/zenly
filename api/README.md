# Zenly API

Express + TypeScript API for focus checks and one-time accountability messages.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Endpoints

### `POST /isFocused`

`multipart/form-data` with an `image` field. Returns whether the user appears focused.

### `POST /sendMessage`

Sends a one-time iMessage/SMS-style accountability message through Photon Spectrum.

```json
{
  "to": "+15555555555",
  "message": "Time to lock in."
}
```

Only a single E.164 phone number is accepted. Group chats are intentionally unsupported.
