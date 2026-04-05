/**
 * migrate-airtable-history.ts
 *
 * Reads Airtable inventory-history JSON exports (paginated) and outputs
 * D1-compatible INSERT statements for `inventory_sessions` and
 * `inventory_history` tables.
 *
 * Usage: npx tsx scripts/migrate-airtable-history.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: {
    'History ID'?: string;
    'Item Name'?: string;
    'Station Name'?: string;
    'Target Count'?: number;
    'Actual Count'?: number;
    'Submitted At'?: string;
    'Submitted By'?: string;
    Delta?: number;
    Status?: string;
    'Session ID'?: string;
    [key: string]: unknown;
  };
}

interface AirtableExport {
  records: AirtableRecord[];
  offset?: string;
}

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
// Category inference (same as items script)
// ---------------------------------------------------------------------------

type Category = 'Airway' | 'Breathing' | 'Circulation' | 'Medications' | 'Splinting' | 'Burn' | 'OB/Peds' | 'Misc';

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

  { pattern: /\bmask\b/i, category: 'Breathing' },
  { pattern: /\bNRB\b/i, category: 'Breathing' },
  { pattern: /nasal cannula/i, category: 'Breathing' },
  { pattern: /\bBVM\b/i, category: 'Breathing' },
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
  { pattern: /EZ-IO/i, category: 'Circulation' },
  { pattern: /Asherman/i, category: 'Circulation' },
  { pattern: /Celox/i, category: 'Circulation' },
  { pattern: /Decomp/i, category: 'Circulation' },
  { pattern: /Combat Tourniquet/i, category: 'Circulation' },
  { pattern: /\b\dx\d\b/, category: 'Circulation' },
  { pattern: /5x9/i, category: 'Circulation' },
  { pattern: /Kling/i, category: 'Circulation' },
  { pattern: /Trauma Dressing/i, category: 'Circulation' },
  { pattern: /H - Bandage/i, category: 'Circulation' },
  { pattern: /Infuser/i, category: 'Circulation' },
  { pattern: /Hi-Flo/i, category: 'Circulation' },
  { pattern: /Admin Set/i, category: 'Circulation' },
  { pattern: /Drop Admin/i, category: 'Circulation' },
  { pattern: /Syringe/i, category: 'Circulation' },
  { pattern: /Injection Needle/i, category: 'Circulation' },
  { pattern: /Carpuject/i, category: 'Circulation' },
  { pattern: /Sharps Box/i, category: 'Circulation' },

  { pattern: /glucose/i, category: 'Medications' },
  { pattern: /Mucosal Atomization/i, category: 'Medications' },

  { pattern: /splint/i, category: 'Splinting' },
  { pattern: /\bSAM\b/, category: 'Splinting' },
  { pattern: /C [Cc]ollar/i, category: 'Splinting' },
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const dataDir = '/home/dcdev/ems-inventory-data';
  const outputDir = path.resolve(__dirname, 'output');
  const outputPath = path.join(outputDir, 'history.sql');

  // Read all paginated history files
  const files = fs
    .readdirSync(dataDir)
    .filter((f) => f.startsWith('inventory-history') && f.endsWith('.json'))
    .sort();

  const allRecords: AirtableRecord[] = [];
  for (const file of files) {
    const data: AirtableExport = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
    allRecords.push(...data.records);
    console.log(`  ${file}: ${data.records.length} records`);
  }
  console.log(`Read ${allRecords.length} total history records`);

  // Group by Session ID to create sessions
  const sessionMap = new Map<
    string,
    {
      stationName: string;
      stationId: number;
      submittedAt: string;
      submittedBy: string | null;
      records: AirtableRecord[];
    }
  >();

  for (const rec of allRecords) {
    const sessionId = rec.fields['Session ID'];
    if (!sessionId) continue;

    if (!sessionMap.has(sessionId)) {
      const stationName = rec.fields['Station Name'] ?? '';
      const stationId = STATION_NAME_TO_ID[stationName] ?? 0;
      sessionMap.set(sessionId, {
        stationName,
        stationId,
        submittedAt: rec.fields['Submitted At'] ?? rec.createdTime,
        submittedBy: (rec.fields['Submitted By'] as string) ?? null,
        records: [],
      });
    }
    sessionMap.get(sessionId)!.records.push(rec);
  }

  console.log(`Found ${sessionMap.size} unique sessions`);

  // Build SQL
  const lines: string[] = [
    `-- migrate-airtable-history.ts output`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- ${sessionMap.size} sessions, ${allRecords.length} history records`,
    ``,
  ];

  // Sessions
  lines.push(`-- Inventory Sessions --------------------------------------------------`);
  lines.push(``);

  const sessionIds = [...sessionMap.keys()].sort();
  const sessionIdToNum = new Map<string, number>();

  for (let i = 0; i < sessionIds.length; i++) {
    const sessionKey = sessionIds[i];
    const session = sessionMap.get(sessionKey)!;
    const sessionNum = i + 1;
    sessionIdToNum.set(sessionKey, sessionNum);

    const itemCount = session.records.length;
    const itemsShort = session.records.filter((r) => (r.fields.Status ?? '').toLowerCase() === 'short').length;

    lines.push(
      `INSERT OR IGNORE INTO inventory_sessions (id, station_id, submitted_by, submitted_at, item_count, items_short)` +
        ` VALUES (${sessionNum}, ${session.stationId}, ${session.submittedBy ? `'${sqlEscape(session.submittedBy)}'` : 'NULL'}, '${session.submittedAt}', ${itemCount}, ${itemsShort});`,
    );
  }

  lines.push(``);
  lines.push(`-- Inventory History ---------------------------------------------------`);
  lines.push(``);

  // History records
  let historyId = 0;
  for (const sessionKey of sessionIds) {
    const session = sessionMap.get(sessionKey)!;
    const sessionNum = sessionIdToNum.get(sessionKey)!;

    for (const rec of session.records) {
      historyId++;
      const itemName = rec.fields['Item Name'] ?? '';
      const category = inferCategory(itemName);
      const stationName = rec.fields['Station Name'] ?? '';
      const targetCount = rec.fields['Target Count'] ?? 0;
      const actualCount = rec.fields['Actual Count'] ?? 0;
      const delta = rec.fields.Delta ?? 0;
      const status = rec.fields.Status ?? 'Good';

      lines.push(
        `INSERT OR IGNORE INTO inventory_history (id, session_id, item_name, category, station_name, target_count, actual_count, delta, status)` +
          ` VALUES (${historyId}, ${sessionNum}, '${sqlEscape(itemName)}', '${category}', '${sqlEscape(stationName)}', ${targetCount}, ${actualCount}, ${delta}, '${sqlEscape(status)}');`,
      );
    }
  }

  lines.push('');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

  console.log(`Wrote ${sessionMap.size} sessions + ${historyId} history records to ${outputPath}`);
}

main();
