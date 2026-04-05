/**
 * sync-to-azure.ts — Incremental D1 → Azure SQL sync
 *
 * Replaces the broken SkyVia replication pipeline.
 * Reads from D1 via Cloudflare API, writes to Azure SQL via mssql.
 * Tracks last sync time per table in sync_metadata.
 *
 * Usage:
 *   npx tsx sync/sync-to-azure.ts
 *
 * Environment variables (or reads from Vault for local dev):
 *   AZURE_SQL_SERVER, AZURE_SQL_USER, AZURE_SQL_PASSWORD, AZURE_SQL_DATABASE
 *   CF_ACCOUNT_ID, CF_API_TOKEN, CF_D1_DATABASE_ID
 */

import sql from "mssql";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncTableConfig {
  name: string;
  timestampColumn: string; // column used for incremental sync
  columns: string[]; // all columns to sync
  mergeKeyColumns: string[]; // PK columns for MERGE match
}

interface D1QueryResult {
  results: Record<string, unknown>[];
  success: boolean;
}

// ---------------------------------------------------------------------------
// Table configurations
// ---------------------------------------------------------------------------

const TABLES: SyncTableConfig[] = [
  {
    name: "stations",
    timestampColumn: "_full", // no timestamp — always full sync
    columns: ["id", "name", "code", "is_active"],
    mergeKeyColumns: ["id"],
  },
  {
    name: "items",
    timestampColumn: "updated_at",
    columns: [
      "id",
      "name",
      "category",
      "sort_order",
      "is_active",
      "created_at",
      "updated_at",
    ],
    mergeKeyColumns: ["id"],
  },
  {
    name: "stock_targets",
    timestampColumn: "updated_at",
    columns: ["id", "item_id", "station_id", "target_count", "updated_at"],
    mergeKeyColumns: ["id"],
  },
  {
    name: "inventory_sessions",
    timestampColumn: "submitted_at",
    columns: [
      "id",
      "station_id",
      "submitted_by",
      "submitted_at",
      "item_count",
      "items_short",
    ],
    mergeKeyColumns: ["id"],
  },
  {
    name: "inventory_history",
    timestampColumn: "_full", // no timestamp — sync by session
    columns: [
      "id",
      "session_id",
      "item_name",
      "category",
      "station_name",
      "target_count",
      "actual_count",
      "delta",
      "status",
    ],
    mergeKeyColumns: ["id"],
  },
  {
    name: "orders",
    timestampColumn: "created_at",
    columns: [
      "id",
      "session_id",
      "station_id",
      "items_short",
      "pick_list",
      "status",
      "created_at",
      "filled_at",
      "filled_by",
    ],
    mergeKeyColumns: ["id"],
  },
  {
    name: "users",
    timestampColumn: "created_at",
    columns: [
      "id",
      "email",
      "name",
      "role",
      "auth_method",
      "station_id",
      "is_active",
      "created_at",
      "last_login_at",
    ],
    mergeKeyColumns: ["id"],
  },
  {
    name: "config",
    timestampColumn: "updated_at",
    columns: ["key", "value", "updated_at"],
    mergeKeyColumns: ["key"],
  },
];

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

function getAzureSqlConfig(): sql.config {
  // Try environment variables first, fall back to Vault
  let server = process.env.AZURE_SQL_SERVER;
  let user = process.env.AZURE_SQL_USER;
  let password = process.env.AZURE_SQL_PASSWORD;
  let database = process.env.AZURE_SQL_DATABASE || "ems_inventory";

  if (!server || !user || !password) {
    console.log("  Reading Azure SQL creds from Vault...");
    const vaultAddr = process.env.VAULT_ADDR || "http://127.0.0.1:8200";
    const vaultToken = process.env.VAULT_TOKEN || "dcvfd-dev-root";
    const raw = execSync(
      `VAULT_ADDR=${vaultAddr} VAULT_TOKEN=${vaultToken} vault kv get -format=json secret/ems-inventory/azure-sql`,
      { encoding: "utf-8" },
    );
    const vaultData = JSON.parse(raw).data.data;
    server = vaultData.server;
    user = vaultData.username;
    password = vaultData.password;
    database = database || "ems_inventory";
  }

  return {
    server: server!,
    user: user!,
    password: password!,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    requestTimeout: 30000,
    connectionTimeout: 15000,
  };
}

// ---------------------------------------------------------------------------
// D1 query via Cloudflare API
// ---------------------------------------------------------------------------

async function queryD1(query: string): Promise<D1QueryResult> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const databaseId = process.env.CF_D1_DATABASE_ID;

  if (!accountId || !apiToken || !databaseId) {
    throw new Error(
      "Missing Cloudflare env vars: CF_ACCOUNT_ID, CF_API_TOKEN, CF_D1_DATABASE_ID",
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql: query }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`D1 API error (${resp.status}): ${text}`);
  }

  const body = await resp.json();
  const result = (body as { result: D1QueryResult[] }).result[0];
  if (!result.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(result)}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Azure SQL helpers
// ---------------------------------------------------------------------------

async function getLastSyncTime(
  pool: sql.ConnectionPool,
  tableName: string,
): Promise<string> {
  const result = await pool
    .request()
    .input("table_name", sql.NVarChar, tableName)
    .query(
      "SELECT last_synced_at FROM sync_metadata WHERE table_name = @table_name",
    );

  if (result.recordset.length === 0) {
    return "1970-01-01T00:00:00";
  }
  const dt: Date = result.recordset[0].last_synced_at;
  return dt.toISOString().replace("Z", "");
}

async function updateSyncMetadata(
  pool: sql.ConnectionPool,
  tableName: string,
  rowCount: number,
): Promise<void> {
  await pool
    .request()
    .input("table_name", sql.NVarChar, tableName)
    .input("rows_synced", sql.Int, rowCount)
    .query(
      `UPDATE sync_metadata
       SET last_synced_at = SYSUTCDATETIME(),
           rows_synced = @rows_synced,
           updated_at = SYSUTCDATETIME()
       WHERE table_name = @table_name`,
    );
}

/**
 * Build a T-SQL MERGE statement for upsert.
 */
function buildMergeSQL(
  table: SyncTableConfig,
  rows: Record<string, unknown>[],
): string {
  if (rows.length === 0) return "";

  const cols = table.columns;

  // Build VALUES rows
  const valueRows = rows.map((row) => {
    const vals = cols.map((col) => {
      const v = row[col];
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "number") return String(v);
      // Escape single quotes
      return `N'${String(v).replace(/'/g, "''")}'`;
    });
    return `(${vals.join(", ")})`;
  });

  const colList = cols.map((c) => `[${c}]`).join(", ");
  const sourceColList = cols.map((c) => `src.[${c}]`).join(", ");
  const matchCondition = table.mergeKeyColumns
    .map((k) => `tgt.[${k}] = src.[${k}]`)
    .join(" AND ");
  const updateSet = cols
    .filter((c) => !table.mergeKeyColumns.includes(c))
    .map((c) => `tgt.[${c}] = src.[${c}]`)
    .join(", ");

  return `
    MERGE [${table.name}] AS tgt
    USING (VALUES ${valueRows.join(",\n           ")}) AS src (${colList})
    ON ${matchCondition}
    WHEN MATCHED THEN UPDATE SET ${updateSet}
    WHEN NOT MATCHED THEN INSERT (${colList}) VALUES (${sourceColList});
  `;
}

// ---------------------------------------------------------------------------
// Sync one table
// ---------------------------------------------------------------------------

async function syncTable(
  pool: sql.ConnectionPool,
  table: SyncTableConfig,
): Promise<number> {
  console.log(`\n--- Syncing: ${table.name} ---`);

  const lastSync = await getLastSyncTime(pool, table.name);
  console.log(`  Last sync: ${lastSync}`);

  // Build D1 query
  let d1Query: string;
  if (table.timestampColumn === "_full") {
    // Full sync — no timestamp filter
    d1Query = `SELECT ${table.columns.join(", ")} FROM ${table.name}`;
  } else {
    d1Query = `SELECT ${table.columns.join(", ")} FROM ${table.name} WHERE ${table.timestampColumn} > '${lastSync}'`;
  }

  console.log(`  D1 query: ${d1Query}`);
  const d1Result = await queryD1(d1Query);
  const rows = d1Result.results;
  console.log(`  Rows fetched from D1: ${rows.length}`);

  if (rows.length === 0) {
    console.log("  Nothing to sync.");
    return 0;
  }

  // Batch in groups of 500 to avoid T-SQL limits
  const BATCH_SIZE = 500;
  let totalMerged = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const mergeSQL = buildMergeSQL(table, batch);
    if (mergeSQL) {
      await pool.request().query(mergeSQL);
      totalMerged += batch.length;
      console.log(
        `  Merged batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows`,
      );
    }
  }

  await updateSyncMetadata(pool, table.name, totalMerged);
  console.log(`  Total merged: ${totalMerged}`);
  return totalMerged;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== D1 → Azure SQL Sync ===");
  console.log(`Started: ${new Date().toISOString()}`);

  const config = getAzureSqlConfig();
  console.log(`\nConnecting to ${config.server}/${config.database}...`);

  const pool = await sql.connect(config);
  console.log("Connected.");

  let totalRows = 0;
  const errors: string[] = [];

  for (const table of TABLES) {
    try {
      const count = await syncTable(pool, table);
      totalRows += count;
    } catch (err) {
      const msg = `ERROR syncing ${table.name}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  ${msg}`);
      errors.push(msg);
    }
  }

  await pool.close();

  console.log("\n=== Sync Complete ===");
  console.log(`Total rows synced: ${totalRows}`);
  if (errors.length > 0) {
    console.error(`Errors (${errors.length}):`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
