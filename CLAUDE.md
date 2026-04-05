# EMS Inventory

EMS supply inventory management for Dale City Volunteer Fire Department.

## Repository Map

| Path            | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `src/worker/`   | Cloudflare Worker — API router, handlers, middleware             |
| `src/frontend/` | React 19 SPA (Vite, Tailwind v4) — mobile-first UI               |
| `src/shared/`   | Types, validators, categories shared between worker and frontend |
| `migrations/`   | D1 SQL migrations (numbered, sequential)                         |
| `scripts/`      | Data migration from Airtable + Podio                             |
| `sync/`         | D1 → Azure SQL replication (replaces SkyVia)                     |
| `docs/`         | Architecture, deployment, runbook                                |
| `tests/`        | Vitest tests for worker and frontend                             |

## Stack

- Cloudflare Workers + D1 + KV
- React 19 + Vite + Tailwind v4
- TypeScript strict mode

## Hard Rules

1. Never commit secrets, credentials, or API keys
2. Never expose member PII in logs, PRs, or issues
3. No ILT/cipherforge resources — DCVFD org only
4. Atomic commits with conventional messages
5. Soft-delete everything — never physically delete records
6. Mobile-first — every UI decision prioritizes phone UX
7. Single-tap numeric inputs — the core UX requirement

## Stations

- Station 10 (FS10) — "The Dime"
- Station 13 (FS13) — "Midtown" (warehouse location)
- Station 18 (FS18)
- Station 20 (FS20) — "Parkway Express"

## Auth

- Volunteers: Entra ID SAML/SSO
- Paid staff: Magic link (email) or station PIN
- Roles: crew, logistics, admin
