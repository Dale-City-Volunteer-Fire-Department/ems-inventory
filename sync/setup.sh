#!/usr/bin/env bash
# setup.sh — Create ems_inventory database on Azure SQL and run schema.sql
# Usage: ./sync/setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQLCMD="/opt/mssql-tools18/bin/sqlcmd"

# --- Pull credentials from Vault ---
export VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
export VAULT_TOKEN="${VAULT_TOKEN:-dcvfd-dev-root}"

echo "==> Fetching Azure SQL credentials from Vault..."
VAULT_JSON=$(vault kv get -format=json secret/ems-inventory/azure-sql)
SQL_SERVER=$(echo "$VAULT_JSON" | jq -r '.data.data.server')
SQL_USER=$(echo "$VAULT_JSON" | jq -r '.data.data.username')
SQL_PASS=$(echo "$VAULT_JSON" | jq -r '.data.data.password')
SQL_DB="ems_inventory"

echo "==> Server: $SQL_SERVER"
echo "==> User:   $SQL_USER"
echo "==> Target: $SQL_DB"

# --- Create database if not exists ---
echo ""
echo "==> Creating database '$SQL_DB' if it does not exist..."
"$SQLCMD" -S "$SQL_SERVER" -U "$SQL_USER" -P "$SQL_PASS" -C -Q \
  "IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'$SQL_DB')
   BEGIN
     CREATE DATABASE [$SQL_DB];
     PRINT 'Database created.';
   END
   ELSE
     PRINT 'Database already exists.';"

# --- Run schema.sql ---
echo ""
echo "==> Running schema.sql against $SQL_DB..."
"$SQLCMD" -S "$SQL_SERVER" -U "$SQL_USER" -P "$SQL_PASS" -d "$SQL_DB" -C \
  -i "$SCRIPT_DIR/schema.sql"

# --- Verify tables ---
echo ""
echo "==> Verifying tables in $SQL_DB..."
"$SQLCMD" -S "$SQL_SERVER" -U "$SQL_USER" -P "$SQL_PASS" -d "$SQL_DB" -C -Q \
  "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;"

echo ""
echo "==> Setup complete."
