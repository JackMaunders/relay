# relay

A Node/TypeScript webhook relay server that receives, stores, and replays webhooks. Built for local development, point your webhook sources at relay once, then replay captured events as many times as you need.

## What it does

- **Receives** incoming webhooks from any source and stores them in a local SQLite database
- **Forwards** events immediately to your local server on receipt
- **Replays** any stored event on demand, useful when your local server was down, you need to test a specific payload repeatedly, or you want to verify idempotency handling

## Getting Started

### Prerequisites

- Node 20+
- npm

### Install

```bash
npm install
```

### Configure

Create a `.env` file in the project root (see `.env.example`):

```bash
REPLAY_TARGET_URL=http://localhost:3001
```

This is the URL your local server is running on. Incoming webhooks will be forwarded here automatically. You can override it per-replay request if needed.

### Run migrations

```bash
npm run db:generate
npm run db:migrate
```

Only needed on first run and after schema changes.

### Start the server

```bash
npm run dev
```

## API

### Receive a webhook

```
POST /webhooks/:source
```

The `:source` param is a free-form identifier for where the webhook came from — e.g. `github`, `contentstack`, `ci`. Must be lowercase alphanumeric with hyphens only.

The full request (method, headers & body) is stored and immediately forwarded to `REPLAY_TARGET_URL` if set. The event is stored regardless of whether forwarding succeeds.

**Response**

```json
{ "id": "V1StGXR8_Z5jdHi6B-myT" }
```

---

### List events

```
GET /webhooks
```

**Query params**

| Param    | Type                                               | Description                          |
| -------- | -------------------------------------------------- | ------------------------------------ |
| `source` | string                                             | Filter by source                     |
| `status` | `pending` \| `delivered` \| `replayed` \| `failed` | Filter by status                     |
| `limit`  | number                                             | Max results, default `50`, max `100` |

---

### Get a single event

```
GET /webhooks/:id
```

---

### Replay an event

```
POST /webhooks/:id/replay
```

**Body** (all optional)

```json
{ "targetUrl": "http://localhost:4000" }
```

If `targetUrl` is omitted, `RELAY_TARGET_URL` from your `.env` is used. Returns an error if neither is set.

**Response**

```json
{
  "success": true,
  "statusCode": 200,
  "error": null
}
```

## Event Status

| Status      | Meaning                                          |
| ----------- | ------------------------------------------------ |
| `pending`   | Received and stored, `REPLAY_TARGET_URL` not set |
| `delivered` | Successfully forwarded on first receipt          |
| `failed`    | Forwarding failed on most recent attempt         |
| `replayed`  | Successfully forwarded via manual replay         |

**Note**: The `drizzle/migrations/` folder should be committed — it is your schema history.

> Useful issue on conditional query building in drizzle: https://github.com/drizzle-team/drizzle-orm/issues/1644
