/**
 * migrate-airtable-items.ts
 *
 * Reads Airtable EMS items JSON export and outputs D1-compatible
 * INSERT statements for the `items` table.
 *
 * Usage: npx tsx scripts/migrate-airtable-items.ts
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
    'Item Name'?: string;
    'Sort Order'?: number;
    Active?: boolean;
    'Created on'?: string;
    [key: string]: unknown;
  };
}

interface AirtableExport {
  records: AirtableRecord[];
  offset?: string;
}

type Category = 'Airway' | 'Breathing' | 'Circulation' | 'Medications' | 'Splinting' | 'Burn' | 'OB/Peds' | 'Misc';

// ---------------------------------------------------------------------------
// Category inference rules
// ---------------------------------------------------------------------------

const CATEGORY_RULES: Array<{ pattern: RegExp; category: Category }> = [
  // Airway
  { pattern: /airway/i, category: 'Airway' },
  { pattern: /\bET tube/i, category: 'Airway' },
  { pattern: /\bET Tube/i, category: 'Airway' },
  { pattern: /laryngoscope/i, category: 'Airway' },
  { pattern: /\bblade\b/i, category: 'Airway' },
  { pattern: /\bsuction/i, category: 'Airway' },
  { pattern: /\bsuct\b/i, category: 'Airway' },
  { pattern: /catheter suction/i, category: 'Airway' },
  { pattern: /\bOPA\b/, category: 'Airway' },
  { pattern: /\bNPA\b/, category: 'Airway' },
  { pattern: /\bOP Airway/i, category: 'Airway' },
  { pattern: /\bNP Airway/i, category: 'Airway' },
  { pattern: /intubation/i, category: 'Airway' },
  { pattern: /bougie/i, category: 'Airway' },
  { pattern: /stylet/i, category: 'Airway' },
  { pattern: /\bking airway/i, category: 'Airway' },
  { pattern: /cricothyrotomy/i, category: 'Airway' },
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

  // Breathing
  { pattern: /\bmask\b/i, category: 'Breathing' },
  { pattern: /\bNRB\b/i, category: 'Breathing' },
  { pattern: /nasal cannula/i, category: 'Breathing' },
  { pattern: /\bBVM\b/i, category: 'Breathing' },
  { pattern: /nebulizer/i, category: 'Breathing' },
  { pattern: /\bneb\b/i, category: 'Breathing' },
  { pattern: /oxygen/i, category: 'Breathing' },
  { pattern: /\bO2\b/i, category: 'Breathing' },
  { pattern: /\bCO2\b/i, category: 'Breathing' },
  { pattern: /\bETCO2\b/i, category: 'Breathing' },
  { pattern: /capno/i, category: 'Breathing' },
  { pattern: /Filter ?[Ll]ine/i, category: 'Breathing' },
  { pattern: /\bExt Tubing/i, category: 'Breathing' },
  { pattern: /O2 Supply Tubing/i, category: 'Breathing' },
  { pattern: /O2 Cyl/i, category: 'Breathing' },
  { pattern: /O2 Gasket/i, category: 'Breathing' },
  { pattern: /O2 Regulator/i, category: 'Breathing' },
  { pattern: /Bag Assist Neb/i, category: 'Breathing' },
  { pattern: /Hand Held Neb/i, category: 'Breathing' },
  { pattern: /Stethoscope/i, category: 'Breathing' },

  // Circulation
  { pattern: /bandage/i, category: 'Circulation' },
  { pattern: /gauze/i, category: 'Circulation' },
  { pattern: /tourniquet/i, category: 'Circulation' },
  { pattern: /\bIV\b/i, category: 'Circulation' },
  { pattern: /saline/i, category: 'Circulation' },
  { pattern: /\bNACL\b/i, category: 'Circulation' },
  { pattern: /\bIO\b/i, category: 'Circulation' },
  { pattern: /EZ-IO/i, category: 'Circulation' },
  { pattern: /pressure dressing/i, category: 'Circulation' },
  { pattern: /hemostatic/i, category: 'Circulation' },
  { pattern: /chest seal/i, category: 'Circulation' },
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
  { pattern: /Stopcock/i, category: 'Circulation' },
  { pattern: /Admin Set/i, category: 'Circulation' },
  { pattern: /Drop Admin/i, category: 'Circulation' },
  { pattern: /Syringe/i, category: 'Circulation' },
  { pattern: /Injection Needle/i, category: 'Circulation' },
  { pattern: /Carpuject/i, category: 'Circulation' },
  { pattern: /Sharps Box/i, category: 'Circulation' },

  // Medications
  { pattern: /epinephrine/i, category: 'Medications' },
  { pattern: /naloxone/i, category: 'Medications' },
  { pattern: /narcan/i, category: 'Medications' },
  { pattern: /glucose/i, category: 'Medications' },
  { pattern: /aspirin/i, category: 'Medications' },
  { pattern: /nitroglycerin/i, category: 'Medications' },
  { pattern: /medication/i, category: 'Medications' },
  { pattern: /\bdrug\b/i, category: 'Medications' },
  { pattern: /Mucosal Atomization/i, category: 'Medications' },

  // Splinting
  { pattern: /splint/i, category: 'Splinting' },
  { pattern: /\bSAM\b/, category: 'Splinting' },
  { pattern: /traction/i, category: 'Splinting' },
  { pattern: /cervical collar/i, category: 'Splinting' },
  { pattern: /C [Cc]ollar/i, category: 'Splinting' },
  { pattern: /\bKED\b/, category: 'Splinting' },
  { pattern: /backboard/i, category: 'Splinting' },
  { pattern: /Arm Board/i, category: 'Splinting' },

  // Burn
  { pattern: /burn/i, category: 'Burn' },
  { pattern: /silvadene/i, category: 'Burn' },
  { pattern: /water gel/i, category: 'Burn' },

  // OB/Peds
  { pattern: /\bOB\b/i, category: 'OB/Peds' },
  { pattern: /\bpeds\b/i, category: 'OB/Peds' },
  { pattern: /pediatric/i, category: 'OB/Peds' },
  { pattern: /\binfant\b/i, category: 'OB/Peds' },
  { pattern: /neonatal/i, category: 'OB/Peds' },
  { pattern: /umbilical/i, category: 'OB/Peds' },
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

// ---------------------------------------------------------------------------
// Data cleanup
// ---------------------------------------------------------------------------

/** Escape single quotes for SQL strings */
function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

/** Clean item name: normalize whitespace, strip triple quotes, trim */
function cleanName(raw: string): string {
  let name = raw.trim();
  // Remove surrounding quotes (some Airtable exports wrap in triple or double quotes)
  name = name.replace(/^"{1,3}/, '').replace(/"{1,3}$/, '');
  // Normalize internal whitespace
  name = name.replace(/\s+/g, ' ').trim();
  return name;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const inputPath = '/home/dcdev/ems-inventory-data/ems-items.json';
  const outputDir = path.resolve(__dirname, 'output');
  const outputPath = path.join(outputDir, 'items.sql');

  // Read Airtable export
  const raw: AirtableExport = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  console.log(`Read ${raw.records.length} total records from Airtable`);

  // Blacklist items to skip
  const SKIP_NAMES = new Set(['Test Item']);

  // Track items to deduplicate "Suct Tubing" variants
  const seenNames = new Set<string>();
  const items: Array<{
    name: string;
    category: Category;
    sort_order: number;
    is_active: number;
    created_at: string;
  }> = [];

  let skippedInactive = 0;
  let skippedBlacklist = 0;
  let skippedDuplicate = 0;

  for (const rec of raw.records) {
    const rawName = rec.fields['Item Name'];
    if (!rawName) continue;

    const name = cleanName(rawName);

    // Skip blacklisted items
    if (SKIP_NAMES.has(name)) {
      skippedBlacklist++;
      continue;
    }

    // Skip inactive items (Active explicitly false or missing)
    if (rec.fields.Active !== true) {
      skippedInactive++;
      continue;
    }

    // Deduplicate: "Suct Tubing, 9/32"" Each" vs "Suct Tubing, 9/32" Each"
    // Normalize for dedup comparison: collapse double-quote artifacts
    const dedup = name.replace(/""+/g, '"');
    if (seenNames.has(dedup)) {
      skippedDuplicate++;
      continue;
    }
    seenNames.add(dedup);

    // Use the cleaner name (single quote variant) if this was a double-quote artifact
    const finalName = dedup;

    items.push({
      name: finalName,
      category: inferCategory(finalName),
      sort_order: rec.fields['Sort Order'] ?? 0,
      is_active: 1,
      created_at: rec.fields['Created on'] ?? rec.createdTime,
    });
  }

  // Sort by sort_order
  items.sort((a, b) => a.sort_order - b.sort_order);

  // Build SQL
  const lines: string[] = [
    `-- migrate-airtable-items.ts output`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- ${items.length} active items (skipped: ${skippedInactive} inactive, ${skippedBlacklist} blacklisted, ${skippedDuplicate} duplicate)`,
    ``,
    `-- Items ---------------------------------------------------------------`,
    ``,
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = i + 1;
    lines.push(
      `INSERT OR IGNORE INTO items (id, name, category, sort_order, is_active, created_at, updated_at)` +
        ` VALUES (${id}, '${sqlEscape(item.name)}', '${item.category}', ${item.sort_order}, ${item.is_active}, '${item.created_at}', '${item.created_at}');`,
    );
  }

  lines.push('');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

  console.log(`Wrote ${items.length} items to ${outputPath}`);
  console.log(`  Skipped: ${skippedInactive} inactive, ${skippedBlacklist} blacklisted, ${skippedDuplicate} duplicate`);

  // Print category summary
  const catCounts: Record<string, number> = {};
  for (const item of items) {
    catCounts[item.category] = (catCounts[item.category] || 0) + 1;
  }
  console.log('  Categories:');
  for (const [cat, count] of Object.entries(catCounts).sort()) {
    console.log(`    ${cat}: ${count}`);
  }

  // Also write a JSON map of name→id for cross-referencing in other scripts
  const nameToId: Record<string, number> = {};
  for (let i = 0; i < items.length; i++) {
    nameToId[items[i].name] = i + 1;
  }
  const mapPath = path.join(outputDir, 'item-name-to-id.json');
  fs.writeFileSync(mapPath, JSON.stringify(nameToId, null, 2), 'utf-8');
  console.log(`Wrote item name→ID map to ${mapPath}`);
}

main();
