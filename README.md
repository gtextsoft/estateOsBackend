# EstateOS API

Express + MongoDB API for EstateOS: auth (JWT), residents, guest passes, security scans, incidents, payments, notifications, blacklist, and emergency alerts.

## Prerequisites

- Node.js 20+
- MongoDB (local or Atlas)

## Environment

Copy `.env copy.example` to `.env` and set:

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | Optional token lifetime (default `7d`) |
| `CLIENT_ORIGIN` | Allowed browser origin for CORS (e.g. `http://localhost:3000`) |
| `NODE_ENV` | `production` enables secure cookies on auth |

## Scripts

```bash
npm install
npm run dev
```

Default: server listens on port **4000** (see `src/server.ts`).

Seed sample gates, residents, guest passes, a blacklist demo entry, and related data:

```bash
npm run seed
```

After seed, resident login uses resident code **`RES-A01`** (maps to Adaeze Okafor).

## API surface (summary)

- `GET /health`
- `/api/auth` — login, logout, me
- `/api/me` — resident profile, guest passes, incidents, payments, notifications
- `/api/admin` — residents, guest passes (including `GET /guest-passes/expected?date=YYYY-MM-DD`), blacklist, incidents, payments, notifications
- `/api/security` — gates, scans, **manual denials**, events, presence, emergency alerts
- `/api/emergency` — resident emergency requests

Guest pass scan rules (single-use, service hours, blacklist) and resident “visitor arrived” notifications are implemented in `src/services/scan.service.ts`.

## Build

```bash
npm run build
npm start
```
