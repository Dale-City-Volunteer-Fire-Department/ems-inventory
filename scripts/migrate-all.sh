#!/usr/bin/env bash
# migrate-all.sh — Run all data migration scripts in order
#
# Usage: bash scripts/migrate-all.sh
# Requires: npx tsx (via devDependencies)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=== EMS Inventory Data Migration ==="
echo ""

# Ensure output directory exists
mkdir -p "$SCRIPT_DIR/output"

echo "--- Step 1: Migrate Airtable items ---"
npx tsx "$SCRIPT_DIR/migrate-airtable-items.ts"
echo ""

echo "--- Step 2: Migrate Airtable stock targets ---"
npx tsx "$SCRIPT_DIR/migrate-airtable-targets.ts"
echo ""

echo "--- Step 3: Migrate Airtable history ---"
npx tsx "$SCRIPT_DIR/migrate-airtable-history.ts"
echo ""

echo "--- Step 4: Migrate Podio history ---"
npx tsx "$SCRIPT_DIR/migrate-podio-history.ts"
echo ""

echo "=== Migration complete ==="
echo "Output files:"
ls -la "$SCRIPT_DIR/output/"
