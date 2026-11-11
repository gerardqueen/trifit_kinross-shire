// TRI FIT Kinross-shire: the link between the members portal and TeamUp.
// Supabase Edge Function "tf-teamup" (Verify JWT off: the function checks the signed-in person
// itself, and everything except "status" needs a confirmed account).
//
// Until the gym adds its TeamUp token this answers { linked: false } and the portal stays in
// preview mode. To switch it on, a TeamUp Owner or Admin creates a machine-to-machine token
// (TeamUp → Settings → Integrations → API Integration → M2M Tokens → Add) and saves it as the
// secret TF_TEAMUP_TOKEN (Supabase → Edge Functions → Secrets). Never put it in the repo.
//   TF_TEAMUP_TOKEN     the M2M token (acts as the business, with admin rights)
//   TF_TEAMUP_PROVIDER  optional TeamUp business id (4996174), sent as TeamUp-Provider-ID
//   TF_TEAMUP_BASE_URL  optional, defaults to https://goteamup.com
//
// Actions (JSON body { action, ... }):
//   status  → { linked }
//   sync    → looks the member up in TeamUp by their confirmed email, stores their membership
//             on their profile, and switches a waiting account on if the membership is active
//   book    → { class_id, day }  registers them for the matching TeamUp event
//   cancel  → { booking_id }     removes that registration
//
// NOT YET TESTED AGAINST LIVE TEAMUP: there was no token to test with. The calls follow
// TeamUp's v2 documentation (docs.goteamup.com) and the adapter used for Aeternum, but the
// field names on events and memberships need checking with the first real token. Every
// failure is returned as a readable message and nothing is ever marked booked unless TeamUp
// said yes.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TOKEN = Deno.env.get('TF_TEAMUP_TOKEN') ?? '';
const PROVIDER = Deno.env.get('TF_TEAMUP_PROVIDER') ?? '';
const BASE = (Deno.env.get('TF_TEAMUP_BASE_URL') ?? 'https://goteamup.com').replace(/\/+$/, '');

async function tu(path: string, init: { method?: string; body?: unknown } = {}) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET', signal: ctl.signal,
      headers: {
        Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json',
        'TeamUp-Request-Mode': 'provider', ...(PROVIDER ? { 'TeamUp-Provider-ID': PROVIDER } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) throw new Error(`TeamUp said ${res.status}${data?.detail ? `: ${data.detail}` : ''}`);
    return data;
  } finally { clearTimeout(timer); }
}
const results = (d: any) => (Array.isArray(d) ? d : d?.results ?? []);
const norm = (e: unknown) => String(e ?? '').trim().toLowerCase();
// The clock time of an ISO timestamp in the gym's time zone, as HH:MM.
const londonTime = (isoTs: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(isoTs));
const londonDay = (isoTs: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(isoTs));

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
  let body: any = {}; try { body = await req.json(); } catch { /* empty body */ }
  const action = String(body.action ?? 'status');
  if (action === 'status') return json({ linked: !!TOKEN });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey());
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user?.email || !user.email_confirmed_at) return json({ ok: false, error: 'Please sign in first.' }, 401);
  if (!TOKEN) return json({ linked: false, ok: false, error: 'TeamUp is not linked yet.' });

  try {
    const { data: profile } = await db.from('tf_profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (!profile) return json({ ok: false, error: 'Open the members page once so your profile is created.' });

    // Find this person in TeamUp by the email they proved they own.
    const findCustomer = async () => {
      if (profile.teamup_id) return profile.teamup_id as string;
      const found = results(await tu(`/api/v2/customers?email=${encodeURIComponent(user.email!)}`)).filter((c: any) => norm(c.email) === norm(user.email));
      if (found.length !== 1) return null; // none, or a shared family email: an admin links those by hand
      await db.from('tf_profiles').update({ teamup_id: String(found[0].id) }).eq('user_id', user.id);
      return String(found[0].id);
    };

    if (action === 'sync') {
      const cid = await findCustomer();
      if (!cid) return json({ linked: true, ok: true, active: false, message: 'We could not match this email to one TeamUp customer. Use the same email as your TeamUp account, or ask the gym to link you.' });
      const ms = results(await tu(`/api/v2/customers/${cid}/memberships`));
      const live = ms.filter((m: any) => ['active', 'current'].includes(norm(m.status)) || m.active === true);
      const plan = (live[0] ?? ms[0]);
      const planName = plan?.membership_name ?? plan?.membership?.name ?? plan?.name ?? null;
      const active = live.length > 0;
      await db.from('tf_profiles').update({
        teamup_plan: planName, teamup_status: active ? 'active' : (ms.length ? norm(ms[0].status) || 'not active' : 'no membership'),
        teamup_checked_at: new Date().toISOString(), ...(active && profile.status === 'pending' ? { status: 'active' } : {}),
      }).eq('user_id', user.id);
      return json({ linked: true, ok: true, active: active || profile.status === 'active', message: active ? `Membership found: ${planName ?? 'active'}.` : 'No active TeamUp membership was found for this email.' });
    }

    if (action === 'book') {
      if (profile.status !== 'active') return json({ ok: false, error: 'Your account is not switched on yet.' });
      const day = String(body.day ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ ok: false, error: 'Missing date.' });
      const { data: cls } = await db.from('tf_classes').select('*').eq('id', body.class_id).maybeSingle();
      if (!cls) return json({ ok: false, error: 'That class is no longer on the timetable.' });
      const cid = await findCustomer();
      if (!cid) return json({ ok: false, error: 'Your account is not matched to TeamUp yet. Check your membership on the Account tab first.' });
      const events = results(await tu(`/api/v2/events?starts_at_gte=${day}T00:00:00&starts_at_lte=${day}T23:59:59`));
      const ev = events.find((e: any) => { const s = e.starts_at ?? e.start_time ?? e.start; return s && londonDay(s) === day && londonTime(s) === cls.start_time; });
      if (!ev) return json({ ok: false, error: 'We could not find that class in TeamUp for that day. Please book it in TeamUp.' });
      const reg = await tu(`/api/v2/events/${ev.id}/register`, { method: 'POST', body: { customer: Number(cid) || cid } });
      await db.from('tf_bookings').upsert({ user_id: user.id, class_id: cls.id, day, status: 'booked', teamup_ref: String(ev.id), detail: reg?.status ? String(reg.status) : null }, { onConflict: 'user_id,class_id,day' });
      return json({ ok: true });
    }

    if (action === 'cancel') {
      const { data: b } = await db.from('tf_bookings').select('*').eq('id', body.booking_id).eq('user_id', user.id).maybeSingle();
      if (!b) return json({ ok: false, error: 'Booking not found.' });
      if (b.status === 'booked' && b.teamup_ref) {
        const cid = await findCustomer();
        await tu(`/api/v2/events/${b.teamup_ref}/unregister`, { method: 'POST', body: { customer: Number(cid) || cid } });
      }
      await db.from('tf_bookings').delete().eq('id', b.id);
      return json({ ok: true });
    }
    return json({ ok: false, error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ linked: true, ok: false, error: (e as Error).message || 'TeamUp did not respond.' });
  }
});
