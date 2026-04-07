# EstateOS API

Express + MongoDB API for EstateOS: multi-tenant **estates**, email/password auth, **platform admin** estate approval, **manager KYC** for residents/guards, JWT, residents, guest passes, security scans, incidents, payments, notifications, blacklist, and emergency alerts.

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

Optional **seed** overrides: `SEED_PLATFORM_ADMIN_EMAIL`, `SEED_PLATFORM_ADMIN_PASSWORD`, `SEED_MANAGER_EMAIL`, `SEED_MANAGER_PASSWORD`, `SEED_RESIDENT_PASSWORD`.

## Scripts

```bash
npm install
npm run dev
```

Default: server listens on port **4000** (see `src/server.ts`).

Seed a **demo estate** (`slug: demo-estate`, active), gates, residents, guest passes, platform admin, manager, and a **resident User** for email login:

```bash
npm run seed
```

Console output lists default emails/passwords. You can still use **legacy** login with resident code **`RES-A01`** (no User document) for quick demos.

## API surface (summary)

- `GET /health`
- `/api/auth` — `POST /login` (email+password or legacy body), `POST /register-estate`, `POST /signup`, `GET /me`, `POST /logout`
- `/api/estates/resolve?slug=` — public; active estates only
- `/api/platform` — platform admin: pending estates, approve/reject
- `/api/me` — resident profile, guest passes, incidents, payments, notifications (JWT + KYC + active estate)
- `/api/admin` — manager: `GET/PATCH /kyc`, residents, guest passes, blacklist, incidents, payments, notifications (scoped by estate)
- `/api/security` — gates, scans, manual denials, events, presence, emergency alerts (scoped by estate)
- `/api/emergency` — resident emergency requests

Guest pass scan rules (single-use, service hours, blacklist) and resident “visitor arrived” notifications are implemented in `src/services/scan.service.ts`.

## Build

```bash
npm run build
npm start
```
