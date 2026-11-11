// TRI FIT Kinross-shire: email alert for new enquiries from the website form.
// Supabase Edge Function "tf-enquiry-alert" (Verify JWT off: it takes no input and only ever
// emails enquiries that are already in the database and not yet sent).
//
// Where it sends: the "Contact email" set on the admin page (Site details).
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY – already set if another site in this project uses Resend
//   TF_ALERT_TO    – safety-net inbox (required). Resend's test sender only delivers to the
//                    Resend account owner, so until a sending domain is verified, enquiries the
//                    gym's address can't receive arrive here instead, flagged for forwarding.
//   TF_ALERT_FROM  – optional, e.g. "TRI FIT website <enquiries@yourdomain>" once a domain is verified
//   TF_SITE_URL    – optional, for the link to the admin page
// It deliberately never falls back to another site's ALERT_TO, so these can't go to the wrong business.
//
// It ignores what it is sent and only emails enquiries that haven't been emailed yet, so
// calling it can never send anything other than a real, unsent enquiry.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const list = (v?: string | null) => (v ?? '').split(',').map((s) => s.trim()).filter((s) => /^\S+@\S+\.\S+$/.test(s));

// The key this function uses to read and write the database. Newer Supabase projects supply it
// as SUPABASE_SECRET_KEYS (a JSON list); older ones as SUPABASE_SERVICE_ROLE_KEY.
function serviceKey(): string {
  const direct = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (direct) return direct;
  try {
    const v = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? 'null');
    const flat = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];
    for (const x of flat) {
      const s = typeof x === 'string' ? x : (x as any)?.api_key ?? (x as any)?.key ?? (x as any)?.value;
      if (typeof s === 'string' && s) return s;
    }
  } catch { /* not JSON */ }
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const key = Deno.env.get('RESEND_API_KEY') ?? Deno.env.get('Resend_API_Key') ?? Deno.env.get('RESEND_API_key');
  const fallback = list(Deno.env.get('TF_ALERT_TO'));
  if (!key || !fallback.length || !serviceKey()) return json({ ok: false, reason: 'Not set up yet', resendKey: !!key, alertTo: fallback.length > 0, databaseKey: !!serviceKey() });

  const from = Deno.env.get('TF_ALERT_FROM') ?? 'TRI FIT website <onboarding@resend.dev>';
  const site = Deno.env.get('TF_SITE_URL') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey());

  // The gym's contact email, as set on the admin page.
  const { data: content } = await db.from('tf_content').select('value').eq('key', 'settings').maybeSingle();
  const contact = list(content?.value?.contact_email);
  const to = contact.length ? contact : fallback;

  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data: rows, error } = await db.from('tf_enquiries').select('*')
    .is('notified_at', null).gte('created_at', since).order('created_at').limit(20);
  if (error) return json({ ok: false, error: error.message }, 500);

  const sent: string[] = [], failed: string[] = [];
  for (const e of rows ?? []) {
    // Claim it first, so two calls at once can't both send it.
    const { data: claimed } = await db.from('tf_enquiries').update({ notified_at: new Date().toISOString() })
      .eq('id', e.id).is('notified_at', null).select('id');
    if (!claimed?.length) continue;

    const subject = `Website enquiry: ${e.name}${e.interest ? ` (${e.interest})` : ''}`;
    const rowsHtml = [
      ['Name', esc(e.name)],
      ['Email', `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>`],
      ['Phone', e.phone ? `<a href="tel:${esc(e.phone)}">${esc(e.phone)}</a>` : '—'],
      ['Interested in', esc(e.interest ?? '—')],
      ['Message', e.message ? esc(e.message).replace(/\n/g, '<br>') : '—'],
    ].map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 0">${v}</td></tr>`).join('');
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px">
      <h2 style="color:#111;margin:0 0 12px">New enquiry from the TRI FIT website</h2>
      <table style="border-collapse:collapse">${rowsHtml}</table>
      <p style="margin-top:18px">Reply to this email to answer them directly${site ? `, or <a href="${esc(site)}admin.html">open the admin page</a> to mark it done` : ''}.</p></div>`;
    const text = `New enquiry from the TRI FIT website\n\nName: ${e.name}\nEmail: ${e.email}\nPhone: ${e.phone ?? '-'}\n` +
      `Interested in: ${e.interest ?? '-'}\nMessage: ${e.message ?? '-'}\n` + (site ? `\nAdmin page: ${site}admin.html` : '');

    const send = (rcpt: string[], subj: string, h: string, t: string) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: rcpt, reply_to: e.email, subject: subj, html: h, text: t }),
    });
    let res = await send(to, subject, html, text);
    // Safety net: if Resend refuses the gym's address (no verified sending domain yet), the
    // enquiry still reaches the fallback inbox, flagged, instead of being lost.
    const isFallback = to.length === fallback.length && to.every((x) => fallback.includes(x));
    if (!res.ok && !isFallback && res.status < 500) {
      const why = `${res.status} ${(await res.text()).slice(0, 300)}`;
      const note = `NOT DELIVERED to ${to.join(', ')} (Resend said: ${why}). Please forward it to the gym.`;
      res = await send(fallback, `[Not delivered to gym] ${subject}`,
        `<p style="font-family:Arial,sans-serif;background:#fff4d6;border:1px solid #e6c65c;padding:10px 12px;border-radius:4px">${esc(note)}</p>${html}`,
        `${note}\n\n${text}`);
    }
    if (res.ok) sent.push(e.id);
    else {
      failed.push(`${e.id}: ${res.status} ${await res.text()}`);
      await db.from('tf_enquiries').update({ notified_at: null }).eq('id', e.id);
    }
  }
  return json({ ok: failed.length === 0, sent: sent.length, failed });
});
