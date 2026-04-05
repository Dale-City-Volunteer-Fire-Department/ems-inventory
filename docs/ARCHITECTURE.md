# EMS Inventory — Architecture

## Overview
Weekly EMS supply inventory system for DCVFD's 4 fire stations. Station crews count ~220 supply items in EMS closets, submit counts, and logistics generates resupply pick lists.

## Stack
- **Runtime**: Cloudflare Workers (TypeScript)
- **Frontend**: React 19 + Vite + Tailwind CSS v4 (SPA via Worker [assets])
- **Database**: Cloudflare D1 (SQLite) — primary source of truth
- **Sessions**: Cloudflare KV (server-side, HttpOnly cookie)
- **Auth**: Entra ID SAML/SSO (volunteers) + Magic Link + Station PIN (paid staff)
- **Reporting**: Azure SQL (dcvfdsql47) synced from D1 for PowerBI dashboards

## Auth
Three paths:
1. **Entra ID SSO** — DCVFD volunteers via Azure AD SAML
2. **Magic Link** — Email-based one-time login for Prince William County paid staff
3. **Station PIN** — Shared PIN fallback for paid staff without email

## Data Flow
```
Station Crew (phone) -> Worker API -> D1 (source of truth)
                                       | (cron sync)
                                     Azure SQL -> PowerBI (Pat Clements)
```

## Key Design Decisions
- D1 as source of truth (not Airtable)
- Soft-delete everywhere (is_active flags, no physical deletes)
- History uses plain text snapshots (immune to renames)
- Mobile-first, single-tap numeric input for rapid data entry
- Categories: Airway, Breathing, Circulation, Medications, Splinting, Burn, OB/Peds, Misc
