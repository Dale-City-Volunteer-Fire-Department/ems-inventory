// Public inventory submission handlers — PIN-gated or magic-link-gated, no session auth required

import type { Env } from './types';
import { checkPinRateLimit } from './auth/pin';
import { getInventoryTemplate, formatPickList } from './lib/db';
import { ok, badRequest, unauthorized, serverError, tooManyRequests } from './lib/response';

// ── Token helpers ───────────────────────────────────────────────────

const PUBLIC_TOKEN_TTL = 2 * 60 * 60; // 2 hours in seconds

// Per-token submission and upload caps (applied to ALL session tokens regardless of auth origin)
const MAX_SUBMISSIONS_PER_TOKEN = 10;
const MAX_UPLOADS_PER_TOKEN = 50;
const MAX_ATTACHMENTS_PER_SUBMIT = 10;

// HIGH-2: Unified token data — email field present for magic-link-derived sessions, null for PIN
interface PublicTokenData {
  created: number;
  submissions: number;
  uploads: number;
  email?: string | null;
}

function publicTokenKey(token: string): string {
  return `public:${token}`;
}

async function generatePublicToken(kv: KVNamespace): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const data: PublicTokenData = { created: Date.now(), submissions: 0, uploads: 0, email: null };
  await kv.put(publicTokenKey(token), JSON.stringify(data), { expirationTtl: PUBLIC_TOKEN_TTL });
  return token;
}

/**
 * Validate a public session token (issued by PIN flow or magic-link verify).
 * All tokens are stored under the public: prefix with counters and an optional email field.
 * Returns { tokenData, submitterEmail } or null if invalid.
 */
async function validateAnyPublicToken(
  kv: KVNamespace,
  token: string | null,
): Promise<{ tokenData: PublicTokenData; submitterEmail: string | null } | null> {
  if (!token) return null;

  const val = await kv.get(publicTokenKey(token), 'text');
  if (val === null) return null;

  let tokenData: PublicTokenData;
  try {
    tokenData = JSON.parse(val) as PublicTokenData;
  } catch {
    // Legacy value '1' — treat as valid with zero counters and no email
    if (val === '1') {
      tokenData = { created: 0, submissions: 0, uploads: 0, email: null };
    } else {
      return null;
    }
  }

  const submitterEmail = tokenData.email ?? null;
  return { tokenData, submitterEmail };
}

async function saveTokenData(kv: KVNamespace, token: string, data: PublicTokenData): Promise<void> {
  await kv.put(publicTokenKey(token), JSON.stringify(data), { expirationTtl: PUBLIC_TOKEN_TTL });
}

// ── Allowed image MIME types ────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── R2 key validation ───────────────────────────────────────────────

const R2_KEY_PATTERN = /^attachments\/[a-f0-9-]+\/.+$/;

// ── Magic-byte signatures ──────────────────────────────────────────

const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  'image/heic': [[0x00, 0x00, 0x00]], // ftyp box (check bytes 4-7 for 'ftyp')
  'image/heif': [[0x00, 0x00, 0x00]], // same ftyp box structure as heic
};

function checkMagicBytes(buffer: ArrayBuffer, contentType: string): boolean {
  const signatures = MAGIC_BYTES[contentType];
  if (!signatures) {
    // No signature defined — allow (e.g. heif variants)
    return true;
  }

  const bytes = new Uint8Array(buffer);

  // Special case for HEIC/HEIF: check bytes 4-7 for 'ftyp'
  if (contentType === 'image/heic' || contentType === 'image/heif') {
    if (bytes.length < 8) return false;
    // bytes 4-7 should spell 'ftyp'
    return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  }

  for (const sig of signatures) {
    if (bytes.length < sig.length) continue;
    const matches = sig.every((byte, i) => bytes[i] === byte);
    if (matches) return true;
  }

  return false;
}

// ── Handlers ────────────────────────────────────────────────────────

/**
 * POST /api/public/verify-pin
 * Body: { pin: string }
 * Returns: { success: true, token: string }
 */
export async function handlePublicVerifyPin(request: Request, env: Env): Promise<Response> {
  try {
    // H-4: Rate limit by IP — reject unknown IP
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || ip === 'unknown') {
      return badRequest('Unable to determine client IP');
    }
    const allowed = await checkPinRateLimit(env.SESSIONS, ip);
    if (!allowed) {
      return tooManyRequests('Too many PIN attempts. Please try again later.');
    }

    const body = (await request.json()) as { pin?: string };
    if (!body.pin) {
      return badRequest('pin is required');
    }

    const pin = String(body.pin);

    // Get the configured PIN from config table, fall back to env secret
    const configRow = await env.DB.prepare('SELECT value FROM config WHERE key = ?')
      .bind('station_pin')
      .first<{ value: string }>();
    const configPin = configRow?.value ?? env.STATION_PIN;

    // Constant-time comparison
    const encoder = new TextEncoder();
    const aBytes = encoder.encode(pin);
    const bBytes = encoder.encode(configPin);
    const maxLen = Math.max(aBytes.length, bBytes.length);
    let result = aBytes.length === bBytes.length ? 0 : 1;
    for (let i = 0; i < maxLen; i++) {
      const aByte = i < aBytes.length ? aBytes[i] : 0;
      const bByte = i < bBytes.length ? bBytes[i] : 0;
      result |= aByte ^ bByte;
    }

    if (result !== 0) {
      return unauthorized('Invalid PIN');
    }

    const token = await generatePublicToken(env.SESSIONS);
    return ok({ success: true, token });
  } catch (err) {
    console.error('[handlePublicVerifyPin]', err);
    return serverError('PIN verification failed');
  }
}

/**
 * POST /api/public/upload
 * Header: X-Public-Token
 * Body: multipart form data with image file
 * Returns: { r2_key, filename, content_type, size_bytes }
 */
export async function handlePublicUpload(request: Request, env: Env): Promise<Response> {
  try {
    const token = request.headers.get('X-Public-Token');
    const validated = await validateAnyPublicToken(env.SESSIONS, token);
    if (!validated) {
      return unauthorized('Invalid or expired public token');
    }
    const { tokenData, submitterEmail } = validated;

    // HIGH-2: Check upload cap — applies to all session tokens regardless of auth origin
    if (tokenData.uploads >= MAX_UPLOADS_PER_TOKEN) {
      return tooManyRequests(`Upload limit reached (${MAX_UPLOADS_PER_TOKEN} uploads per session)`);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return badRequest('No file provided');
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return badRequest(`Invalid file type: ${file.type}. Allowed: jpg, png, webp, heic`);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return badRequest(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB`);
    }

    // M-1: Magic-byte validation
    const buffer = await file.arrayBuffer();
    if (!checkMagicBytes(buffer, file.type)) {
      return badRequest(`File content does not match declared type: ${file.type}`);
    }

    // Generate a unique key for the upload
    const uuid = crypto.randomUUID();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const r2Key = `attachments/${uuid}/${sanitizedFilename}`;

    // Upload to R2
    await env.ATTACHMENTS.put(r2Key, buffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalFilename: file.name },
    });

    // HIGH-2: Increment upload counter for all session tokens
    tokenData.uploads += 1;
    await saveTokenData(env.SESSIONS, token!, tokenData);

    return ok({
      r2_key: r2Key,
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
    });
  } catch (err) {
    console.error('[handlePublicUpload]', err);
    return serverError('File upload failed');
  }
}

/**
 * GET /api/public/inventory/:stationId
 * Header: X-Public-Token
 * Returns the inventory template for a station (same shape as /api/inventory/current/:stationId)
 */
export async function handlePublicGetInventory(request: Request, env: Env): Promise<Response> {
  try {
    const token = request.headers.get('X-Public-Token');
    const validated = await validateAnyPublicToken(env.SESSIONS, token);
    if (!validated) {
      return unauthorized('Invalid or expired public token');
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    // /api/public/inventory/:stationId → parts = ['', 'api', 'public', 'inventory', ':stationId']
    const stationIdStr = parts[4];
    const stationId = Number(stationIdStr);
    if (!stationId || isNaN(stationId)) {
      return badRequest('Invalid station ID');
    }

    const rows = await getInventoryTemplate(env.DB, stationId);
    if (rows.length === 0) {
      return badRequest(`No items found for station ${stationId}`);
    }

    const items = rows.map((r) => ({
      id: 0,
      item_id: r.item_id,
      station_id: stationId,
      target_count: r.target_count,
      actual_count: null,
      delta: null,
      status: 'not_entered' as const,
      session_id: null,
      name: r.item_name,
      category: r.category,
      sort_order: r.sort_order,
    }));

    return ok(items);
  } catch (err) {
    console.error('[handlePublicGetInventory]', err);
    return serverError('Failed to get inventory template');
  }
}

/**
 * POST /api/public/inventory/submit
 * Header: X-Public-Token
 * Body: { station_id, submitter_name?, counts, notes?, attachments? }
 * Returns: { session_id, items_submitted, items_short, order_created }
 */
export async function handlePublicInventorySubmit(request: Request, env: Env): Promise<Response> {
  try {
    const token = request.headers.get('X-Public-Token');
    const validated = await validateAnyPublicToken(env.SESSIONS, token);
    if (!validated) {
      return unauthorized('Invalid or expired public token');
    }
    const { tokenData, submitterEmail } = validated;

    // HIGH-2: Check submission cap — applies to all session tokens regardless of auth origin
    if (tokenData.submissions >= MAX_SUBMISSIONS_PER_TOKEN) {
      return tooManyRequests(`Submission limit reached (${MAX_SUBMISSIONS_PER_TOKEN} submissions per session)`);
    }

    const body = (await request.json()) as {
      station_id?: number;
      submitter_name?: string;
      counts?: { item_id: number; actual_count: number }[];
      notes?: string;
      attachments?: { r2_key: string; filename: string; content_type: string; size_bytes: number }[];
    };

    if (!body.station_id) {
      return badRequest('station_id is required');
    }
    if (!Array.isArray(body.counts) || body.counts.length === 0) {
      return badRequest('counts array is required and must not be empty');
    }

    // M-3: Length caps on notes and submitter_name
    if (body.notes && body.notes.length > 2000) {
      return badRequest('notes must be 2000 characters or fewer');
    }
    if (body.submitter_name && body.submitter_name.length > 100) {
      return badRequest('submitter_name must be 100 characters or fewer');
    }

    const stationId = body.station_id;

    // Validate station exists
    const station = await env.DB.prepare('SELECT id, name FROM stations WHERE id = ? AND is_active = 1')
      .bind(stationId)
      .first<{ id: number; name: string }>();
    if (!station) {
      return badRequest('Invalid station');
    }

    // Validate count entries
    for (const c of body.counts) {
      if (typeof c.item_id !== 'number' || typeof c.actual_count !== 'number') {
        return badRequest('Each count must have numeric item_id and actual_count');
      }
      if (c.actual_count < 0) {
        return badRequest('actual_count cannot be negative');
      }
      // M-4: Integer-only and upper bound validation
      if (!Number.isInteger(c.actual_count)) {
        return badRequest('actual_count must be an integer');
      }
      if (c.actual_count > 9999) {
        return badRequest('actual_count cannot exceed 9999');
      }
    }

    // H-1 + M-2: Validate and cap attachments
    const attachments = body.attachments ?? [];
    if (attachments.length > MAX_ATTACHMENTS_PER_SUBMIT) {
      return badRequest(`Too many attachments (max ${MAX_ATTACHMENTS_PER_SUBMIT})`);
    }

    // H-1: Validate each attachment against R2
    const verifiedAttachments: { r2_key: string; filename: string; content_type: string; size_bytes: number }[] = [];
    for (const att of attachments) {
      // Validate r2_key pattern
      if (!R2_KEY_PATTERN.test(att.r2_key)) {
        return badRequest(`Invalid attachment key format: ${att.r2_key}`);
      }

      // Confirm object exists in R2 and get metadata from head()
      const r2Object = await env.ATTACHMENTS.head(att.r2_key);
      if (!r2Object) {
        return badRequest(`Attachment not found in storage: ${att.r2_key}`);
      }

      // Use metadata from R2 head() response — do not trust client values
      const r2ContentType = (r2Object as unknown as { httpMetadata?: { contentType?: string } }).httpMetadata?.contentType ?? att.content_type;
      const r2SizeBytes = (r2Object as unknown as { size?: number }).size ?? att.size_bytes;

      // Validate content type from R2 metadata is allowed
      if (!ALLOWED_IMAGE_TYPES.has(r2ContentType)) {
        return badRequest(`Attachment has invalid content type: ${r2ContentType}`);
      }

      verifiedAttachments.push({
        r2_key: att.r2_key,
        filename: att.filename,
        content_type: r2ContentType,
        size_bytes: r2SizeBytes,
      });
    }

    // Get template for this station to compute shortages
    const template = await getInventoryTemplate(env.DB, stationId);
    const countMap = new Map<number, number>();
    for (const c of body.counts) {
      countMap.set(c.item_id, c.actual_count);
    }

    // Calculate shortages — only for items that were submitted
    let itemsShort = 0;
    const shortItems: { item_name: string; category: string; actual: number; target: number; need: number }[] = [];
    const submittedTemplateItems = template.filter((t) => countMap.has(t.item_id));

    for (const t of submittedTemplateItems) {
      const actual = countMap.get(t.item_id)!;
      const delta = actual - t.target_count;
      if (delta < 0) {
        itemsShort++;
        shortItems.push({
          item_name: t.item_name,
          category: t.category,
          actual,
          target: t.target_count,
          need: Math.abs(delta),
        });
      }
    }

    // Create inventory session with public flag
    // submitter_email comes from magic link auth; null for PIN-gated submissions
    const sessionResult = await env.DB
      .prepare(
        'INSERT INTO inventory_sessions (station_id, submitted_by, item_count, items_short, notes, is_public, submitter_name, submitter_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        stationId,
        body.submitter_name ?? null,
        body.counts.length,
        itemsShort,
        body.notes ?? null,
        1, // is_public
        body.submitter_name ?? null,
        submitterEmail,
      )
      .run();

    const sessionId = sessionResult.meta.last_row_id as number;

    // Insert history records for submitted items
    const historyStmt = env.DB.prepare(
      `INSERT INTO inventory_history (session_id, item_name, category, station_name, target_count, actual_count, delta, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const batch: D1PreparedStatement[] = [];
    for (const t of submittedTemplateItems) {
      const actual = countMap.get(t.item_id)!;
      const delta = actual - t.target_count;
      let status: string;
      if (delta === 0) status = 'good';
      else if (delta > 0) status = 'over';
      else status = 'short';

      batch.push(
        historyStmt.bind(sessionId, t.item_name, t.category, station.name, t.target_count, actual, delta, status),
      );
    }
    if (batch.length > 0) {
      await env.DB.batch(batch);
    }

    // Auto-generate resupply order if shortages detected
    let orderCreated = false;
    if (shortItems.length > 0) {
      const pickList = formatPickList(station.name, shortItems);
      await env.DB
        .prepare('INSERT INTO orders (session_id, station_id, items_short, pick_list, status) VALUES (?, ?, ?, ?, ?)')
        .bind(sessionId, stationId, itemsShort, pickList, 'pending')
        .run();
      orderCreated = true;
    }

    // Insert attachment records using verified R2 metadata
    if (verifiedAttachments.length > 0) {
      const attachStmt = env.DB.prepare(
        'INSERT INTO inventory_attachments (session_id, filename, r2_key, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)',
      );
      const attachBatch: D1PreparedStatement[] = [];
      for (const att of verifiedAttachments) {
        attachBatch.push(
          attachStmt.bind(sessionId, att.filename, att.r2_key, att.content_type, att.size_bytes),
        );
      }
      await env.DB.batch(attachBatch);
    }

    // HIGH-2: Increment submission counter for all session tokens
    tokenData.submissions += 1;
    await saveTokenData(env.SESSIONS, token!, tokenData);

    return ok({
      session_id: sessionId,
      items_submitted: body.counts.length,
      items_short: itemsShort,
      order_created: orderCreated,
    });
  } catch (err) {
    console.error('[handlePublicInventorySubmit]', err);
    return serverError('Failed to submit public inventory');
  }
}
