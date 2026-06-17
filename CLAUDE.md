# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Backend for **Résa**, a SaaS booking system for tourist accommodation managers (campsites, B&Bs, cottages, hotels). Managers embed a booking widget on their own website; travellers book and pay via Stripe.

- **API contract**: @docs/openapi.yaml — implement endpoints to match it exactly (paths under `/api/v1`, schemas, status codes, snake_case JSON fields).
- **Database model**: @docs/data-model.md

### Current scope (phase 1)

Build **only** these domains for now:

1. **Logement** — Property, PropertyPhoto (CRUD, upload, reorder)
2. **Tarification** — Rate, DiscountRule, price estimate
3. **Payment** — Payment, Stripe PaymentIntent + webhook (needs minimal Booking/HoldSlot support)
4. **Widget** — WidgetConfig, embed snippet

Auth/2FA, iCal sync, EventLog, Clients and admin `/managers` routes come later — don't implement them unless asked, but design the Prisma schema with the full model in mind.

## Stack

- **Runtime**: Bun (not Node) — `bun install`, `bun run <file>`, `bun test`, `bunx`. Bun loads `.env` automatically; never add dotenv.
- **HTTP**: Express 5 — deliberate choice for this project; it overrides the generic "use `Bun.serve()`" Bun advice.
- **ORM**: Prisma 7 with PostgreSQL — `bunx prisma migrate dev`, `bunx prisma generate`. Don't use `Bun.sql` or `pg` directly.
- **Validation**: Zod 4 — validate every request body and query params; map Zod failures to the 422 `ValidationError` shape (`{ code, message, fields: [{ field, message }] }`).
- Other errors return `{ code, message }` with a machine-readable `code` (e.g. `booking_conflict`, `hold_slot_expired`).

## Testing

`bun test` with `bun:test` (`import { test, expect } from "bun:test"`), files named `*.test.ts`. Don't add jest or vitest.

## Domain rules (non-obvious, from the spec)

- **Naming**: the DB entity `User` is exposed as `Manager` in the API (`UserRole` → `ManagerRole`). Never expose `password_hash` or `two_fa_secret`; the API exposes a derived `two_fa_enabled` boolean.
- **Money**: use Prisma `Decimal` for all amounts (`base_price_per_night`, `total_amount`, …) — never floats.
- **Soft delete**: `User`, `Property`, `Client` are never hard-deleted; set `deleted_at` and exclude soft-deleted rows from all lists and lookups.
- **Ownership**: managers only access their own resources; a resource that exists but belongs to another manager returns `403`, not `404`.
- **Rates**: two non-high-season rates must never overlap (validate on create/update). When a high-season rate overlaps a base rate, the high-season one wins during price calculation.
- **Discounts**: pick the `DiscountRule` whose `[min_nights, max_nights]` range covers the stay; `max_nights` null = open-ended; if rules overlap, apply the one most favourable to the client.
- **Availability** is computed, not stored: a day is blocked if covered by a `BlockedPeriod` or a non-expired `HoldSlot`. `PATCH /availability` with `blocked: false` only removes `manual`-source blocks.
- **HoldSlot**: 15-minute TTL; required before booking creation (missing/expired hold → `409`); only one active hold per property/date range.
- **Payments**: rows are immutable and never deleted; status never returns to `pending` from a terminal state; on failure create a new PaymentIntent. `deposit_amount` equals `total_amount` when no split payment is configured. Never log `stripe_client_secret`. Verify the Stripe webhook signature; invalid signature → `400`.
- **No-FK columns by design**: `BlockedPeriod.booking_id`, `EventLog.actor_id`/`resource_id` must not have foreign-key constraints (they survive purges). `Booking.property_id`/`client_id` are nullable for the same reason.

## Bun conventions

- Prefer `Bun.file` over `node:fs` readFile/writeFile, and Bun.$\`cmd\` over execa/child_process.
- `bunx <pkg>` instead of `npx <pkg>`.
