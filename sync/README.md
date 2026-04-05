# D1 to Azure SQL Sync

Replaces the broken SkyVia replication that previously mirrored Airtable data
to Azure SQL. This module syncs the new D1 database (Cloudflare Workers)
directly to Azure SQL so PowerBI can report on it.

## Setup

1. Run the setup script to create the `ems_inventory` database and tables:

```bash
cd /home/dcdev/ems-inventory
./sync/setup.sh
```

This pulls credentials from Vault and creates the database + schema on
`dcvfdsql47.database.windows.net`.

2. Install the mssql dependency:

```bash
npm install --save-dev mssql @types/mssql
```

## Running the Sync

Set the required environment variables, then run:

```bash
export CF_ACCOUNT_ID="your-cloudflare-account-id"
export CF_API_TOKEN="your-d1-read-token"
export CF_D1_DATABASE_ID="your-d1-database-id"

npx tsx sync/sync-to-azure.ts
```

For local dev, Azure SQL creds are read from Vault automatically. In
production, set `AZURE_SQL_SERVER`, `AZURE_SQL_USER`, `AZURE_SQL_PASSWORD`,
and `AZURE_SQL_DATABASE` environment variables.

## How It Works

- Reads from D1 via the Cloudflare REST API
- Writes to Azure SQL using T-SQL MERGE (upsert)
- Incremental: only syncs rows where `updated_at` or `submitted_at` is newer
  than the last sync timestamp stored in `sync_metadata`
- Tables without timestamps (stations, inventory_history) do a full sync
- Batches in groups of 500 rows to stay within T-SQL limits

## Tables Synced

| Table              | Incremental Column |
| ------------------ | ------------------ |
| items              | updated_at         |
| stations           | full sync          |
| stock_targets      | updated_at         |
| inventory_sessions | submitted_at       |
| inventory_history  | full sync          |
| orders             | created_at         |
| users              | created_at         |
| config             | updated_at         |

## PowerBI Connection

Pat Clements connects PowerBI to:

- **Server:** dcvfdsql47.database.windows.net
- **Database:** ems_inventory
- **Auth:** SQL login (DCIT user)

Use DirectQuery or Import mode. The data refreshes each time the sync script
runs. Schedule it via cron or Cloudflare Cron Trigger for regular updates.

## Scheduling

For a cron-based schedule on this dev box:

```bash
# Every 15 minutes
*/15 * * * * cd /home/dcdev/ems-inventory && npx tsx sync/sync-to-azure.ts >> /tmp/ems-sync.log 2>&1
```

For production, this will be converted to a Cloudflare Cron Trigger that runs
inside the Worker.
