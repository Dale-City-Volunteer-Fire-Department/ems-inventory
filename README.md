# EMS Inventory

EMS supply inventory management for Dale City Volunteer Fire Department.

---

## Overview

EMS Inventory replaces a legacy Airtable + Softr workflow used by DCVFD to track EMS supplies across four fire stations. Crew members perform weekly closet counts on their phones, recording actual quantities against PAR (target) levels. The system automatically generates resupply pick lists for logistics staff at the Station 13 warehouse.

The app is designed for a mixed-auth environment: DCVFD volunteers authenticate via Microsoft Entra ID SSO, while Prince William County paid staff use magic links or station PINs.

## Tech Stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Runtime   | Cloudflare Workers                            |
| Database  | Cloudflare D1 (SQLite)                        |
| Sessions  | Cloudflare KV                                 |
| Frontend  | React 19, Vite 6, Tailwind CSS v4, TypeScript |
| Auth      | Microsoft Entra ID SSO, magic link, station PIN |
| Email     | Resend (magic link delivery)                  |
| Language  | TypeScript (strict mode throughout)           |

## Features

- **Mobile-first inventory counting** -- single-tap numeric inputs optimized for phone UX
- **Role-based access control** -- crew, logistics, and admin roles with enforced permissions
- **Dual authentication** -- Entra ID SSO for DCVFD volunteers, magic link / station PIN for county staff
- **Auto-generated resupply orders** -- shortages produce pick lists routed to logistics
- **Logistics dashboard** -- view pending orders, mark items as filled, track fulfillment
- **Admin panel** -- manage users, items, PAR levels, and station configuration
- **Inventory history** -- permanent archive of all submissions with filtering and search
- **Soft deletes** -- records are deactivated, never physically deleted

## Architecture

```
src/
  worker/        Cloudflare Worker -- API router, handlers, auth, middleware
  frontend/      React 19 SPA -- pages, components, hooks, context
  shared/        Types, validators, category definitions (shared between worker and frontend)
migrations/      D1 SQL migrations (numbered, sequential)
scripts/         Data migration tooling (Airtable + Podio import)
sync/            D1 -> Azure SQL replication
tests/           Vitest tests for worker and frontend
```

The Worker serves both the JSON API (`/api/*` routes) and the built SPA (static assets from `dist/`). Non-API paths fall through to the SPA's `index.html` for client-side routing.

## Getting Started

### Prerequisites

- Node.js >= 20
- npm
- Wrangler CLI (`npm install -g wrangler` or use the project-local version)
- A Cloudflare account with Workers, D1, and KV enabled

### Install

```bash
git clone git@github.com:Dale-City-Volunteer-Fire-Department/ems-inventory.git
cd ems-inventory
npm install
```

### Development

Start both the Worker and Vite dev server concurrently:

```bash
npm run dev
```

Or run them individually:

```bash
npm run dev:worker     # Wrangler dev server on :8787
npm run dev:frontend   # Vite dev server on :5173
```

### Other Commands

```bash
npm run build          # Build the frontend (Vite)
npm run typecheck      # TypeScript type checking
npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier format
npm run format:check   # Prettier check
npm test               # Run tests (Vitest)
npm run test:watch     # Run tests in watch mode
```

## Deployment

Build and deploy in one step:

```bash
npm run deploy
```

This runs `vite build` followed by `wrangler deploy`.

### Required Secrets

Set these via `wrangler secret put <NAME>` or the Cloudflare Dashboard:

| Secret                   | Purpose                              |
| ------------------------ | ------------------------------------ |
| `AZURE_AD_CLIENT_ID`    | Entra ID application (client) ID    |
| `AZURE_AD_TENANT_ID`    | Entra ID directory (tenant) ID      |
| `AZURE_AD_CLIENT_SECRET`| Entra ID client secret               |
| `STATION_PIN`           | Shared station PIN for quick auth    |
| `MAGIC_LINK_SECRET`     | HMAC signing key for magic link tokens |
| `RESEND_API_KEY`        | Resend API key for sending emails    |

### Environment Variables

Set in `wrangler.toml` (non-secret):

| Variable   | Value                                |
| ---------- | ------------------------------------ |
| `APP_NAME` | EMS Inventory                        |
| `ORG_NAME` | Dale City Volunteer Fire Department  |

### Bindings

| Binding    | Type | Purpose                    |
| ---------- | ---- | -------------------------- |
| `DB`       | D1   | Primary database           |
| `SESSIONS` | KV   | Session token storage      |
| `ASSETS`   | Assets | Built SPA static files   |

## API Reference

### Public

| Method | Path                                  | Description                          |
| ------ | ------------------------------------- | ------------------------------------ |
| GET    | `/api/health`                         | Health check                         |
| GET    | `/api/stations`                       | List all stations                    |
| GET    | `/api/items`                          | List all active items                |
| GET    | `/api/stock-targets`                  | List PAR levels                      |
| GET    | `/api/inventory/current/:stationId`   | Get inventory template for a station |

### Auth Routes (unauthenticated)

| Method | Path                              | Description                        |
| ------ | --------------------------------- | ---------------------------------- |
| GET    | `/api/auth/entra/login`           | Initiate Entra ID SSO flow         |
| GET    | `/api/auth/entra/callback`        | Entra ID OAuth callback            |
| POST   | `/api/auth/magic-link/request`    | Request a magic link email         |
| GET    | `/api/auth/magic-link/verify`     | Verify magic link token            |
| POST   | `/api/auth/pin`                   | Authenticate with station PIN      |
| GET    | `/api/auth/me`                    | Get current session info           |
| POST   | `/api/auth/logout`                | Destroy current session            |

### Authenticated (any role)

| Method | Path                                         | Description                          |
| ------ | -------------------------------------------- | ------------------------------------ |
| POST   | `/api/inventory/submit`                      | Submit inventory counts              |
| GET    | `/api/inventory/history`                     | Query inventory history              |
| GET    | `/api/inventory/current/:stationId/summary`  | Dashboard summary for a station      |

### Authenticated (logistics or admin)

| Method | Path                      | Description                       |
| ------ | ------------------------- | --------------------------------- |
| PUT    | `/api/items`              | Create or update an item          |
| POST   | `/api/items`              | Create or update an item          |
| PUT    | `/api/items/:id`          | Update a single item by ID        |
| PUT    | `/api/stock-targets`      | Update PAR levels                 |
| PUT    | `/api/stock-targets/:id`  | Update a single PAR level by ID   |
| GET    | `/api/orders`             | List resupply orders              |
| PUT    | `/api/orders`             | Update order status               |

### Authenticated (admin only)

| Method | Path                     | Description                        |
| ------ | ------------------------ | ---------------------------------- |
| GET    | `/api/users`             | List all users                     |
| PUT    | `/api/users/:id/role`    | Update a user's role               |
| PUT    | `/api/users/:id/active`  | Activate or deactivate a user      |

## Auth

Authentication supports three methods to accommodate the mixed volunteer/paid staff environment:

1. **Entra ID SSO** -- Primary method for DCVFD volunteers. Initiates an OAuth2 authorization code flow against the DCVFD Azure AD tenant. On successful callback, a session is created in KV and a cookie is set.

2. **Magic Link** -- For Prince William County paid staff who lack DCVFD AD accounts. A time-limited signed link is emailed via Resend. Clicking the link validates the HMAC token and creates a session.

3. **Station PIN** -- A shared numeric PIN for quick access during closet counts. Grants `crew` role access only.

Sessions are stored in Cloudflare KV with automatic expiration. Role-based middleware enforces three tiers:

| Role       | Access                                                     |
| ---------- | ---------------------------------------------------------- |
| `crew`     | Submit counts, view history and dashboard                  |
| `logistics`| All crew access + manage items, PAR levels, orders         |
| `admin`    | All logistics access + manage users and roles              |

## Stations

| ID | Code | Name        | Nickname          |
| -- | ---- | ----------- | ----------------- |
| 10 | FS10 | Station 10  | The Dime          |
| 13 | FS13 | Station 13  | Midtown (warehouse) |
| 18 | FS18 | Station 18  | --                |
| 20 | FS20 | Station 20  | Parkway Express   |

Station 13 serves as the central supply warehouse where resupply orders are fulfilled.

## Database

The application uses Cloudflare D1 (SQLite at the edge). Schema is managed through sequential numbered migrations in the `migrations/` directory.

### Tables

| Table                | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `items`              | Master supply catalog (~228 items), 8 categories      |
| `stations`           | Fire station definitions (4 stations)                 |
| `stock_targets`      | PAR levels per item per station                       |
| `inventory_sessions` | Groups a single submission (one per station per count) |
| `inventory_history`  | Permanent archive with plain-text snapshots           |
| `orders`             | Resupply pick lists with fulfillment tracking         |
| `users`              | User accounts with role and auth method               |
| `config`             | Runtime key-value configuration                       |

### Categories

Items are organized into 8 EMS categories: Airway, Breathing, Circulation, Medications, Splinting, Burn, OB/Peds, Misc.

### Migrations

Apply migrations with Wrangler:

```bash
wrangler d1 migrations apply ems-inventory-db
```

Current migrations:

- `0001_initial_schema.sql` -- All tables, indexes, station seed data, initial config

## Testing

Tests use Vitest with happy-dom for React component testing and Testing Library for DOM assertions.

```bash
npm test              # Single run
npm run test:watch    # Watch mode
```

## License

Private. Internal use by Dale City Volunteer Fire Department only.
