# EMS Inventory — Deployment

## Prerequisites

- Cloudflare account with Workers, D1, and KV enabled
- `wrangler` CLI authenticated (`wrangler login`)
- D1 database created (`wrangler d1 create ems-inventory-db`)
- KV namespace created (`wrangler kv namespace create SESSIONS`)

## Setup

1. Update `wrangler.toml` with real D1 database ID and KV namespace ID
2. Set secrets:
   ```bash
   wrangler secret put AZURE_AD_CLIENT_ID
   wrangler secret put AZURE_AD_TENANT_ID
   wrangler secret put STATION_PIN
   wrangler secret put MAGIC_LINK_SECRET
   ```
3. Run migrations:
   ```bash
   wrangler d1 migrations apply ems-inventory-db
   ```

## Deploy

```bash
npm run deploy
```

## Custom Domain

Configure via Cloudflare Dashboard: Workers > ems-inventory > Triggers > Custom Domains.
