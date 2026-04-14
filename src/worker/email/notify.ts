// High-level email notification dispatchers for inventory + order events

import type { Env } from '../types';
import { sendEmail } from './send';
import { renderInventoryEmail, renderOrderFulfilledEmail } from './templates';
import type { InventoryEmailData, OrderFulfilledEmailData } from './templates';

const EQUIPMENT_EMAIL = 'equipment@dcvfd.org';

// ── Station officer distros ──────────────────────────────────────────

const STATION_OFFICER_EMAILS: Record<number, string> = {
  10: 'FS10Officers@dcvfd.org',
  13: 'FS13Officers@dcvfd.org',
  18: 'FS18Officers@dcvfd.org',
  20: 'FS20Officers@dcvfd.org',
};

// ── Recipient resolution ─────────────────────────────────────────────

/**
 * Look up a user's email given their display name.
 * Only returns an email if the user exists, uses Entra SSO, and has an email address.
 * Returns null if not found or not eligible.
 */
async function findSubmitterEmail(
  env: Env,
  submitterName: string | null,
): Promise<string | null> {
  if (!submitterName) return null;

  const row = await env.DB.prepare(
    `SELECT email FROM users WHERE name = ? AND auth_method = 'entra_sso' AND email IS NOT NULL AND is_active = 1 LIMIT 1`,
  )
    .bind(submitterName)
    .first<{ email: string }>();

  return row?.email ?? null;
}

/**
 * Build the recipient list for a session.
 * Always includes equipment@dcvfd.org.
 * Always includes the station's officer group email (FS##Officers@dcvfd.org).
 * Also includes:
 *   - The submitter's Entra SSO email if they are an authenticated member (non-public)
 *   - The magic link submitter's email if they authenticated via magic link (public)
 */
async function buildInventoryRecipients(
  env: Env,
  submitterName: string | null,
  isPublic: boolean,
  stationId: number,
  submitterEmail?: string | null,
): Promise<string[]> {
  const recipients: string[] = [EQUIPMENT_EMAIL];

  // Add station officer distro
  const officerEmail = STATION_OFFICER_EMAILS[stationId];
  if (officerEmail && !recipients.includes(officerEmail)) {
    recipients.push(officerEmail);
  }

  if (isPublic) {
    // For magic link authenticated public submissions, CC the submitter
    if (submitterEmail && !recipients.includes(submitterEmail)) {
      recipients.push(submitterEmail);
    }
    return recipients;
  }

  // Authenticated (Entra SSO) submission — look up submitter by name
  const entraEmail = await findSubmitterEmail(env, submitterName);
  if (entraEmail && !recipients.includes(entraEmail)) {
    recipients.push(entraEmail);
  }

  return recipients;
}

// ── Email 1: Inventory Submitted ─────────────────────────────────────

/**
 * notifyInventorySubmitted — queries D1 for full session data and sends
 * a branded notification to the equipment alias and (optionally) the submitter.
 *
 * Silently logs errors — never throws, so ctx.waitUntil() stays safe.
 */
export async function notifyInventorySubmitted(env: Env, sessionId: number): Promise<void> {
  try {
    // ── 1. Session + station ─────────────────────────────────────────
    const sessionRow = await env.DB.prepare(
      `SELECT s.id, s.station_id, s.submitted_by, s.submitted_at,
              s.item_count, s.items_short, s.notes, s.is_public, s.submitter_name, s.submitter_email,
              st.name AS station_name, st.code AS station_code
       FROM inventory_sessions s
       JOIN stations st ON st.id = s.station_id
       WHERE s.id = ?`,
    )
      .bind(sessionId)
      .first<{
        id: number;
        station_id: number;
        submitted_by: string | null;
        submitted_at: string;
        item_count: number;
        items_short: number;
        notes: string | null;
        is_public: number;
        submitter_name: string | null;
        submitter_email: string | null;
        station_name: string;
        station_code: string;
      }>();

    if (!sessionRow) {
      console.error(`[notifyInventorySubmitted] Session ${sessionId} not found`);
      return;
    }

    const isPublic = sessionRow.is_public === 1;

    // ── 2. Inventory history ─────────────────────────────────────────
    const historyRows = await env.DB.prepare(
      `SELECT item_name, category, target_count, actual_count, delta, status
       FROM inventory_history
       WHERE session_id = ?
       ORDER BY category, item_name`,
    )
      .bind(sessionId)
      .all<{
        item_name: string;
        category: string;
        target_count: number;
        actual_count: number;
        delta: number;
        status: string;
      }>();

    const items: InventoryEmailData['items'] = historyRows.results.map((r) => ({
      name: r.item_name,
      category: r.category,
      target: r.target_count,
      actual: r.actual_count,
      delta: r.delta,
      status: r.status as 'good' | 'short' | 'over',
    }));

    // ── 3. Order (if any) ────────────────────────────────────────────
    let order: InventoryEmailData['order'];
    const orderRow = await env.DB.prepare(
      `SELECT id FROM orders WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
    )
      .bind(sessionId)
      .first<{ id: number }>();

    if (orderRow) {
      // Build pick list from inventory_history shortages — structured, not parsed text
      const shortRows = await env.DB.prepare(
        `SELECT item_name, delta FROM inventory_history
         WHERE session_id = ? AND status = 'short'
         ORDER BY category, item_name`,
      )
        .bind(sessionId)
        .all<{ item_name: string; delta: number }>();

      order = {
        id: orderRow.id,
        pickList: shortRows.results.map((r) => ({
          name: r.item_name,
          quantity: Math.abs(r.delta),
        })),
      };
    }

    // ── 4. Attachments ───────────────────────────────────────────────
    const attachRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM inventory_attachments WHERE session_id = ?`,
    )
      .bind(sessionId)
      .first<{ cnt: number }>();

    const attachmentCount = attachRow?.cnt ?? 0;

    // ── 5. Total active items for this station ───────────────────────
    const totalRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM stock_targets st
       JOIN items i ON i.id = st.item_id
       WHERE st.station_id = ? AND i.is_active = 1`,
    )
      .bind(sessionRow.station_id)
      .first<{ cnt: number }>();
    const totalItems = totalRow?.cnt ?? sessionRow.item_count;

    // ── 6. Resolve submitter display name ────────────────────────────
    // For public submissions, submitter_name holds the free-text name they entered.
    // For authenticated submissions, submitted_by holds the user's account name.
    const displayName = isPublic
      ? (sessionRow.submitter_name ?? 'Anonymous')
      : (sessionRow.submitted_by ?? 'Unknown');

    // ── 7. Render email ──────────────────────────────────────────────
    const data: InventoryEmailData = {
      stationName: sessionRow.station_name,
      stationCode: sessionRow.station_code,
      submittedBy: displayName,
      submittedAt: sessionRow.submitted_at,
      isPublic,
      itemsCounted: sessionRow.item_count,
      totalItems,
      itemsShort: sessionRow.items_short,
      items,
      order,
      notes: sessionRow.notes ?? undefined,
      attachmentCount,
    };

    const { html, text, subject } = renderInventoryEmail(data);

    // ── 8. Build recipients + send ───────────────────────────────────
    const to = await buildInventoryRecipients(
      env,
      sessionRow.submitted_by,
      isPublic,
      sessionRow.station_id,
      sessionRow.submitter_email,
    );
    const result = await sendEmail(env, { to, subject, html, text });

    if (!result.success) {
      console.error(`[notifyInventorySubmitted] Send failed: ${result.error}`);
    }
  } catch (err) {
    console.error('[notifyInventorySubmitted] Unexpected error:', err);
  }
}

// ── Email 2: Order Fulfilled ─────────────────────────────────────────

/**
 * notifyOrderFulfilled — queries D1 for the order + originating session and
 * sends a branded fulfillment notification.
 *
 * Silently logs errors — never throws.
 */
export async function notifyOrderFulfilled(env: Env, orderId: number): Promise<void> {
  try {
    // ── 1. Order + session + station ────────────────────────────────
    const orderRow = await env.DB.prepare(
      `SELECT o.id, o.session_id, o.station_id, o.items_short, o.created_at, o.filled_at, o.filled_by,
              s.submitted_by, s.is_public, s.submitter_name,
              st.name AS station_name, st.code AS station_code
       FROM orders o
       JOIN inventory_sessions s ON s.id = o.session_id
       JOIN stations st ON st.id = o.station_id
       WHERE o.id = ?`,
    )
      .bind(orderId)
      .first<{
        id: number;
        session_id: number;
        station_id: number;
        items_short: number;
        created_at: string;
        filled_at: string | null;
        filled_by: string | null;
        submitted_by: string | null;
        is_public: number;
        submitter_name: string | null;
        station_name: string;
        station_code: string;
      }>();

    if (!orderRow) {
      console.error(`[notifyOrderFulfilled] Order ${orderId} not found`);
      return;
    }

    const isPublic = orderRow.is_public === 1;

    // ── 2. Build pick list from inventory_history ────────────────────
    const shortRows = await env.DB.prepare(
      `SELECT item_name, delta FROM inventory_history
       WHERE session_id = ? AND status = 'short'
       ORDER BY category, item_name`,
    )
      .bind(orderRow.session_id)
      .all<{ item_name: string; delta: number }>();

    const pickList: OrderFulfilledEmailData['pickList'] = shortRows.results.map((r) => ({
      name: r.item_name,
      quantity: Math.abs(r.delta),
    }));

    // ── 3. Render email ──────────────────────────────────────────────
    const data: OrderFulfilledEmailData = {
      stationName: orderRow.station_name,
      stationCode: orderRow.station_code,
      orderCreatedAt: orderRow.created_at,
      fulfilledAt: orderRow.filled_at ?? new Date().toISOString(),
      fulfilledBy: orderRow.filled_by ?? 'Unknown',
      pickList,
    };

    const { html, text, subject } = renderOrderFulfilledEmail(data);

    // ── 4. Recipients ────────────────────────────────────────────────
    const to: string[] = [EQUIPMENT_EMAIL];

    // Add station officer distro
    const officerEmail = STATION_OFFICER_EMAILS[orderRow.station_id];
    if (officerEmail && !to.includes(officerEmail)) {
      to.push(officerEmail);
    }

    if (!isPublic) {
      const submitterEmail = await findSubmitterEmail(env, orderRow.submitted_by);
      if (submitterEmail && !to.includes(submitterEmail)) {
        to.push(submitterEmail);
      }
    }

    const result = await sendEmail(env, { to, subject, html, text });

    if (!result.success) {
      console.error(`[notifyOrderFulfilled] Send failed: ${result.error}`);
    }
  } catch (err) {
    console.error('[notifyOrderFulfilled] Unexpected error:', err);
  }
}
