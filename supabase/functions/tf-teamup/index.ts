// TRI FIT Kinross-shire: the link between the members app and TeamUp.
// Supabase Edge Function "tf-teamup" (Verify JWT on: only signed-in people can call it).
//
// Until the gym adds its TeamUp token this answers { linked: false } and the app shows the
// website timetable with preview bookings. To switch it on, a TeamUp Owner or Admin creates a
// machine-to-machine token (TeamUp → Settings → Integrations → API Integration → Options →
// View and Update Applications → M2M Tokens → Add) and saves it as the secret TF_TEAMUP_TOKEN
// (Supabase → Edge Functions → Secrets). Never put it in the repo.
//   TF_TEAMUP_TOKEN     the M2M token (opaque, no dots; acts as the business with admin rights)
//   TF_TEAMUP_PROVIDER  optional TeamUp business id (4996174), sent as TeamUp-Provider-ID
//   TF_TEAMUP_BASE_URL  optional, defaults to https://goteamup.com
//
// Actions (JSON body { action, ... }):
//   status     → { linked }
//   sync       → finds the member in TeamUp by their confirmed email, stores their membership,
//                and switches a waiting account on if the membership is active
//   timetable  → { from, to } live classes with spaces, and whether this member is booked
//   book       → { event_id } registers them for that TeamUp class
//   cancel     → { event_id } unregisters them
//   roster     → coaches: { event_id } who is booked into a class, with any account photo here
//   mark       → coaches: { attendance_id, present } marks attendance in TeamUp (best effort; the
//                register is also saved in tf_attendance either way)
//   inspect    → admins only: raw samples of what TeamUp returns, to check the field mapping
//
// NOT YET TESTED AGAINST LIVE TEAMUP: there was no token to test with. Paths follow TeamUp's v2
// API reference (GET /events, POST /events/:id/register and /unregister, customers, customer
// memberships, attendances), which does not publish its field names, so every field is read
// tolerantly. Run "inspect" with the first real token and adjust the pickers below if needed.
// Failures come back as readable messages, and nothing is shown as booked unless TeamUp says so.
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
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 9000);
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
    if (!res.ok) {
      const why = data?.detail ?? data?.message ?? data?.error ?? (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(' ') : '');
      throw new Error(`TeamUp said ${res.status}${why ? `: ${why}` : ''}`);
    }
    return data;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('TeamUp did not respond in time.');
    throw e;
  } finally { clearTimeout(timer); }
}
const results = (d: any): any[] => (Array.isArray(d) ? d : d?.results ?? d?.data ?? []);
// Follow "next" links for a few pages. TeamUp may return absolute URLs; keep the path only.
async function pages(path: string, max = 5) {
  const out: any[] = []; let url: string | null = path;
  for (let i = 0; i < max && url; i++) {
    const d = await tu(url); out.push(...results(d));
    url = typeof d?.next === 'string' && d.next ? d.next.replace(/^https?:\/\/[^/]+/, '') : null;
  }
  return out;
}

// Field pickers: TeamUp's reference does not list response fields, so accept the likely names.
const first = (...v: any[]) => v.find((x) => x !== undefined && x !== null && x !== '');
const idOf = (v: any) => (v && typeof v === 'object' ? v.id : v);
const num = (v: any) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v));
const norm = (e: unknown) => String(e ?? '').trim().toLowerCase();
const startOf = (e: any) => first(e.starts_at, e.start_time, e.start, e.starts, e.start_datetime, e.start_date_time);
const nameOf = (e: any) => String(first(e.name, e.title, e.offering_type?.name, e.offering?.name, e.offering_type_name, 'Class'));
const personName = (p: any) => (typeof p === 'object' && p ? String(first(p.name, p.full_name, p.display_name, [p.first_name, p.last_name].filter(Boolean).join(' ')) ?? '') : '');
const coachOf = (e: any) => {
  const list = first(e.instructors, e.staff, e.instructor ? [e.instructor] : null);
  const names = (Array.isArray(list) ? list : []).map(personName).filter(Boolean);
  return names.length ? names.join(', ') : String(first(e.instructor_names, e.instructor_name, '') ?? '');
};
const capOf = (e: any) => num(first(e.max_occupancy, e.capacity, e.max_attendees, e.max_capacity, e.spots, e.max_registrations));
const bookedOf = (e: any) => num(first(e.occupancy, e.attending_count, e.attendance_count, e.registered_count, e.num_registered, e.attendees_count, e.registrations_count, e.registration_count));
const cancelledOf = (e: any) => !!(e.is_cancelled || e.cancelled || e.is_canceled || /cancel/i.test(String(e.status ?? '')));
// The clock time and date of an ISO timestamp in the gym's time zone.
const londonTime = (ts: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
const londonDay = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ts));
const isDay = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));
const isRef = (s: unknown) => /^[A-Za-z0-9_-]{1,40}$/.test(String(s ?? ''));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: any = {}; try { body = await req.json(); } catch { /* empty body */ }
  const action = String(body.action ?? 'status');
  if (action === 'status') return json({ linked: !!TOKEN });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))!);
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user?.email || !user.email_confirmed_at) return json({ ok: false, error: 'Please sign in first.' }, 401);
  if (!TOKEN) return json({ linked: false, ok: false, error: 'TeamUp is not linked yet.' });

  try {
    const { data: profile } = await db.from('tf_profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (!profile) return json({ ok: false, error: 'Open the app once so your profile is created.' });
    const { data: adminRow } = await db.from('tf_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    const isAdmin = !!adminRow, active = isAdmin || profile.status === 'active';

    // Find this person in TeamUp by the email they proved they own. A shared family email
    // matches more than one customer; those are linked by hand, never guessed.
    const findCustomer = async (): Promise<string | null> => {
      if (profile.teamup_id) return String(profile.teamup_id);
      const found = results(await tu(`/api/v2/customers?email=${encodeURIComponent(user.email!)}`)).filter((c: any) => norm(c.email) === norm(user.email));
      if (found.length !== 1) return null;
      await db.from('tf_profiles').update({ teamup_id: String(found[0].id) }).eq('user_id', user.id);
      return String(found[0].id);
    };
    const memberships = async (cid: string) => {
      try { return results(await tu(`/api/v2/customer_memberships?customer=${encodeURIComponent(cid)}`)).filter((m: any) => m.customer == null || String(idOf(m.customer)) === cid); }
      catch { return results(await tu(`/api/v2/customers/${encodeURIComponent(cid)}/memberships`)); }
    };

    if (action === 'sync') {
      const cid = await findCustomer();
      if (!cid) {
        await db.from('tf_profiles').update({ teamup_status: 'not matched', teamup_checked_at: new Date().toISOString() }).eq('user_id', user.id);
        return json({ linked: true, ok: true, active, message: 'We could not match this email to one TeamUp customer. Use the same email as your TeamUp account, or ask the gym to link you.' });
      }
      const ms = await memberships(cid);
      const isLive = (m: any) => m.is_active === true || m.active === true || /^(active|current|ongoing)$/i.test(String(m.status ?? ''));
      const live = ms.filter(isLive), plan = live[0] ?? ms[0];
      const planName = plan ? String(first(plan.membership?.name, plan.membership_name, plan.name, plan.title, 'Membership')) : null;
      const has = live.length > 0;
      await db.from('tf_profiles').update({
        teamup_plan: planName, teamup_status: has ? 'active' : ms.length ? (norm(plan?.status) || 'not active') : 'no membership',
        teamup_checked_at: new Date().toISOString(), ...(has && profile.status === 'pending' ? { status: 'active' } : {}),
      }).eq('user_id', user.id);
      return json({ linked: true, ok: true, active: has || active, message: has ? `Membership found: ${planName}.` : 'No active TeamUp membership was found for this email.' });
    }

    if (!active) return json({ ok: false, error: 'Your account is not switched on yet.' });

    if (action === 'timetable') {
      const from = String(body.from ?? ''), to = String(body.to ?? '');
      if (!isDay(from) || !isDay(to) || to < from) return json({ ok: false, error: 'Missing dates.' });
      if ((Date.parse(to) - Date.parse(from)) / 864e5 > 14) return json({ ok: false, error: 'Ask for two weeks at most.' });
      const q = `start_date=${from}&end_date=${to}&starts_after=${from}T00:00:00Z&starts_before=${to}T23:59:59Z&page_size=100`;
      const raw = await pages(`/api/v2/events?${q}`);
      const events = raw.filter((e) => { const s = startOf(e); if (!s || cancelledOf(e)) return false; const d = londonDay(s); return d >= from && d <= to; });
      const cid = await findCustomer();
      const mine = new Set<string>(), waiting = new Set<string>();
      if (cid) {
        const att = await pages(`/api/v2/attendances?customer=${encodeURIComponent(cid)}&page_size=100`, 4).catch(() => []);
        for (const a of att) {
          if (a.customer != null && String(idOf(a.customer)) !== cid) continue;
          const ev = String(idOf(first(a.event, a.event_id)) ?? ''), st = String(a.status ?? '');
          if (/wait/i.test(st)) waiting.add(ev);
          else if (!/cancel|no.?show|removed|declin|refund/i.test(st)) mine.add(ev);
        }
      }
      return json({
        linked: true, ok: true, matched: !!cid,
        events: events.map((e) => {
          const s = startOf(e), id = String(e.id);
          return { id, day: londonDay(s), time: londonTime(s), name: nameOf(e), coach: coachOf(e), capacity: capOf(e), booked: bookedOf(e), mine: mine.has(id), waitlisted: waiting.has(id) };
        }).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)),
      });
    }

    if (action === 'book' || action === 'cancel') {
      const ev = String(body.event_id ?? '');
      if (!isRef(ev)) return json({ ok: false, error: 'Missing class.' });
      const cid = await findCustomer();
      if (!cid) return json({ ok: false, error: 'Your account is not matched to TeamUp yet. Check your membership on the Account tab first.' });
      const customer = /^\d+$/.test(cid) ? Number(cid) : cid;
      await tu(`/api/v2/events/${ev}/${action === 'book' ? 'register' : 'unregister'}`, { method: 'POST', body: { customer } });
      return json({ ok: true });
    }

    const isCoach = isAdmin || (profile.role === 'coach' && profile.status === 'active');
    if (action === 'roster') {
      if (!isCoach) return json({ ok: false, error: 'Coaches only.' }, 403);
      const ev = String(body.event_id ?? '');
      if (!isRef(ev)) return json({ ok: false, error: 'Missing class.' });
      const att = (await pages(`/api/v2/attendances?event=${encodeURIComponent(ev)}&page_size=100`, 3))
        .filter((a: any) => (a.event == null && a.event_id == null) || String(idOf(first(a.event, a.event_id))) === ev)
        .filter((a: any) => !/cancel|removed|declin|refund/i.test(String(a.status ?? '')));
      // Names may come inline or only as a customer id; look up the ones that are missing.
      const people = await Promise.all(att.map(async (a: any) => {
        const cust = a.customer, cid = String(idOf(first(cust, a.customer_id)) ?? '');
        let name = personName(cust), email = typeof cust === 'object' && cust ? String(cust.email ?? '') : '';
        if (!name && cid) { try { const c = await tu(`/api/v2/customers/${encodeURIComponent(cid)}`); name = personName(c); email = String(c?.email ?? ''); } catch { /* keep going */ } }
        const st = String(a.status ?? '');
        return { attendance_id: String(a.id ?? ''), customer_id: cid, name: name || 'Member', email, waitlist: /wait/i.test(st),
          status: /attend|present|check/i.test(st) ? 'present' : /no.?show|absent/i.test(st) ? 'absent' : null };
      }));
      const ids = people.map((p) => p.customer_id).filter(Boolean);
      const { data: here } = ids.length ? await db.from('tf_profiles').select('user_id, teamup_id, name, avatar_url').in('teamup_id', ids) : { data: [] };
      const byTu = new Map((here ?? []).map((r: any) => [String(r.teamup_id), r]));
      return json({ ok: true, people: people.map((p) => { const h: any = byTu.get(p.customer_id); return { ...p, user_id: h?.user_id ?? null, avatar_url: h?.avatar_url ?? null, name: h?.name || p.name }; })
        .sort((a, b) => Number(a.waitlist) - Number(b.waitlist) || a.name.localeCompare(b.name)) });
    }
    if (action === 'mark') {
      if (!isCoach) return json({ ok: false, error: 'Coaches only.' }, 403);
      const id = String(body.attendance_id ?? '');
      if (!isRef(id)) return json({ ok: false, error: 'Missing booking.' });
      await tu(`/api/v2/attendances/${id}`, { method: 'PATCH', body: { status: body.present ? 'attended' : 'noshow' } });
      return json({ ok: true });
    }

    if (action === 'inspect') {
      if (!isAdmin) return json({ ok: false, error: 'Admins only.' }, 403);
      const cut = (v: unknown) => JSON.stringify(v ?? null).slice(0, 2500);
      const today = new Date().toISOString().slice(0, 10);
      const out: Record<string, string> = {};
      const tryIt = async (k: string, f: () => Promise<unknown>) => { try { out[k] = cut(await f()); } catch (e) { out[k] = 'ERROR ' + (e as Error).message; } };
      let cid: string | null = null;
      await tryIt('customer', async () => { cid = await findCustomer(); return cid; });
      await tryIt('event', async () => results(await tu(`/api/v2/events?start_date=${today}&starts_after=${today}T00:00:00Z&page_size=2`))[0]);
      if (cid) {
        await tryIt('attendance', async () => results(await tu(`/api/v2/attendances?customer=${cid}&page_size=2`))[0]);
        await tryIt('membership', async () => (await memberships(cid!))[0]);
      }
      await tryIt('event_attendance', async () => { const e = results(await tu(`/api/v2/events?start_date=${today}&starts_after=${today}T00:00:00Z&page_size=1`))[0]; return e ? results(await tu(`/api/v2/attendances?event=${e.id}&page_size=2`))[0] : null; });
      return json({ ok: true, inspect: out });
    }
    return json({ ok: false, error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ linked: true, ok: false, error: (e as Error).message || 'TeamUp did not respond.' });
  }
});
