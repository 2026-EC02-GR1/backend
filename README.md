# Résa — API Gateway

Backend for **Résa**, a SaaS booking system for tourist accommodation managers (campsites, B&Bs, cottages, hotels). Managers embed a booking widget on their own website; travellers book and pay via Stripe.

This repo is the **API gateway**: it handles authentication and proxies domain routes to dedicated microservices.

## Architecture

```
Client / Widget
      │
      ▼
  backend (gateway)          ← this repo, port 3000
  ├── Auth (better-auth)
  ├── Properties / Rates / Photos / Widget  ← handled locally
  ├── Payments (Stripe)                     ← handled locally
  └── Bookings / Hold-slots / Availability  ── proxy ──► service_reservation (port 3001)
```

The gateway authenticates every request (JWT Bearer via better-auth), then either handles the route itself or forwards it to the appropriate service via HTTP, passing the caller's identity in the `X-Manager-Id` header. Services trust that header and must never be exposed publicly.

**Shared Postgres**: this repo owns all Prisma migrations. Sibling services run `prisma generate` only.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| HTTP | Express 5 |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Validation | Zod 4 |
| Auth | better-auth 1.x (email/password + bearer) |
| Payments | Stripe |
| Linter | Biome |

## Getting started

### 1. Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Docker (for Postgres)

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Description |
|---|---|
| `BETTER_AUTH_SECRET` | Random secret for JWT signing |
| `STRIPE_API` | Stripe secret key (`sk_test_…` or `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (see [Webhooks](#webhooks-local-dev)) |
| `RESERVATION_SERVICE_URL` | URL of `service_reservation` (default: `http://localhost:3001`) |

### 3. Database

```bash
docker compose up -d          # start Postgres
bunx prisma migrate dev       # apply migrations
bunx prisma generate          # generate client
```

### 4. Start

```bash
bun install
bun run dev                   # http://localhost:3000
```

> `service_reservation` must also be running on port 3001 for booking/availability routes to work.

## API

Base path: `/api/v1`

Full contract: [`docs/openapi.yaml`](docs/openapi.yaml)

### Routes handled by this gateway

| Domain | Routes |
|---|---|
| Auth | `POST /auth/login`, `/auth/logout`, `/auth/2fa/*` |
| Manager | `GET/PATCH/DELETE /me`, `/me/roles` |
| Properties | `CRUD /properties` |
| Photos | `CRUD /properties/:id/photos` |
| Rates & Discounts | `CRUD /properties/:id/rates`, `…/discount-rules` |
| Widget | `GET/PUT /properties/:id/widget`, `/widget/snippet` |
| Payments | `GET /bookings/:id/payments`, `POST /bookings/:id/payments/intent`, `POST /payments/webhook` |

### Routes proxied to `service_reservation`

| Domain | Routes |
|---|---|
| Availability | `GET/PATCH /properties/:id/availability`, `/availability/estimate` |
| Hold slots | `POST/DELETE /properties/:id/hold-slots` |
| Bookings | `GET/POST /bookings`, `GET/PATCH /bookings/:id` |

## Webhooks (local dev)

Stripe cannot reach `localhost` directly. Use the Stripe CLI to forward events.

> **Always pass `--api-key`** — the CLI defaults to your personal Stripe account; the project uses a separate test account.

```bash
# Terminal 1 — keep running while testing payments
stripe listen \
  --forward-to localhost:3000/api/v1/payments/webhook \
  --api-key $STRIPE_API
```

The CLI prints a `whsec_…` signing secret. Set it as `STRIPE_WEBHOOK_SECRET` in `.env` and restart the server if it differs from the current value.

To replay a past event:

```bash
stripe events resend evt_XXXXX --api-key $STRIPE_API
```

> **Bun note**: the webhook handler uses `stripe.webhooks.constructEventAsync` (not `constructEvent`) because Bun's crypto provider is async-only. Don't revert this to the synchronous form.

## Testing

```bash
bun test
```

Tests live in `tests/` and use `bun:test`.

## API client (Bruno)

A [Bruno](https://www.usebruno.com/) collection is available in `bruno/`. It covers all implemented routes and includes a sign-in script that auto-sets the `token` variable.

```
bruno/
├── environments/local.bru
├── auth/
├── properties/
├── availability/
├── bookings/
├── payments/
└── …
```

## Database model

See [`docs/data-model.md`](docs/data-model.md) for the full entity diagram.

Key conventions:
- DB entity `User` is exposed as `Manager` in the API
- `User`, `Property`, `Client` use soft delete (`deleted_at`)
- All monetary amounts use `Decimal`, never floats
- `BlockedPeriod.booking_id` and `EventLog.actor_id`/`resource_id` have no FK constraints by design (survive purges)
