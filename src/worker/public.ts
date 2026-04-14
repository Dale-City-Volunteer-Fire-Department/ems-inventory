// Public inventory submission handlers — PIN-gated, no session auth required

import type { Env } from './types';
import { checkPinRateLimit } from './auth/pin';
import { getInventoryTemplate, formatPickList } from './lib/db';
import { ok, badRequest, unauthorized, serverError, tooManyRequests } from './lib/response';

// ── Token helpers ───────────────────────────────────────────────────

const PUBLIC_TOKEN_TTL = 2 * 60 * 60; // 2 hours in seconds

function publicTokenKey(token: string): string {
  return `public:${token}`;
}

async function generatePublicToken(kv: KVNamespace): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await kv.put(publicTokenKey(token), '1', { expirationTtl: PUBLIC_TOKEN_TTL });
  return token;
}

async function validatePublicToken(kv: KVNamespace, token: string | null): Promise<boolean> {
  if (!token) return false;
  const val = await kv.get(publicTokenKey(token), 'text');
  return val !== null;
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

// ── Handlers ────────────────────────────────────────────────────────

/**
 * POST /api/public/verify-pin
 * Body: { pin: string }
 * Returns: { success: true, token: string }
 */
export async function handlePublicVerifyPin(request: Request, env: Env): Promise<Response> {
  try {
    // Rate limit by IP
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
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
    if (!(await validatePublicToken(env.SESSIONS, token))) {
      return unauthorized('Invalid or expired public token');
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

    // Generate a unique key for the upload
    const uuid = crypto.randomUUID();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const r2Key = `attachments/${uuid}/${sanitizedFilename}`;

    // Upload to R2
    await env.ATTACHMENTS.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalFilename: file.name },
    });

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
 * POST /api/public/inventory/submit
 * Header: X-Public-Token
 * Body: { station_id, submitter_name?, counts, notes?, attachments? }
 * Returns: { session_id, items_submitted, items_short, order_created }
 */
export async function handlePublicInventorySubmit(request: Request, env: Env): Promise<Response> {
  try {
    const token = request.headers.get('X-Public-Token');
    if (!(await validatePublicToken(env.SESSIONS, token))) {
      return unauthorized('Invalid or expired public token');
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
    const sessionResult = await env.DB
      .prepare(
        'INSERT INTO inventory_sessions (station_id, submitted_by, item_count, items_short, notes, is_public, submitter_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        stationId,
        body.submitter_name ?? null,
        body.counts.length,
        itemsShort,
        body.notes ?? null,
        1, // is_public
        body.submitter_name ?? null,
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

    // Insert attachment records
    if (body.attachments && body.attachments.length > 0) {
      const attachStmt = env.DB.prepare(
        'INSERT INTO inventory_attachments (session_id, filename, r2_key, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)',
      );
      const attachBatch: D1PreparedStatement[] = [];
      for (const att of body.attachments) {
        attachBatch.push(
          attachStmt.bind(sessionId, att.filename, att.r2_key, att.content_type, att.size_bytes),
        );
      }
      await env.DB.batch(attachBatch);
    }

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
