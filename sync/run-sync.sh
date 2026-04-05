#!/usr/bin/env bash
# run-sync.sh — wrapper for D1 → Azure SQL sync
# Sources credentials from Vault and runs the TypeScript sync script.
# Designed to be called by systemd (ems-sync.service).

set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-dcvfd-dev-root}"
export VAULT_ADDR VAULT_TOKEN

vault_get() {
  VAULT_ADDR="$VAULT_ADDR" VAULT_TOKEN="$VAULT_TOKEN" \
    vault kv get -format=json "$1" | jq -r ".data.data.$2"
}

# Cloudflare D1 credentials
export CF_API_TOKEN
CF_API_TOKEN=$(vault_get secret/ems-inventory/cloudflare api_token)
export CF_ACCOUNT_ID
CF_ACCOUNT_ID=$(vault_get secret/ems-inventory/cloudflare account_id)
export CF_D1_DATABASE_ID="2ab90cd3-01e5-4151-b664-2714da807fe8"

# Azure SQL credentials
export AZURE_SQL_SERVER
AZURE_SQL_SERVER=$(vault_get secret/ems-inventory/azure-sql server)
export AZURE_SQL_DATABASE="ems_inventory"
export AZURE_SQL_USER
AZURE_SQL_USER=$(vault_get secret/ems-inventory/azure-sql username)
export AZURE_SQL_PASSWORD
AZURE_SQL_PASSWORD=$(vault_get secret/ems-inventory/azure-sql password)

cd /home/dcdev/ems-inventory
exec npx tsx sync/sync-to-azure.ts
