// Email template renderers — branded HTML + plain-text for EMS Inventory notifications
//
// Design constraints:
//   - Table-based layout (email clients do not support flexbox/grid reliably)
//   - All CSS inlined on elements; dark-mode via <style> in <head> with !important
//   - Responsive via max-width: 600px outer table and @media (max-width: 480px)
//   - Plain-text fallback alongside HTML
//   - Web-safe font stack

// ── Brand constants ──────────────────────────────────────────────────

const BRAND = {
  primary: '#163832',
  light: '#1e4d44',
  dark: '#0f2924',
  accent: '#2a7a6c',
  red: '#dc2626',
  green: '#16a34a',
  amber: '#d97706',
  logo: 'https://emsinventory.dcvfd.org/dcvfd-badge.svg',
  baseUrl: 'https://emsinventory.dcvfd.org',
  fromName: 'EMS Inventory',
  footerText: 'Dale City Volunteer Fire Department \u2014 EMS Inventory System',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// ── Data interfaces ──────────────────────────────────────────────────

export interface InventoryEmailData {
  stationName: string;
  stationCode: string;
  submittedBy: string;
  submittedAt: string;
  isPublic: boolean;
  itemsCounted: number;
  totalItems: number;
  itemsShort: number;
  items: Array<{
    name: string;
    category: string;
    target: number;
    actual: number;
    delta: number;
    status: 'good' | 'short' | 'over';
  }>;
  order?: {
    id: number;
    pickList: Array<{ name: string; quantity: number }>;
  };
  notes?: string;
  attachmentCount: number;
}

export interface OrderFulfilledEmailData {
  stationName: string;
  stationCode: string;
  orderCreatedAt: string;
  fulfilledAt: string;
  fulfilledBy: string;
  pickList: Array<{ name: string; quantity: number }>;
}

// ── Shared HTML partials ─────────────────────────────────────────────

/** Shared <head> block with dark-mode and responsive media queries */
function htmlHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>${escHtml(title)}</title>
  <style>
    /* Dark mode overrides */
    @media (prefers-color-scheme: dark) {
      body { background-color: #111827 !important; }
      .email-wrapper { background-color: #111827 !important; }
      .email-card { background-color: #1f2937 !important; border-color: #374151 !important; }
      .email-header { background-color: ${BRAND.dark} !important; }
      .summary-card { background-color: #111827 !important; border-color: #374151 !important; }
      .summary-label { color: #9ca3af !important; }
      .summary-value { color: #f9fafb !important; }
      .body-text { color: #d1d5db !important; }
      .section-heading { color: #f9fafb !important; }
      .notes-box { background-color: #1e3a5f !important; border-color: #3b82f6 !important; color: #bfdbfe !important; }
      .table-header { background-color: #374151 !important; color: #f9fafb !important; }
      .table-row-even { background-color: #1f2937 !important; }
      .table-row-odd { background-color: #111827 !important; }
      .table-cell { color: #d1d5db !important; border-color: #374151 !important; }
      .picklist-row { background-color: #1f2937 !important; }
      .picklist-cell { color: #d1d5db !important; border-color: #374151 !important; }
      .footer-text { color: #6b7280 !important; }
      .cta-btn { background-color: ${BRAND.accent} !important; }
    }
    /* Mobile */
    @media (max-width: 480px) {
      .email-card { padding: 16px !important; }
      .summary-grid td { display: block !important; width: 100% !important; padding: 4px 0 !important; }
      .inv-table th, .inv-table td { padding: 6px 4px !important; font-size: 12px !important; }
    }
  </style>
</head>
<body class="email-wrapper" style="margin:0;padding:0;background-color:#f3f4f6;font-family:${FONT};">
<table class="email-wrapper" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 8px;">
  <tr>
    <td align="center">
      <table class="email-card" role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">`;
}

function htmlFoot(): string {
  return `      </table>
      <!-- Footer -->
      <table role="presentation" width="100%" style="max-width:600px;margin-top:16px;">
        <tr>
          <td align="center" style="padding:16px 0;">
            <p class="footer-text" style="margin:0 0 4px;font-size:12px;color:#6b7280;font-family:${FONT};">
              ${BRAND.footerText}
            </p>
            <p class="footer-text" style="margin:0;font-size:12px;color:#6b7280;font-family:${FONT};">
              <a href="${BRAND.baseUrl}" style="color:#6b7280;text-decoration:underline;">${BRAND.baseUrl}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function emailHeader(subtitle: string): string {
  return `
        <!-- Header -->
        <tr>
          <td class="email-header" style="background-color:${BRAND.primary};padding:24px 32px;text-align:center;">
            <img src="${BRAND.logo}" alt="DCVFD Badge" width="64" height="64" style="display:block;margin:0 auto 12px;border:0;">
            <p style="margin:0;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#a7f3d0;font-family:${FONT};">Dale City Volunteer Fire Department</p>
            <h1 style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ffffff;font-family:${FONT};">${escHtml(subtitle)}</h1>
          </td>
        </tr>`;
}

function ctaButton(label: string, url: string): string {
  return `
        <!-- CTA -->
        <tr>
          <td style="padding:24px 32px;text-align:center;">
            <a class="cta-btn" href="${url}" style="display:inline-block;background-color:${BRAND.primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:6px;font-family:${FONT};">
              ${escHtml(label)}
            </a>
          </td>
        </tr>`;
}

// ── Utility functions ────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusColor(status: 'good' | 'short' | 'over'): string {
  if (status === 'short') return BRAND.red;
  if (status === 'over') return BRAND.amber;
  return BRAND.green;
}

function statusLabel(status: 'good' | 'short' | 'over'): string {
  if (status === 'short') return 'Short';
  if (status === 'over') return 'Over';
  return 'Good';
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    });
  } catch {
    return iso;
  }
}

/** Group items by category, preserving order within each group */
function groupByCategory<T extends { category: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const group = map.get(item.category) ?? [];
    group.push(item);
    map.set(item.category, group);
  }
  return map;
}

// ── Email 1: New Inventory Submitted ────────────────────────────────

export function renderInventoryEmail(data: InventoryEmailData): {
  html: string;
  text: string;
  subject: string;
} {
  const subject = `New EMS Inventory \u2014 ${data.stationCode}`;
  const shortageColor = data.itemsShort > 0 ? BRAND.red : BRAND.green;

  // Filter to only counted items (skip not_entered — none should exist per spec,
  // but defensively exclude anything that slipped through)
  const countedItems = data.items;

  // Group by category for the inventory table
  const byCategory = groupByCategory(countedItems);

  // Build inventory table rows
  let tableRows = '';
  let rowIdx = 0;
  for (const [category, items] of byCategory) {
    // Category subheader
    tableRows += `
                  <tr>
                    <td colspan="5" style="background-color:#f9fafb;padding:6px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#374151;border-bottom:1px solid #e5e7eb;" class="table-header">
                      ${escHtml(category)}
                    </td>
                  </tr>`;
    for (const item of items) {
      const rowClass = rowIdx % 2 === 0 ? 'table-row-even' : 'table-row-odd';
      const rowBg = rowIdx % 2 === 0 ? '#ffffff' : '#f9fafb';
      const color = statusColor(item.status);
      const deltaStr = item.delta > 0 ? `+${item.delta}` : String(item.delta);
      tableRows += `
                  <tr class="${rowClass}" style="background-color:${rowBg};">
                    <td class="table-cell" style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;font-family:${FONT};">${escHtml(item.name)}</td>
                    <td class="table-cell" style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;text-align:center;font-family:${FONT};">${item.target}</td>
                    <td class="table-cell" style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;text-align:center;font-family:${FONT};">${item.actual}</td>
                    <td class="table-cell" style="padding:8px 12px;font-size:13px;color:${color};border-bottom:1px solid #f3f4f6;text-align:center;font-weight:600;font-family:${FONT};">${deltaStr}</td>
                    <td class="table-cell" style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f3f4f6;text-align:center;font-family:${FONT};">
                      <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background-color:${color}22;color:${color};">
                        ${escHtml(statusLabel(item.status))}
                      </span>
                    </td>
                  </tr>`;
      rowIdx++;
    }
  }

  // Resupply order section
  let orderSection = '';
  if (data.order) {
    let pickRows = '';
    data.order.pickList.forEach((line, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
      pickRows += `
                  <tr class="picklist-row" style="background-color:${bg};">
                    <td class="picklist-cell" style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;font-family:${FONT};">${escHtml(line.name)}</td>
                    <td class="picklist-cell" style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:600;font-family:${FONT};">${line.quantity}</td>
                  </tr>`;
    });

    orderSection = `
        <!-- Resupply Order -->
        <tr>
          <td style="padding:0 32px 24px;">
            <p class="section-heading" style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;font-family:${FONT};">Resupply Order Created</p>
            <table role="presentation" class="inv-table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
              <thead>
                <tr>
                  <th class="table-header" style="background-color:#f3f4f6;padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${FONT};">Item</th>
                  <th class="table-header" style="background-color:#f3f4f6;padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${FONT};">Qty Needed</th>
                </tr>
              </thead>
              <tbody>${pickRows}
              </tbody>
            </table>
          </td>
        </tr>`;
  }

  // Notes section
  let notesSection = '';
  if (data.notes) {
    notesSection = `
        <!-- Notes -->
        <tr>
          <td style="padding:0 32px 24px;">
            <p class="section-heading" style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;font-family:${FONT};">Notes</p>
            <div class="notes-box" style="background-color:#eff6ff;border-left:4px solid #3b82f6;padding:12px 16px;border-radius:4px;">
              <p style="margin:0;font-size:13px;color:#1e40af;font-family:${FONT};white-space:pre-wrap;">${escHtml(data.notes)}</p>
            </div>
          </td>
        </tr>`;
  }

  // Attachments line
  let attachmentNote = '';
  if (data.attachmentCount > 0) {
    const plural = data.attachmentCount === 1 ? 'photo' : 'photos';
    attachmentNote = `
        <!-- Attachments -->
        <tr>
          <td style="padding:0 32px 24px;">
            <p class="body-text" style="margin:0;font-size:13px;color:#6b7280;font-family:${FONT};">
              <strong>${data.attachmentCount} ${plural} attached</strong> \u2014 view in dashboard
            </p>
          </td>
        </tr>`;
  }

  const html = `${htmlHead(subject)}
${emailHeader('New Inventory Submitted')}
        <!-- Summary card -->
        <tr>
          <td style="padding:24px 32px 0;">
            <table class="summary-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;">
              <tr>
                <td style="padding:0 0 12px;">
                  <table class="summary-grid" role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 16px 4px 0;width:50%;vertical-align:top;">
                        <p class="summary-label" style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-family:${FONT};">Station</p>
                        <p class="summary-value" style="margin:0;font-size:14px;font-weight:600;color:#111827;font-family:${FONT};">${escHtml(data.stationName)}</p>
                      </td>
                      <td style="padding:4px 0;width:50%;vertical-align:top;">
                        <p class="summary-label" style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-family:${FONT};">Date &amp; Time</p>
                        <p class="summary-value" style="margin:0;font-size:14px;font-weight:600;color:#111827;font-family:${FONT};">${escHtml(formatDateTime(data.submittedAt))}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 16px 0 0;width:50%;vertical-align:top;">
                        <p class="summary-label" style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-family:${FONT};">Submitted By</p>
                        <p class="summary-value" style="margin:0;font-size:14px;font-weight:600;color:#111827;font-family:${FONT};">${data.isPublic ? 'Public Submission' : escHtml(data.submittedBy)}</p>
                      </td>
                      <td style="padding:8px 0 0;width:50%;vertical-align:top;">
                        <p class="summary-label" style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-family:${FONT};">Items Counted</p>
                        <p class="summary-value" style="margin:0;font-size:14px;font-weight:600;color:#111827;font-family:${FONT};">${data.itemsCounted} / ${data.totalItems}</p>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding:8px 0 0;vertical-align:top;">
                        <p class="summary-label" style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-family:${FONT};">Items Short</p>
                        <p style="margin:0;font-size:18px;font-weight:700;color:${shortageColor};font-family:${FONT};">${data.itemsShort}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Inventory Table -->
        <tr>
          <td style="padding:24px 32px 16px;">
            <p class="section-heading" style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;font-family:${FONT};">Inventory Detail</p>
            <table role="presentation" class="inv-table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
              <thead>
                <tr>
                  <th class="table-header" style="background-color:#f3f4f6;padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${FONT};">Item</th>
                  <th class="table-header" style="background-color:#f3f4f6;padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${FONT};">Target</th>
                  <th class="table-header" style="background-color:#f3f4f6;padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${FONT};">Actual</th>
                  <th class="table-header" style="background-color:#f3f4f6;padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${FONT};">Delta</th>
                  <th class="table-header" style="background-color:#f3f4f6;padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${FONT};">Status</th>
                </tr>
              </thead>
              <tbody>${tableRows}
              </tbody>
            </table>
          </td>
        </tr>
${orderSection}
${notesSection}
${attachmentNote}
${ctaButton('View in Dashboard', `${BRAND.baseUrl}/inventories`)}
${htmlFoot()}`;

  // ── Plain text ─────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push(`NEW EMS INVENTORY — ${data.stationCode}`);
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Station:       ${data.stationName}`);
  lines.push(`Date/Time:     ${formatDateTime(data.submittedAt)}`);
  lines.push(`Submitted By:  ${data.isPublic ? 'Public Submission' : data.submittedBy}`);
  lines.push(`Items Counted: ${data.itemsCounted} / ${data.totalItems}`);
  lines.push(`Items Short:   ${data.itemsShort}`);
  lines.push('');

  for (const [category, items] of byCategory) {
    lines.push(category.toUpperCase());
    lines.push('-'.repeat(30));
    for (const item of items) {
      const deltaStr = item.delta > 0 ? `+${item.delta}` : String(item.delta);
      lines.push(`  ${item.name}: target ${item.target}, actual ${item.actual}, delta ${deltaStr} [${statusLabel(item.status)}]`);
    }
    lines.push('');
  }

  if (data.order) {
    lines.push('RESUPPLY ORDER CREATED');
    lines.push('-'.repeat(30));
    for (const line of data.order.pickList) {
      lines.push(`  ${line.name}: ${line.quantity} needed`);
    }
    lines.push('');
  }

  if (data.notes) {
    lines.push('NOTES');
    lines.push('-'.repeat(30));
    lines.push(data.notes);
    lines.push('');
  }

  if (data.attachmentCount > 0) {
    const plural = data.attachmentCount === 1 ? 'photo' : 'photos';
    lines.push(`${data.attachmentCount} ${plural} attached — view in dashboard`);
    lines.push('');
  }

  lines.push(`View in Dashboard: ${BRAND.baseUrl}/inventories`);
  lines.push('');
  lines.push(BRAND.footerText);
  lines.push(BRAND.baseUrl);

  return { html, text: lines.join('\n'), subject };
}

// ── Email 2: Order Fulfilled ─────────────────────────────────────────

export function renderOrderFulfilledEmail(data: OrderFulfilledEmailData): {
  html: string;
  text: string;
  subject: string;
} {
  const subject = `Order Fulfilled \u2014 ${data.stationCode}`;

  let pickRows = '';
  data.pickList.forEach((line, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
    pickRows += `
                  <tr class="picklist-row" style="background-color:${bg};">
                    <td class="picklist-cell" style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;font-family:${FONT};">${escHtml(line.name)}</td>
                    <td class="picklist-cell" style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:600;font-family:${FONT};">${line.quantity}</td>
                  </tr>`;
  });

  const html = `${htmlHead(subject)}
${emailHeader('Resupply Order Fulfilled')}
        <!-- Summary card -->
        <tr>
          <td style="padding:24px 32px 0;">
            <table class="summary-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;">
              <tr>
                <td>
                  <table class="summary-grid" role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 16px 4px 0;width:50%;vertical-align:top;">
                        <p class="summary-label" style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-family:${FONT};">Station</p>
                        <p class="summary-value" style="margin:0;font-size:14px;font-weight:600;color:#111827;font-family:${FONT};">${escHtml(data.stationName)}</p>
                      </td>
                      <td style="padding:4px 0;width:50%;vertical-align:top;">
                        <p class="summary-label" style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-family:${FONT};">Order Created</p>
                        <p class="summary-value" style="margin:0;font-size:14px;font-weight:600;color:#111827;font-family:${FONT};">${escHtml(formatDateTime(data.orderCreatedAt))}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 16px 0 0;width:50%;vertical-align:top;">
                        <p class="summary-label" style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-family:${FONT};">Fulfilled</p>
                        <p class="summary-value" style="margin:0;font-size:14px;font-weight:600;color:${BRAND.green};font-family:${FONT};">${escHtml(formatDateTime(data.fulfilledAt))}</p>
                      </td>
                      <td style="padding:8px 0 0;width:50%;vertical-align:top;">
                        <p class="summary-label" style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-family:${FONT};">Fulfilled By</p>
                        <p class="summary-value" style="margin:0;font-size:14px;font-weight:600;color:#111827;font-family:${FONT};">${escHtml(data.fulfilledBy)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Pick list -->
        <tr>
          <td style="padding:24px 32px 8px;">
            <p class="section-heading" style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;font-family:${FONT};">Items Fulfilled</p>
            <table role="presentation" class="inv-table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
              <thead>
                <tr>
                  <th class="table-header" style="background-color:#f3f4f6;padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${FONT};">Item</th>
                  <th class="table-header" style="background-color:#f3f4f6;padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${FONT};">Qty Fulfilled</th>
                </tr>
              </thead>
              <tbody>${pickRows}
              </tbody>
            </table>
          </td>
        </tr>
${ctaButton('View Orders', `${BRAND.baseUrl}/orders`)}
${htmlFoot()}`;

  // ── Plain text ─────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push(`ORDER FULFILLED — ${data.stationCode}`);
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Station:       ${data.stationName}`);
  lines.push(`Order Created: ${formatDateTime(data.orderCreatedAt)}`);
  lines.push(`Fulfilled:     ${formatDateTime(data.fulfilledAt)}`);
  lines.push(`Fulfilled By:  ${data.fulfilledBy}`);
  lines.push('');
  lines.push('ITEMS FULFILLED');
  lines.push('-'.repeat(30));
  for (const line of data.pickList) {
    lines.push(`  ${line.name}: ${line.quantity}`);
  }
  lines.push('');
  lines.push(`View Orders: ${BRAND.baseUrl}/orders`);
  lines.push('');
  lines.push(BRAND.footerText);
  lines.push(BRAND.baseUrl);

  return { html, text: lines.join('\n'), subject };
}
