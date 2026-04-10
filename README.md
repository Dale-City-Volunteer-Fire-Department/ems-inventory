# EMS Inventory

Real-time EMS supply inventory management for Dale City Volunteer Fire Department.

---

## Overview

EMS Inventory is a mobile-first web application for weekly EMS closet inventory counting at four DCVFD fire stations. Crew members use their phones to record actual supply quantities against PAR (Periodic Automatic Replenishment) targets. The system automatically generates resupply pick lists for logistics staff at the Station 13 warehouse.

This application replaces a legacy Airtable + Softr + Podio workflow that had outgrown its usefulness. The new system is faster, cheaper to operate, and designed specifically for the mixed-authentication environment at DCVFD, where volunteers authenticate through Microsoft Entra ID SSO and Prince William County paid staff use magic links or station PINs.

The core UX requirement is single-tap numeric inputs on mobile devices. Every UI decision prioritizes phone-first usability during closet counts.

---

## Screenshots

### Login

```
[Screenshot: Login page with glass-morphism card, DCVFD badge, two auth buttons —
 "Sign in with DCVFD Account" (Entra SSO) and "Sign in with Email" (magic link)]
```

### Inventory Form

```
[Screenshot: Mobile inventory form showing station header, category groups
 (Airway, Breathing, Circulation, etc.) with collapsible sections, and
 single-tap numeric input controls for each supply item]
```

### Dashboard

```
[Screenshot: Station health cards with freshness indicators showing time since
 last count, category shortage bar charts, order pipeline summary (pending /
 in progress / filled), and recent activity feed]
```

### PAR Management

```
[Screenshot: Two-column grid with item catalog on the left and per-station
 PAR level targets on the right, inline editing for target counts, category
 filter tabs, and item CRUD controls]
```

---

## Tech Stack

| Layer     | Technology                                |
| --------- | ----------------------------------------- |
| Runtime   | Cloudflare Workers                        |
| Database  | Cloudflare D1 (SQLite at the edge)        |
| Sessions  | Cloudflare KV                             |
| Frontend  | React 19 + Vite 6 + Tailwind CSS v4      |
| Language  | TypeScript (strict mode throughout)       |
| Auth      | Microsoft Entra ID SSO + Magic Link (Resend) |
| Data sync | D1 to Azure SQL (for PowerBI reporting)   |

---

## Pages and Features

### Login (`/login`)

Entry point for all users. Two authentication paths:

- **Sign in with DCVFD Account** -- Initiates Microsoft Entra ID OAuth2 authorization code flow for DCVFD volunteers with Active Directory accounts.
- **Sign in with Email** -- Sends a time-limited magic link via Resend to Prince William County paid staff who lack DCVFD AD accounts.
- **Station PIN** -- A shared numeric PIN for quick crew-level access during closet counts.

### New Inventory (`/inventory`)

The primary workflow. Users select a station, then work through a categorized form of all active supply items. Each item displays the PAR target and accepts a single-tap numeric input for the actual count. On submission, the system calculates deltas, archives the session to `inventory_history`, and auto-generates resupply orders for any shortages.

### Dashboard (`/dashboard`)

Logistics and admin overview. Displays:

- **Station health cards** -- One card per station showing time since last count (freshness indicator), total items counted, and shortage count.
- **Category shortage trends** -- Bar chart of shortage counts grouped by EMS category across all stations.
- **Order pipeline** -- Summary counts for pending, in-progress, and filled orders.
- **Recent activity** -- Feed of the last 10 inventory submissions with station, submitter, and shortage counts.

### Inventories (`/inventories`)

Complete history of all past inventory sessions. Supports filtering by station and pagination. Each session is expandable to show individual item-level results with status indicators (good, short, over).

### Orders (`/orders`)

Resupply pick list management for the Station 13 warehouse. Each order contains a pick list generated from inventory shortages. Orders follow a status workflow: **pending** (new, awaiting fulfillment) to **in progress** (logistics is pulling items) to **filled** (complete).

### PAR Management (`/par`)

Grid view for managing PAR (target) levels per item per station. Supports:

- Inline editing of PAR target counts
- Item catalog CRUD (add, rename, reorder, deactivate)
- Category filtering
- Bulk operations

### Users (`/admin`)

Admin-only user management panel. View all users with their roles, auth methods, stations, and active status. Admins can:

- Assign or change user roles (crew, logistics, admin)
- Activate or deactivate user accounts
- Filter by role or active status

---

## Architecture

```
src/
├── frontend/                # React SPA (Vite)
│   ├── src/
│   │   ├── pages/           # Page components
│   │   │   ├── Login.tsx
│   │   │   ├── StationSelect.tsx
│   │   │   ├── InventoryForm.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Inventories.tsx
│   │   │   ├── Orders.tsx
│   │   │   ├── ParManagement.tsx
│   │   │   └── AdminPanel.tsx
│   │   ├── components/      # Shared UI components
│   │   │   ├── Layout.tsx
│   │   │   ├── NavBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── NumericInput.tsx
│   │   │   ├── CategoryGroup.tsx
│   │   │   ├── ItemRow.tsx
│   │   │   ├── StationCard.tsx
│   │   │   ├── PickList.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   └── ProfileModal.tsx
│   │   ├── hooks/           # Data hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── useApi.ts
│   │   │   ├── useInventory.ts
│   │   │   └── useStations.ts
│   │   └── App.tsx          # Router and auth gate
│   └── index.html
├── worker/                  # Cloudflare Worker (API)
│   ├── index.ts             # Router and request handler
│   ├── auth/                # Authentication providers
│   │   ├── entra.ts         # Entra ID SSO (OAuth2)
│   │   ├── magic-link.ts    # Magic link (Resend)
│   │   ├── pin.ts           # Station PIN
│   │   ├── session.ts       # Session management
│   │   ├── handlers.ts      # /auth/me, /auth/logout
│   │   └── user-db.ts       # User DB operations
│   ├── middleware/           # Request middleware
│   │   ├── auth.ts          # Session validation
│   │   ├── rbac.ts          # Role-based access control
│   │   └── cors.ts          # CORS + CSRF origin verification
│   ├── lib/                 # Shared utilities
│   │   ├── db.ts            # D1 query helpers
│   │   └── response.ts      # JSON response builders
│   ├── inventory.ts         # Inventory handlers
│   ├── items.ts             # Item CRUD handlers
│   ├── orders.ts            # Order handlers
│   ├── stations.ts          # Station handlers
│   ├── stock-targets.ts     # PAR level handlers
│   └── types.ts             # Worker environment types
├── shared/                  # Shared between worker and frontend
│   └── types.ts             # Item, Station, StockTarget, Order, etc.
migrations/                  # D1 SQL schema migrations
scripts/                     # Podio/Airtable data migration
sync/                        # D1 to Azure SQL replication
tests/                       # Vitest test suites
```

The Worker serves both the JSON API (`/api/*` routes) and the built SPA (static assets from `dist/`). Non-API paths fall through to the SPA's `index.html` for client-side routing.

---

## API Reference

### Public (no authentication required)

| Method | Path                                | Description                         |
| ------ | ----------------------------------- | ----------------------------------- |
| GET    | `/api/health`                       | Health check                        |
| GET    | `/api/stations`                     | List all active stations            |
| GET    | `/api/items`                        | List all active items               |
| GET    | `/api/stock-targets`                | List all PAR levels                 |
| GET    | `/api/inventory/current/:stationId` | Get inventory template for a station|

### Auth Routes (unauthenticated)

| Method | Path                             | Description                     |
| ------ | -------------------------------- | ------------------------------- |
| GET    | `/api/auth/entra/login`          | Initiate Entra ID SSO flow      |
| GET    | `/api/auth/entra/callback`       | Entra ID OAuth2 callback        |
| POST   | `/api/auth/magic-link/request`   | Request a magic link email      |
| GET    | `/api/auth/magic-link/verify`    | Verify magic link token         |
| POST   | `/api/auth/pin`                  | Authenticate with station PIN   |
| GET    | `/api/auth/me`                   | Get current session info        |
| POST   | `/api/auth/logout`               | Destroy current session         |

### Authenticated (any role)

| Method | Path                                        | Description                        |
| ------ | ------------------------------------------- | ---------------------------------- |
| POST   | `/api/inventory/submit`                     | Submit inventory counts            |
| GET    | `/api/inventory/history`                    | Query inventory history            |
| GET    | `/api/inventory/sessions`                   | List completed inventory sessions  |
| GET    | `/api/inventory/current/:stationId/summary` | Dashboard summary for a station    |

### Authenticated (logistics or admin)

| Method | Path                     | Description                    |
| ------ | ------------------------ | ------------------------------ |
| PUT    | `/api/items`             | Create or update an item       |
| POST   | `/api/items`             | Create or update an item       |
| PUT    | `/api/items/:id`         | Update a single item by ID     |
| PUT    | `/api/stock-targets`     | Update PAR levels              |
| PUT    | `/api/stock-targets/:id` | Update a single PAR level      |
| GET    | `/api/orders`            | List resupply orders           |
| PUT    | `/api/orders`            | Update order status            |
| GET    | `/api/dashboard/stats`   | Comprehensive dashboard stats  |

### Authenticated (admin only)

| Method | Path                    | Description                    |
| ------ | ----------------------- | ------------------------------ |
| GET    | `/api/users`            | List all users                 |
| PUT    | `/api/users/:id/role`   | Update a user's role           |
| PUT    | `/api/users/:id/active` | Activate or deactivate a user  |

---

## Roles

| Role       | Page Access                                                                    |
| ---------- | ------------------------------------------------------------------------------ |
| `crew`     | New Inventory only (station select, inventory form, submit)                    |
| `logistics`| Everything in crew + Dashboard, Inventories, Orders, PAR Management            |
| `admin`    | Everything in logistics + Users management (role assignment, account control)   |

Role enforcement is applied at two layers: the Worker middleware (`requireRole`) gates API endpoints, and the React router conditionally renders navigation and routes based on the user's role.

---

## Stations

| ID | Code | Name       | Nickname        | Notes             |
| -- | ---- | ---------- | --------------- | ----------------- |
| 10 | FS10 | Station 10 | The Dime        |                   |
| 13 | FS13 | Station 13 | Midtown         | Central warehouse |
| 18 | FS18 | Station 18 | --              |                   |
| 20 | FS20 | Station 20 | Parkway Express |                   |

Station 13 serves as the central supply warehouse where resupply orders are fulfilled.

---

## Getting Started

### Prerequisites

- Node.js >= 20
- npm
- Wrangler CLI (included as a dev dependency, or install globally with `npm install -g wrangler`)
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

### Build

```bash
npm run build          # Build the frontend (Vite)
```

### Deploy

Build and deploy to Cloudflare in one step:

```bash
npm run deploy
```

This runs `vite build` followed by `wrangler deploy`.

### Other Commands

```bash
npm run typecheck      # TypeScript type checking (tsc --noEmit)
npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier format all source files
npm run format:check   # Prettier check (CI-friendly)
npm test               # Run tests (Vitest, single run)
npm run test:watch     # Run tests in watch mode
```

---

## Environment and Secrets

### Secrets

Set via `wrangler secret put <NAME>` or the Cloudflare Dashboard. Never commit these to the repository.

| Secret                    | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `AZURE_AD_CLIENT_ID`     | Entra ID application (client) ID         |
| `AZURE_AD_TENANT_ID`     | Entra ID directory (tenant) ID           |
| `AZURE_AD_CLIENT_SECRET` | Entra ID client secret                   |
| `STATION_PIN`            | Shared station PIN for quick crew auth   |
| `MAGIC_LINK_SECRET`      | HMAC signing key for magic link tokens   |
| `RESEND_API_KEY`         | Resend API key for magic link emails     |

### Environment Variables

Set in `wrangler.toml` (non-secret, checked into source):

| Variable   | Value                               |
| ---------- | ----------------------------------- |
| `APP_NAME` | EMS Inventory                       |
| `ORG_NAME` | Dale City Volunteer Fire Department |

### Bindings

| Binding    | Type   | Purpose                  |
| ---------- | ------ | ------------------------ |
| `DB`       | D1     | Primary database         |
| `SESSIONS` | KV     | Session token storage    |
| `ASSETS`   | Assets | Built SPA static files   |

---

## Database

The application uses Cloudflare D1 (SQLite at the edge). Schema is managed through sequential numbered migrations in the `migrations/` directory.

### Tables

| Table                | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `items`              | Master supply catalog (~228 items across 8 categories)        |
| `stations`           | Fire station definitions (4 active stations)                  |
| `stock_targets`      | PAR levels per item per station                               |
| `inventory_sessions` | Groups a single count submission (one per station per count)  |
| `inventory_history`  | Permanent archive with plain-text snapshots of each line item |
| `orders`             | Resupply pick lists with status tracking                      |
| `users`              | User accounts with role, auth method, and station assignment  |
| `config`             | Runtime key-value configuration                               |

### Categories

Items are organized into 8 EMS categories:

Airway, Breathing, Circulation, Medications, Splinting, Burn, OB/Peds, Misc.

### Data Model

Key types from `src/shared/types.ts`:

- `Item` -- id, name, category, sort_order, is_active
- `Station` -- id, name, code, is_active
- `StockTarget` -- id, item_id, station_id, target_count
- `InventoryCount` -- item_id, station_id, target_count, actual_count, delta, status
- `InventoryHistory` -- plain-text snapshot (item_name, category, station_name, counts, delta, status)
- `Order` -- station_id, session_id, items_short, pick_list, status (pending/in_progress/filled)

Status enums: `CountStatus` (not_entered, good, over, short), `OrderStatus` (pending, in_progress, filled), `UserRole` (crew, logistics, admin).

### Applying Migrations

```bash
wrangler d1 migrations apply ems-inventory-db
```

Current migrations:

- `0001_initial_schema.sql` -- All tables, indexes, station seed data, initial config

---

## Data Migration

The `scripts/` directory contains migration tooling for importing historical data from the legacy systems:

| Script                        | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `migrate-airtable-items.ts`   | Import item catalog from Airtable              |
| `migrate-airtable-targets.ts` | Import PAR levels from Airtable                |
| `migrate-airtable-history.ts` | Import historical inventory records            |
| `migrate-podio-history.ts`    | Import historical records from Podio           |
| `migrate-all.sh`              | Run all migrations in sequence                 |

Run the full migration:

```bash
cd scripts
bash migrate-all.sh
```

---

## Data Sync

The `sync/` directory contains tooling for replicating D1 data to Azure SQL, enabling PowerBI reporting for county stakeholders.

| File               | Purpose                                |
| ------------------ | -------------------------------------- |
| `sync-to-azure.ts` | D1 to Azure SQL replication script     |
| `schema.sql`       | Azure SQL target schema                |
| `setup.sh`         | Initial Azure SQL setup                |
| `run-sync.sh`      | Execute a sync run                     |

---

## Testing

Tests use Vitest with happy-dom for React component testing and Testing Library for DOM assertions.

```bash
npm test              # Single run
npm run test:watch    # Watch mode
```

Test suites are organized under `tests/` mirroring the source structure:

```
tests/
├── frontend/         # React component and hook tests
├── worker/           # API handler and middleware tests
├── shared/           # Shared type and validation tests
└── helpers/          # Test utilities
```

---

## License

Private. Copyright Dale City Volunteer Fire Department, Inc. All rights reserved.

This software is for internal use by Dale City Volunteer Fire Department only. Unauthorized copying, distribution, or use of this software is prohibited.
