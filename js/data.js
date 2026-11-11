// Data layer. The public page reads with plain fetch (no library to download); the admin page
// loads supabase-js on demand for sign-in, edits and photo uploads. In demo mode everything
// lives in this browser's localStorage instead.
import { SUPABASE_URL, SUPABASE_ANON_KEY as KEY, DEMO } from './config.js';
import { DEFAULTS } from './defaults.js';

export { DEMO };
export const TABLES = { coaches: 'tf_coaches', classes: 'tf_classes', memberships: 'tf_memberships', programming: 'tf_programming' };
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
export const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const byOrder = (name) => (a, b) => name === 'classes'
  ? a.day - b.day || String(a.start_time).localeCompare(String(b.start_time))
  : (a.sort ?? 0) - (b.sort ?? 0);

// ---------- Demo store ----------
const DEMO_KEY = 'tf-demo-v1';
export function demoRead() {
  try { const s = JSON.parse(localStorage.getItem(DEMO_KEY)); if (s && s.settings) return s; } catch {}
  return JSON.parse(JSON.stringify({ ...DEFAULTS, enquiries: [], invites: [] }));
}
export function demoWrite(s) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch {} }

// ---------- Public page ----------
/** Everything the landing page shows. Falls back to the built-in content if the database can't be reached. */
export async function loadSite() {
  if (DEMO) {
    const s = demoRead();
    return { settings: s.settings, coaches: s.coaches.filter((c) => c.published).sort(byOrder('coaches')), classes: s.classes.sort(byOrder('classes')),
      memberships: s.memberships.filter((m) => m.published).sort(byOrder('memberships')), programming: s.programming.sort(byOrder('programming')), source: 'demo' };
  }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 6000);
  const get = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H, signal: ctl.signal })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  try {
    const [content, coaches, classes, memberships, programming] = await Promise.all([
      get('tf_content?key=eq.settings&select=value'),
      get('tf_coaches?select=*&published=is.true&order=sort'),
      get('tf_classes?select=*&order=day,start_time'),
      get('tf_memberships?select=*&published=is.true&order=sort'),
      get('tf_programming?select=*&order=sort'),
    ]);
    return { settings: { ...DEFAULTS.settings, ...(content[0]?.value || {}) }, coaches, classes, memberships, programming, source: 'live' };
  } catch {
    return { ...DEFAULTS, source: 'defaults' };
  } finally { clearTimeout(timer); }
}

/** Saves an enquiry, then asks the email function to send it to the gym. */
export async function sendEnquiry(row) {
  if (DEMO) { const s = demoRead(); s.enquiries.unshift({ id: uid(), ...row, handled: false, created_at: new Date().toISOString() }); demoWrite(s); return; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tf_enquiries`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error('Could not send (' + r.status + ')');
  // The function only ever emails enquiries that haven't been emailed yet, so this call carries no data.
  fetch(`${SUPABASE_URL}/functions/v1/tf-enquiry-alert`, { method: 'POST', keepalive: true, headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
}

// ---------- Admin: sign-in ----------
let _client;
export async function client() {
  if (DEMO) return null;
  if (!_client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    _client = createClient(SUPABASE_URL, KEY, { auth: { storageKey: 'tf-admin-auth' } });
  }
  return _client;
}
/** null = signed out; {notAdmin} = signed in but not on the admin list; otherwise the admin. */
export async function currentAdmin() {
  if (DEMO) return { id: 'demo', email: 'demo', demo: true };
  const c = await client();
  const { data: { session } } = await c.auth.getSession();
  if (!session) return null;
  const me = { id: session.user.id, email: session.user.email };
  if (must(await c.rpc('tf_is_admin'))) return me;
  // Invited emails are added to the admin list here; everyone else lands in the requests list.
  await c.rpc('tf_request_access').then(() => {}, () => {});
  if ((await c.rpc('tf_is_admin')).data) return me;
  return { ...me, notAdmin: true };
}
export async function signIn(email, password) { const c = await client(); must(await c.auth.signInWithPassword({ email, password })); }
export async function signUp(email, password) {
  const c = await client();
  const d = must(await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
  return { needsConfirm: !d.session };
}
export async function signOut() { const c = await client(); if (c) await c.auth.signOut(); }
/** Emails a reset link that brings the admin back to this page to choose a new password. */
export async function requestPasswordReset(email) {
  const c = await client(); if (!c) return;
  must(await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
}
export async function updatePassword(password) { const c = await client(); if (!c) return; must(await c.auth.updateUser({ password })); }
export async function onPasswordRecovery(cb) {
  const c = await client(); if (!c) return;
  c.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') cb(); });
}

// ---------- Admin: content ----------
export async function list(name) {
  if (DEMO) return demoRead()[name].slice().sort(byOrder(name));
  const c = await client();
  const q = c.from(TABLES[name]).select('*');
  return must(await (name === 'classes' ? q.order('day').order('start_time') : q.order('sort')));
}
export async function save(name, row) {
  const { id, ...rest } = row;
  if (DEMO) {
    const s = demoRead(), rows = s[name];
    if (id) Object.assign(rows.find((r) => r.id === id) || {}, rest);
    else rows.push({ id: uid(), sort: Math.max(0, ...rows.map((r) => r.sort || 0)) + 1, ...rest });
    return demoWrite(s);
  }
  const c = await client();
  if (id) return must(await c.from(TABLES[name]).update(rest).eq('id', id));
  if (name !== 'classes') {
    const top = must(await c.from(TABLES[name]).select('sort').order('sort', { ascending: false }).limit(1));
    rest.sort = (top[0]?.sort || 0) + 1;
  }
  must(await c.from(TABLES[name]).insert(rest));
}
export async function remove(name, id) {
  if (DEMO) { const s = demoRead(); s[name] = s[name].filter((r) => r.id !== id); return demoWrite(s); }
  const c = await client(); must(await c.from(TABLES[name]).delete().eq('id', id));
}
/** Swap the order of two rows (the up and down arrows). */
export async function swap(name, a, b) {
  if (DEMO) { const s = demoRead(); const x = s[name].find((r) => r.id === a.id), y = s[name].find((r) => r.id === b.id); [x.sort, y.sort] = [y.sort, x.sort]; return demoWrite(s); }
  const c = await client();
  must(await c.from(TABLES[name]).update({ sort: b.sort }).eq('id', a.id));
  must(await c.from(TABLES[name]).update({ sort: a.sort }).eq('id', b.id));
}
export async function getSettings() {
  if (DEMO) return demoRead().settings;
  const c = await client();
  const rows = must(await c.from('tf_content').select('value').eq('key', 'settings'));
  return { ...DEFAULTS.settings, ...(rows[0]?.value || {}) };
}
export async function saveSettings(value) {
  if (DEMO) { const s = demoRead(); s.settings = value; return demoWrite(s); }
  const c = await client();
  must(await c.from('tf_content').upsert({ key: 'settings', value, updated_at: new Date().toISOString() }));
}

// ---------- Admin: photos ----------
async function compress(file, maxSide, q = 0.84) {
  let img = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!img) img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file is not an image we can read.')); i.src = URL.createObjectURL(file); });
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return { blob: await new Promise((res) => cv.toBlob(res, 'image/jpeg', q)), dataUrl: () => cv.toDataURL('image/jpeg', 0.7) };
}
/** Shrinks the photo, uploads it and returns its public address. */
export async function uploadPhoto(file, folder = 'coaches') {
  if (DEMO) return (await compress(file, 640)).dataUrl();
  const { blob } = await compress(file, folder === 'site' ? 2000 : 1200);
  const c = await client(), path = `${folder}/${uid()}.jpg`;
  must(await c.storage.from('tf-photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
  return c.storage.from('tf-photos').getPublicUrl(path).data.publicUrl;
}

// ---------- Admin: enquiries ----------
export async function listEnquiries() {
  if (DEMO) return demoRead().enquiries;
  const c = await client();
  return must(await c.from('tf_enquiries').select('*').order('created_at', { ascending: false }).limit(300));
}
export async function setHandled(id, handled) {
  if (DEMO) { const s = demoRead(); const e = s.enquiries.find((x) => x.id === id); if (e) e.handled = handled; return demoWrite(s); }
  const c = await client(); must(await c.from('tf_enquiries').update({ handled }).eq('id', id));
}
export async function deleteEnquiry(id) {
  if (DEMO) { const s = demoRead(); s.enquiries = s.enquiries.filter((x) => x.id !== id); return demoWrite(s); }
  const c = await client(); must(await c.from('tf_enquiries').delete().eq('id', id));
}

// ---------- Admin: who can sign in ----------
export async function listAccess() {
  if (DEMO) return { admins: [{ user_id: 'demo', email: 'you@example.com' }], requests: [], invites: demoRead().invites || [] };
  const c = await client();
  const [admins, requests, invites] = await Promise.all([
    c.rpc('tf_list_admins').then(must),
    c.from('tf_access_requests').select('*').order('created_at').then(must),
    c.from('tf_admin_invites').select('*').order('created_at').then(must),
  ]);
  return { admins, requests, invites };
}
export async function approveAdmin(userId) { const c = await client(); must(await c.rpc('tf_approve_admin', { target: userId })); }
export async function declineRequest(userId) { const c = await client(); must(await c.from('tf_access_requests').delete().eq('user_id', userId)); }
export async function removeAdmin(userId) { const c = await client(); must(await c.rpc('tf_remove_admin', { target: userId })); }
export async function inviteAdmin(email) {
  email = email.trim().toLowerCase();
  if (DEMO) { const s = demoRead(); s.invites = [...(s.invites || []).filter((i) => i.email !== email), { email }]; return demoWrite(s); }
  const c = await client(); must(await c.from('tf_admin_invites').upsert({ email }));
}
export async function removeInvite(email) {
  if (DEMO) { const s = demoRead(); s.invites = (s.invites || []).filter((i) => i.email !== email); return demoWrite(s); }
  const c = await client(); must(await c.from('tf_admin_invites').delete().eq('email', email));
}
