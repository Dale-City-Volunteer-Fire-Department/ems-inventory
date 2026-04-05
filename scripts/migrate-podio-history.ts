/**
 * migrate-podio-history.ts
 *
 * Reads Podio inventory app items (wide-format supply request records)
 * and transforms them into normalized D1-compatible INSERT statements
 * for `inventory_sessions` and `inventory_history` tables.
 *
 * Podio data: 864 records (2015-present), each with ~200 supply quantity fields.
 * We only have 3 sample records pulled via API; the script handles whatever is available.
 *
 * Usage: npx tsx scripts/migrate-podio-history.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PodioFieldValue {
  value: number | string | Record<string, unknown>;
  [key: string]: unknown;
}

interface PodioField {
  field_id: number;
  label: string;
  type: string;
  values: PodioFieldValue[];
}

interface PodioItem {
  item_id: number;
  app_item_id: number;
  title: string;
  created_on: string;
  fields: PodioField[];
}

interface PodioItemsExport {
  items: PodioItem[];
  total: number;
  filtered: number;
}

type Category = 'Airway' | 'Breathing' | 'Circulation' | 'Medications' | 'Splinting' | 'Burn' | 'OB/Peds' | 'Misc';

// ---------------------------------------------------------------------------
// Station mapping
// ---------------------------------------------------------------------------

const STATION_NAME_TO_ID: Record<string, number> = {
  'Station 10': 10,
  'Station 13': 13,
  'Station 18': 18,
  'Station 20': 20,
};

// ---------------------------------------------------------------------------
// Category inference (same rules as items script)
// ---------------------------------------------------------------------------

const CATEGORY_RULES: Array<{ pattern: RegExp; category: Category }> = [
  { pattern: /airway/i, category: 'Airway' },
  { pattern: /\bET [Tt]ube/i, category: 'Airway' },
  { pattern: /\bblade\b/i, category: 'Airway' },
  { pattern: /\bsuction/i, category: 'Airway' },
  { pattern: /\bsuct\b/i, category: 'Airway' },
  { pattern: /\bOP Airway/i, category: 'Airway' },
  { pattern: /\bNP Airway/i, category: 'Airway' },
  { pattern: /bougie/i, category: 'Airway' },
  { pattern: /stylet/i, category: 'Airway' },
  { pattern: /\bking airway/i, category: 'Airway' },
  { pattern: /I-Gel/i, category: 'Airway' },
  { pattern: /GlideScope/i, category: 'Airway' },
  { pattern: /GlideRite/i, category: 'Airway' },
  { pattern: /\bMac \d/i, category: 'Airway' },
  { pattern: /\bMiller \d/i, category: 'Airway' },
  { pattern: /\bLED Blade/i, category: 'Airway' },
  { pattern: /Laryng/i, category: 'Airway' },
  { pattern: /\bYank\b/i, category: 'Airway' },
  { pattern: /Bite Stick/i, category: 'Airway' },
  { pattern: /Meconium Aspirator/i, category: 'Airway' },
  { pattern: /ET Tru-Cuff/i, category: 'Airway' },
  { pattern: /\bCPAP\b/i, category: 'Airway' },
  { pattern: /Airtraq/i, category: 'Airway' },

  { pattern: /\bmask\b/i, category: 'Breathing' },
  { pattern: /\bNRB/i, category: 'Breathing' },
  { pattern: /nasal cannula/i, category: 'Breathing' },
  { pattern: /\bBVM/i, category: 'Breathing' },
  { pattern: /\bneb\b/i, category: 'Breathing' },
  { pattern: /oxygen/i, category: 'Breathing' },
  { pattern: /\bO2\b/i, category: 'Breathing' },
  { pattern: /\bCO2\b/i, category: 'Breathing' },
  { pattern: /\bETCO2\b/i, category: 'Breathing' },
  { pattern: /Filter ?[Ll]ine/i, category: 'Breathing' },
  { pattern: /\bExt Tubing/i, category: 'Breathing' },
  { pattern: /Bag Assist Neb/i, category: 'Breathing' },
  { pattern: /Hand Held Neb/i, category: 'Breathing' },
  { pattern: /Stethoscope/i, category: 'Breathing' },

  { pattern: /bandage/i, category: 'Circulation' },
  { pattern: /gauze/i, category: 'Circulation' },
  { pattern: /tourniquet/i, category: 'Circulation' },
  { pattern: /\bIV\b/i, category: 'Circulation' },
  { pattern: /saline/i, category: 'Circulation' },
  { pattern: /\bNACL\b/i, category: 'Circulation' },
  { pattern: /\bNaCL\b/, category: 'Circulation' },
  { pattern: /EZ-IO/i, category: 'Circulation' },
  { pattern: /Asherman/i, category: 'Circulation' },
  { pattern: /Celox/i, category: 'Circulation' },
  { pattern: /Decomp/i, category: 'Circulation' },
  { pattern: /Combat Tourniquet/i, category: 'Circulation' },
  { pattern: /\b\dx\d\b/, category: 'Circulation' },
  { pattern: /5x9/i, category: 'Circulation' },
  { pattern: /Kling/i, category: 'Circulation' },
  { pattern: /Trauma Dressing/i, category: 'Circulation' },
  { pattern: /H Bandage/i, category: 'Circulation' },
  { pattern: /Infuser/i, category: 'Circulation' },
  { pattern: /Hi-Flo/i, category: 'Circulation' },
  { pattern: /Stopcock/i, category: 'Circulation' },
  { pattern: /Admin Set/i, category: 'Circulation' },
  { pattern: /Drop Admin/i, category: 'Circulation' },
  { pattern: /Syringe/i, category: 'Circulation' },
  { pattern: /Injection Needle/i, category: 'Circulation' },
  { pattern: /Carpuject/i, category: 'Circulation' },
  { pattern: /Sharps Box/i, category: 'Circulation' },

  { pattern: /glucose/i, category: 'Medications' },
  { pattern: /Mucosal Atomization/i, category: 'Medications' },
  { pattern: /Activated Charcoal/i, category: 'Medications' },

  { pattern: /splint/i, category: 'Splinting' },
  { pattern: /\bSAM\b/, category: 'Splinting' },
  { pattern: /C-?Collar/i, category: 'Splinting' },
  { pattern: /Arm Board/i, category: 'Splinting' },

  { pattern: /burn/i, category: 'Burn' },

  { pattern: /\bOB\b/i, category: 'OB/Peds' },
  { pattern: /pediatric/i, category: 'OB/Peds' },
  { pattern: /Broselow/i, category: 'OB/Peds' },
  { pattern: /Bulb Syringe/i, category: 'OB/Peds' },
];

function inferCategory(name: string): Category {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(name)) {
      return rule.category;
    }
  }
  return 'Misc';
}

function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

/** Strip HTML tags from Podio text fields */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const inputPath = '/home/dcdev/podio_items_10827920.json';
  const appDefPath = '/home/dcdev/podio_app_10827920.json';
  const outputDir = path.resolve(__dirname, 'output');
  const outputPath = path.join(outputDir, 'podio_history.sql');

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Podio items file not found: ${inputPath}`);
    process.exit(1);
  }

  // Load app definition to get the full list of number fields (supply names)
  const appDef = JSON.parse(fs.readFileSync(appDefPath, 'utf-8'));
  const numberFieldLabels = new Set<string>(
    appDef.fields.filter((f: { type: string }) => f.type === 'number').map((f: { label: string }) => f.label),
  );
  console.log(`Found ${numberFieldLabels.size} supply quantity fields in app definition`);

  // Load items
  const data: PodioItemsExport = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  console.log(`Read ${data.items.length} Podio inventory records (of ${data.total} total in Podio)`);

  // Session ID offset to avoid collisions with Airtable history sessions
  // Airtable sessions are numbered 1..N; Podio sessions start at 10000
  const SESSION_ID_OFFSET = 10000;
  // History ID offset
  const HISTORY_ID_OFFSET = 100000;

  const sessions: Array<{
    id: number;
    stationId: number;
    stationName: string;
    submittedBy: string | null;
    submittedAt: string;
    itemCount: number;
    itemsShort: number;
  }> = [];

  const historyRows: Array<{
    sessionId: number;
    itemName: string;
    category: Category;
    stationName: string;
    targetCount: number;
    actualCount: number;
    delta: number;
    status: string;
  }> = [];

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const sessionId = SESSION_ID_OFFSET + i + 1;

    // Extract metadata fields
    let date = '';
    let stationName = '';
    let stationId = 0;
    let requester: string | null = null;

    for (const field of item.fields) {
      if (field.label === 'Date' && field.values.length > 0) {
        const val = field.values[0];
        date = (val.start_date as string) ?? (val.start as string) ?? '';
      } else if (field.label === 'Station' && field.values.length > 0) {
        const val = field.values[0];
        const stationVal = val.value as Record<string, unknown>;
        stationName = (stationVal.title as string) ?? '';
        stationId = STATION_NAME_TO_ID[stationName] ?? 0;
      } else if (field.label === 'Name of person requesting supplies' && field.values.length > 0) {
        requester = stripHtml(String(field.values[0].value));
      }
    }

    // Process each supply quantity field
    let itemCount = 0;
    let itemsShort = 0;

    for (const field of item.fields) {
      if (field.type !== 'number') continue;
      if (!numberFieldLabels.has(field.label)) continue;
      if (field.values.length === 0) continue;

      const actualCount = Number(field.values[0].value) || 0;
      // Podio records are supply requests — the quantity is what was counted on station.
      // We record them as actual counts with target=0 and delta=actualCount since
      // we don't have per-item PAR levels embedded in these records.
      const targetCount = 0;
      const delta = actualCount - targetCount;
      const _status = actualCount === 0 ? 'Good' : 'Good';

      historyRows.push({
        sessionId,
        itemName: field.label,
        category: inferCategory(field.label),
        stationName,
        targetCount,
        actualCount,
        delta,
        status: 'Good',
      });
      itemCount++;
      if (delta < 0) itemsShort++;
    }

    sessions.push({
      id: sessionId,
      stationId,
      stationName,
      submittedBy: requester,
      submittedAt: date ? `${date}T00:00:00.000Z` : item.created_on,
      itemCount,
      itemsShort,
    });
  }

  // Build SQL
  const lines: string[] = [
    `-- migrate-podio-history.ts output`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- ${sessions.length} sessions from Podio (of ${data.total} total in Podio)`,
    `-- ${historyRows.length} history rows`,
    `-- Session IDs start at ${SESSION_ID_OFFSET + 1} to avoid Airtable collisions`,
    `-- History IDs start at ${HISTORY_ID_OFFSET + 1}`,
    ``,
    `-- Podio Inventory Sessions --------------------------------------------`,
    ``,
  ];

  for (const session of sessions) {
    lines.push(
      `INSERT OR IGNORE INTO inventory_sessions (id, station_id, submitted_by, submitted_at, item_count, items_short)` +
        ` VALUES (${session.id}, ${session.stationId}, ${session.submittedBy ? `'${sqlEscape(session.submittedBy)}'` : 'NULL'}, '${session.submittedAt}', ${session.itemCount}, ${session.itemsShort});`,
    );
  }

  lines.push(``);
  lines.push(`-- Podio Inventory History ---------------------------------------------`);
  lines.push(``);

  for (let i = 0; i < historyRows.length; i++) {
    const row = historyRows[i];
    const historyId = HISTORY_ID_OFFSET + i + 1;
    lines.push(
      `INSERT OR IGNORE INTO inventory_history (id, session_id, item_name, category, station_name, target_count, actual_count, delta, status)` +
        ` VALUES (${historyId}, ${row.sessionId}, '${sqlEscape(row.itemName)}', '${row.category}', '${sqlEscape(row.stationName)}', ${row.targetCount}, ${row.actualCount}, ${row.delta}, '${sqlEscape(row.status)}');`,
    );
  }

  lines.push('');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

  console.log(`Wrote ${sessions.length} sessions + ${historyRows.length} history rows to ${outputPath}`);
  console.log(`  Note: Only ${data.items.length} of ${data.total} Podio records were available locally.`);
  console.log(`  To migrate all records, pull remaining items via Podio API and re-run.`);
}

main();
