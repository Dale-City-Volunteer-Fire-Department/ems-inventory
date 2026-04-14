// Email sender — wraps Resend API

import type { Env } from '../types';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM = 'EMS Inventory <emsinventory@dcvfd.org>';

export async function sendEmail(
  env: Env,
  params: {
    to: string | string[];
    subject: string;
    html: string;
    text: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const body = {
      from: FROM,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    };

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[sendEmail] Resend API error', res.status, errorText);
      return { success: false, error: `Resend ${res.status}: ${errorText}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sendEmail] Unexpected error', message);
    return { success: false, error: message };
  }
}
