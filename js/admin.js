// Admin page: sign in (with forgot-password), then edit coaches, the timetable, memberships,
// the programming section and site details, read enquiries, and manage who else can sign in.
import * as db from './data.js';
import { DAYS, SETTINGS as DEFAULT_SETTINGS } from './defaults.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t12 = (t) => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`; };
const when = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const SETUP_MSG = "The database isn't set up yet: run supabase/001_trifit.sql in the Supabase SQL editor.";
const nice = (m) => (/schema cache|does not exist|Could not find the (table|function)/i.test(m || '') ? SETUP_MSG : (m || 'Something went wrong'));
let ME = null;

// ---------- Sign in ----------
// Read the reset-link details before Supabase tidies them out of the address bar.
const authHash = new URLSearchParams(location.hash.slice(1));
const arrivedFromReset = authHash.get('type') === 'recovery';
const linkError = authHash.get('error_description');
let mode = 'signin'; // 'signin' | 'signup' | 'forgot'
let inRecovery = false;
const views = ['#login-view', '#reset-view', '#pending-view', '#app-view'];
const show = (id) => views.forEach((v) => ($(v).hidden = v !== id));

async function boot() {
  if (arrivedFromReset || inRecovery) return showReset();
  let who;
  try { who = await db.currentAdmin(); } catch (e) { return showLogin(nice(e.message)); }
  if (!who) return showLogin(linkError ? 'That link has expired or was already used. Request a new one below.' : '');
  const out = async () => { await db.signOut(); location.href = location.pathname; };
  if (who.notAdmin) { show('#pending-view'); $('#p-email').textContent = who.email; $('#p-signout').onclick = out; return; }
  ME = who;
  show('#app-view');
  $('#demo-banner').hidden = !who.demo;
  if (who.demo) $$('a[href="./"]').forEach((l) => (l.href = './?demo')); // so the site shows the demo edits
  $('#who').textContent = who.demo ? '' : `Signed in as ${who.email}`;
  if (!who.demo) { $('#signout').hidden = false; $('#signout').onclick = out; }
  drawTabs(); openTab(TAB);
}
function showLogin(msg) { show('#login-view'); if (msg) { $('#l-error').textContent = msg; $('#l-error').hidden = false; } }
async function showReset() {
  inRecovery = true; show('#reset-view');
  try { const who = await db.currentAdmin(); $('#r-email').textContent = who?.email || 'your account'; } catch { $('#r-email').textContent = 'your account'; }
  history.replaceState(null, '', location.pathname + location.search); // keep the token out of the address bar
  $('#r-pass').focus();
}
db.onPasswordRecovery(() => { if (!inRecovery) showReset(); });

function setMode(m) {
  mode = m;
  const up = m === 'signup', forgot = m === 'forgot';
  $('#l-title').textContent = up ? 'Create admin account' : forgot ? 'Reset your password' : 'Admin login';
  $('#l-submit').textContent = up ? 'Create account' : forgot ? 'Email me a reset link' : 'Sign in';
  $('#l-toggle').textContent = m === 'signin' ? 'New admin? Create an account' : 'Back to sign in';
  $('#l-pass-field').hidden = forgot; $('#l-pass').required = !forgot;
  $('#l-forgot').hidden = m !== 'signin';
  $('#l-pass').autocomplete = up ? 'new-password' : 'current-password';
  $('#l-hint').hidden = !up; $('#l-error').hidden = true; $('#l-ok').hidden = true;
}
$('#l-toggle').onclick = () => setMode(mode === 'signin' ? 'signup' : 'signin');
$('#l-forgot').onclick = () => { setMode('forgot'); $('#l-email').focus(); };

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#l-error'), ok = $('#l-ok'); err.hidden = true; ok.hidden = true;
  const email = $('#l-email').value.trim(), pass = $('#l-pass').value;
  const btn = $('#l-submit'); btn.disabled = true;
  try {
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Please enter the email you sign in with.');
    if (mode === 'forgot') {
      await db.requestPasswordReset(email);
      // Same message whether or not the account exists, so the form can't be used to check emails.
      ok.innerHTML = `If <strong>${esc(email)}</strong> has an admin account, a reset link is on its way. Check your inbox (and spam), then follow the link to choose a new password.`;
      ok.hidden = false;
    } else if (mode === 'signup') {
      if (pass.length < 8) throw new Error('Password must be at least 8 characters.');
      const { needsConfirm } = await db.signUp(email, pass);
      if (needsConfirm) { ok.innerHTML = `Account created. Check <strong>${esc(email)}</strong> for a confirmation link, then sign in here.`; ok.hidden = false; setMode('signin'); ok.hidden = false; }
      else await boot();
    } else { await db.signIn(email, pass); await boot(); }
  } catch (ex) {
    const m = ex.message || 'Something went wrong';
    err.textContent = /confirm/i.test(m) ? 'Please click the confirmation link in your email first.'
      : /rate limit|too many|seconds/i.test(m) ? 'Too many requests just now. Please wait a minute and try again.'
      : /invalid login/i.test(m) ? 'Email or password is wrong. Use "Forgot password?" if you need a new one.'
      : nice(m);
    err.hidden = false;
  } finally { btn.disabled = false; }
});

$('#reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#r-error'); err.hidden = true;
  const p1 = $('#r-pass').value, p2 = $('#r-pass2').value;
  if (p1.length < 8) { err.textContent = 'Password must be at least 8 characters.'; err.hidden = false; return; }
  if (p1 !== p2) { err.textContent = "The two passwords don't match."; err.hidden = false; return; }
  const btn = $('#r-submit'); btn.disabled = true; btn.textContent = 'Saving…';
  try { await db.updatePassword(p1); inRecovery = false; await boot(); flash('Password updated. You are signed in.'); }
  catch (ex) {
    err.textContent = /same|different/i.test(ex.message || '') ? 'Choose a password different from your old one.'
      : /session|expired|jwt/i.test(ex.message || '') ? 'This reset link has expired. Go back to the login page and request a new one.'
      : (ex.message || 'Could not save the new password.');
    err.hidden = false;
  } finally { btn.disabled = false; btn.textContent = 'Save new password'; }
});

// ---------- Tabs ----------
const TABS = [['coaches', 'Coaches'], ['classes', 'Timetable'], ['memberships', 'Membership'], ['programming', 'Programming'], ['site', 'Site details'], ['enquiries', 'Enquiries'], ['admins', 'Admins']];
let TAB = 'coaches', OPEN_COUNT = 0;
function drawTabs() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${k === TAB ? 'active' : ''}">${l}${k === 'enquiries' && OPEN_COUNT ? `<span class="count">${OPEN_COUNT}</span>` : ''}</button>`).join('');
}
$('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) openTab(b.dataset.tab); };
function flash(msg) { const f = $('#flash'); f.textContent = msg; f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => (f.hidden = true), 5000); }
async function openTab(k) {
  TAB = k; drawTabs();
  const pane = $('#pane'); pane.innerHTML = '<p class="hint">Loading…</p>';
  try {
    if (SCHEMAS[k]) await listTab(k);
    else if (k === 'site') await siteTab();
    else if (k === 'enquiries') await enquiriesTab();
    else await adminsTab();
  } catch (e) { pane.innerHTML = `<p class="error">${esc(nice(e.message))}</p>`; }
  if (k !== 'enquiries') db.listEnquiries().then((r) => { OPEN_COUNT = r.filter((x) => !x.handled).length; drawTabs(); }).catch(() => {});
}
// Two-step delete: the first click arms the button, the second one deletes.
function armed(btn) {
  if (btn.classList.contains('armed')) return true;
  btn.classList.add('armed'); btn.dataset.label = btn.textContent; btn.textContent = 'Sure?';
  setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; } }, 3500);
  return false;
}

// ---------- Lists that share one editor: coaches, timetable, memberships, programming ----------
const KIND = { pillar: 'The three pillars', week: 'How the week runs', principle: 'Why we do it this way' };
const SCHEMAS = {
  coaches: {
    one: 'coach', intro: 'Shown under "Meet the coaches", in this order. The classes each coach takes are filled in from the timetable.', sortable: true,
    fields: [
      { k: 'name', label: 'Name', req: true, max: 80 },
      { k: 'role', label: 'Role', ph: 'Coach, Head coach, Owner', max: 60 },
      { k: 'blurb', label: 'Blurb', type: 'textarea', ph: 'Two or three sentences: background, what they coach, what they love about it.', max: 500 },
      { k: 'photo_url', label: 'Photo', type: 'photo' },
      { k: 'published', label: 'Show on the website', type: 'bool', def: true },
    ],
    line: (r) => [r.name, [r.role, r.blurb ? '' : 'no blurb yet', r.published ? '' : 'hidden'].filter(Boolean).join(' · ')], thumb: true, off: (r) => !r.published,
  },
  classes: {
    one: 'class', intro: 'The weekly timetable. Classes sort themselves by day and time.', group: (r) => DAYS[r.day - 1],
    fields: [
      { k: 'day', label: 'Day', type: 'select', options: DAYS.map((d, i) => [i + 1, d]), def: 1, num: true },
      { k: 'start_time', label: 'Starts', type: 'time', req: true, def: '06:00' },
      { k: 'duration', label: 'Length in minutes', type: 'number', def: 60 },
      { k: 'name', label: 'Class', req: true, ph: 'TRI FIT FF', max: 60, datalist: 'name' },
      { k: 'coach', label: 'Coach or coaches', ph: 'Names separated by commas', max: 120 },
      { k: 'note', label: 'Note', ph: 'Ages 16+', max: 40 },
    ],
    line: (r) => [`${t12(r.start_time)} · ${r.name}`, [r.coach, r.note].filter(Boolean).join(' · ')],
  },
  memberships: {
    one: 'membership option', intro: 'Shown under "Membership options", in this order.', sortable: true,
    fields: [
      { k: 'name', label: 'Name', req: true, max: 60 },
      { k: 'price', label: 'Price', req: true, ph: '£65 or Ask us', max: 20 },
      { k: 'period', label: 'Per', ph: 'per month', max: 30 },
      { k: 'description', label: 'Description', type: 'textarea', max: 300 },
      { k: 'highlight', label: 'Mark as most popular', type: 'bool', def: false },
      { k: 'published', label: 'Show on the website', type: 'bool', def: true },
    ],
    line: (r) => [r.name, [r.price, r.period, r.published ? '' : 'hidden'].filter(Boolean).join(' · ')], off: (r) => !r.published,
  },
  programming: {
    one: 'block', intro: 'The programming section has three parts. The heading and opening paragraph are under Site details.', sortable: true, group: (r) => KIND[r.kind],
    fields: [
      { k: 'kind', label: 'Part of the section', type: 'select', options: Object.entries(KIND), def: 'pillar' },
      { k: 'label', label: 'Short label', ph: '01, or Mon', max: 12 },
      { k: 'title', label: 'Title', req: true, max: 80 },
      { k: 'body', label: 'Text', type: 'textarea', req: true, max: 700 },
    ],
    line: (r) => [[r.label, r.title].filter(Boolean).join(' · '), r.body],
  },
};

function fieldHtml(f, v, rows) {
  const id = `f-${f.k}`, val = v ?? f.def ?? '';
  if (f.type === 'bool') return `<label class="check"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}> ${esc(f.label)}</label>`;
  let input;
  if (f.type === 'textarea') input = `<textarea id="${id}" rows="5" ${f.max ? `maxlength="${f.max}"` : ''} placeholder="${esc(f.ph || '')}">${esc(val)}</textarea>`;
  else if (f.type === 'select') input = `<select id="${id}">${f.options.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (f.type === 'photo') input = `<div class="photo-field"><img id="${id}-img" src="${esc(val)}" alt="" ${val ? '' : 'hidden'}>
      <input type="file" id="${id}-file" accept="image/*" style="max-width:240px"><input type="hidden" id="${id}" value="${esc(val)}">
      <button type="button" class="ib" id="${id}-clear" ${val ? '' : 'hidden'}>Remove photo</button></div>`;
  else {
    const list = f.datalist ? [...new Set(rows.map((r) => r[f.datalist]).filter(Boolean))] : null;
    input = `<input id="${id}" type="${f.type || 'text'}" value="${esc(val)}" ${f.max ? `maxlength="${f.max}"` : ''} placeholder="${esc(f.ph || '')}" ${list ? `list="${id}-list"` : ''}>` +
      (list ? `<datalist id="${id}-list">${list.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
  }
  return `<div class="field"><label for="${f.type === 'photo' ? id + '-file' : id}">${esc(f.label)}${f.req || f.type === 'select' || f.type === 'photo' ? '' : ' <span class="opt">optional</span>'}</label>${input}</div>`;
}
function wirePhoto(scope, folder) {
  $$('input[type=file]', scope).forEach((file) => {
    const base = file.id.replace(/-file$/, ''), hidden = $('#' + base, scope), img = $('#' + base + '-img', scope), clear = $('#' + base + '-clear', scope);
    file.onchange = () => { const f = file.files[0]; if (!f) return; file._pending = f; img.src = URL.createObjectURL(f); img.hidden = false; clear.hidden = false; };
    clear.onclick = () => { file.value = ''; file._pending = null; hidden.value = ''; img.hidden = true; clear.hidden = true; };
    file._commit = async () => { if (file._pending) { hidden.value = await db.uploadPhoto(file._pending, folder); file._pending = null; } };
  });
}

async function listTab(name, editId = null) {
  const sc = SCHEMAS[name], rows = await db.list(name), editing = rows.find((r) => r.id === editId) || null;
  const groups = sc.group ? [...new Set(rows.map(sc.group))] : [null];
  const rowHtml = (r) => {
    const [a, b] = sc.line(r), peers = sc.group ? rows.filter((x) => sc.group(x) === sc.group(r)) : rows, i = peers.indexOf(r);
    return `<div class="rw ${sc.off?.(r) ? 'off' : ''} ${editing?.id === r.id ? 'editing' : ''}" data-id="${esc(r.id)}">
      ${sc.thumb ? (r.photo_url ? `<img class="thumb" src="${esc(r.photo_url)}" alt="">` : `<span class="thumb">${esc(r.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join(''))}</span>`) : ''}
      <div class="txt"><b>${esc(a)}</b>${b ? `<span>${esc(b)}</span>` : ''}</div>
      <div class="acts">${sc.sortable ? `<button class="ib" data-up ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="ib" data-down ${i === peers.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>` : ''}
        <button class="ib" data-edit>Edit</button><button class="ib" data-del>Delete</button></div></div>`;
  };
  $('#pane').innerHTML = `<p class="hint" style="margin-bottom:16px">${esc(sc.intro)}</p><div class="split">
    <div class="rows">${rows.length ? groups.map((g) => (g ? `<h3>${esc(g)}</h3>` : '') + rows.filter((r) => !sc.group || sc.group(r) === g).map(rowHtml).join('')).join('') : `<p class="hint">Nothing here yet. Add the first ${sc.one} with the form.</p>`}</div>
    <form class="panel" id="row-form" novalidate>
      <h2 style="font-size:21px">${editing ? `Edit ${sc.one}` : `Add a ${sc.one}`}</h2>
      ${sc.fields.map((f) => fieldHtml(f, editing?.[f.k], rows)).join('')}
      <div class="formrow"><button class="btn" type="submit" id="row-save">${editing ? 'Save changes' : `Add ${sc.one}`}</button>${editing ? '<button class="btn ghost" type="button" id="row-cancel">Cancel</button>' : ''}</div>
      <p class="error" id="row-error" hidden role="alert"></p>
    </form></div>`;
  const form = $('#row-form'); wirePhoto(form, 'coaches');
  if (editing) { $('#row-cancel').onclick = () => listTab(name); if (matchMedia('(max-width:900px)').matches) form.scrollIntoView({ block: 'start' }); }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#row-error'), btn = $('#row-save'); err.hidden = true;
    try {
      const row = editing ? { id: editing.id } : {};
      for (const f of sc.fields) {
        const el = $(`#f-${f.k}`, form);
        let v = f.type === 'bool' ? el.checked : el.value.trim();
        if (f.type === 'number') v = Math.max(5, Math.min(600, parseInt(v, 10) || f.def));
        if (f.num) v = Number(v);
        if (f.req && !v) { el.focus(); throw new Error(`Please fill in "${f.label}".`); }
        if (f.type === 'time' && !/^\d{2}:\d{2}$/.test(v)) throw new Error('Please choose a start time.');
        row[f.k] = v;
      }
      btn.disabled = true; btn.textContent = 'Saving…';
      for (const file of $$('input[type=file]', form)) { await file._commit(); row[file.id.replace(/^f-|-file$/g, '')] = $('#' + file.id.replace(/-file$/, ''), form).value; }
      await db.save(name, row);
      flash(editing ? 'Saved. The website is updated.' : `Added. It is on the website now.`);
      await listTab(name);
    } catch (ex) { err.textContent = nice(ex.message); err.hidden = false; btn.disabled = false; btn.textContent = editing ? 'Save changes' : `Add ${sc.one}`; }
  };
  $('.rows').onclick = async (e) => {
    const rw = e.target.closest('.rw'); if (!rw) return;
    const r = rows.find((x) => x.id === rw.dataset.id), peers = sc.group ? rows.filter((x) => sc.group(x) === sc.group(r)) : rows, i = peers.indexOf(r);
    try {
      if (e.target.closest('[data-edit]')) return listTab(name, r.id);
      if (e.target.closest('[data-up]') && i > 0) { await db.swap(name, r, peers[i - 1]); return listTab(name, editId); }
      if (e.target.closest('[data-down]') && i < peers.length - 1) { await db.swap(name, r, peers[i + 1]); return listTab(name, editId); }
      const del = e.target.closest('[data-del]');
      if (del && armed(del)) { await db.remove(name, r.id); flash('Deleted.'); return listTab(name); }
    } catch (ex) { flash(nice(ex.message)); }
  };
}

// ---------- Site details ----------
const SITE_FIELDS = [
  ['Top of the page', [
    { k: 'hero_eyebrow', label: 'Small line above the headline', max: 60 },
    { k: 'hero_headline', label: 'Headline', req: true, max: 80 },
    { k: 'hero_text', label: 'Opening paragraph', type: 'textarea', max: 400 },
    { k: 'hero_image', label: 'Photo beside the headline (the logo shows if empty)', type: 'photo' },
  ]],
  ['Contact', [
    { k: 'contact_email', label: 'Contact email (enquiries are sent here)', type: 'email', req: true, max: 200 },
    { k: 'phone', label: 'Phone', max: 30 },
    { k: 'location', label: 'Where to find you', ph: 'Address or town', max: 200 },
  ]],
  ['Links', [
    { k: 'instagram', label: 'Instagram link', type: 'url', max: 300 },
    { k: 'facebook', label: 'Facebook link', type: 'url', max: 300 },
    { k: 'teamup', label: 'TeamUp booking link', type: 'url', max: 300 },
  ]],
  ['Section text', [
    { k: 'schedule_note', label: 'Note under the timetable', type: 'textarea', max: 300 },
    { k: 'membership_note', label: 'Note under the membership options', type: 'textarea', max: 300 },
    { k: 'programming_heading', label: 'Programming heading', max: 80 },
    { k: 'programming_intro', label: 'Programming opening paragraph', type: 'textarea', max: 700 },
  ]],
];
async function siteTab() {
  const s = await db.getSettings();
  $('#pane').innerHTML = `<form class="panel" id="site-form" novalidate style="max-width:760px">
    ${SITE_FIELDS.map(([g, fs]) => `<h3 class="grp">${g}</h3>${fs.map((f) => fieldHtml(f, s[f.k], [])).join('')}`).join('')}
    <div class="formrow"><button class="btn" type="submit" id="site-save">Save site details</button></div>
    <p class="error" id="site-error" hidden role="alert"></p></form>`;
  const form = $('#site-form'); wirePhoto(form, 'site');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#site-error'), btn = $('#site-save'); err.hidden = true;
    try {
      const out = { ...DEFAULT_SETTINGS, ...s };
      for (const f of SITE_FIELDS.flatMap(([, fs]) => fs)) {
        const el = $(`#f-${f.k}`, form), v = el.value.trim();
        if (f.req && !v) { el.focus(); throw new Error(`Please fill in "${f.label}".`); }
        if (f.type === 'url' && v && !/^https?:\/\//i.test(v)) { el.focus(); throw new Error(`"${f.label}" should start with https://`); }
        if (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(v)) { el.focus(); throw new Error('Please enter a valid contact email.'); }
        out[f.k] = v;
      }
      btn.disabled = true; btn.textContent = 'Saving…';
      for (const file of $$('input[type=file]', form)) { await file._commit(); out[file.id.replace(/^f-|-file$/g, '')] = $('#' + file.id.replace(/-file$/, ''), form).value; }
      await db.saveSettings(out);
      flash('Saved. The website is updated.'); await siteTab();
    } catch (ex) { err.textContent = nice(ex.message); err.hidden = false; btn.disabled = false; btn.textContent = 'Save site details'; }
  };
}

// ---------- Enquiries ----------
async function enquiriesTab() {
  const rows = await db.listEnquiries();
  OPEN_COUNT = rows.filter((r) => !r.handled).length; drawTabs();
  $('#pane').innerHTML = `<p class="hint" style="margin-bottom:16px">Every enquiry from the website form. Each one is also emailed to the contact email under Site details.</p>
    <div class="rows" style="max-width:820px">${rows.length ? rows.map((r) => `<div class="enqcard ${r.handled ? 'done' : ''}" data-id="${esc(r.id)}">
      <div class="top"><b>${esc(r.name)}</b><span class="hint">${when(r.created_at)}</span></div>
      <div><a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? ` · <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : ''}</div>
      ${r.interest ? `<div class="hint">Interested in: ${esc(r.interest)}</div>` : ''}${r.message ? `<p class="msg">${esc(r.message)}</p>` : ''}
      <div class="formrow" style="margin-top:6px"><button class="ib" data-done>${r.handled ? 'Mark as open' : 'Mark as done'}</button><button class="ib" data-del>Delete</button></div></div>`).join('')
      : '<p class="hint">No enquiries yet.</p>'}</div>`;
  $('.rows').onclick = async (e) => {
    const card = e.target.closest('.enqcard'); if (!card) return;
    const r = rows.find((x) => x.id === card.dataset.id);
    try {
      if (e.target.closest('[data-done]')) { await db.setHandled(r.id, !r.handled); return enquiriesTab(); }
      const del = e.target.closest('[data-del]');
      if (del && armed(del)) { await db.deleteEnquiry(r.id); return enquiriesTab(); }
    } catch (ex) { flash(nice(ex.message)); }
  };
}

// ---------- Admins ----------
async function adminsTab() {
  const { admins, requests, invites } = await db.listAccess();
  $('#pane').innerHTML = `<div class="split">
    <div class="rows">
      <h3>Admins</h3>${admins.map((a) => `<div class="rw" data-admin="${esc(a.user_id)}"><div class="txt"><b>${esc(a.email)}</b>${a.user_id === ME.id ? '<span>You</span>' : ''}</div>
        <div class="acts">${a.user_id === ME.id || ME.demo ? '' : '<button class="ib" data-remove>Remove</button>'}</div></div>`).join('')}
      ${requests.length ? `<h3>Asking for access</h3>${requests.map((r) => `<div class="rw" data-req="${esc(r.user_id)}"><div class="txt"><b>${esc(r.email)}</b><span>Created an account ${when(r.created_at)}</span></div>
        <div class="acts"><button class="ib" data-approve>Approve</button><button class="ib" data-decline>Decline</button></div></div>`).join('')}` : ''}
      ${invites.length ? `<h3>Invited, not signed up yet</h3>${invites.map((i) => `<div class="rw" data-invite="${esc(i.email)}"><div class="txt"><b>${esc(i.email)}</b></div>
        <div class="acts"><button class="ib" data-uninvite>Cancel</button></div></div>`).join('')}` : ''}
    </div>
    <form class="panel" id="invite-form" novalidate>
      <h2 style="font-size:21px">Add an admin</h2>
      <p class="hint">Enter their email, then ask them to open this page and choose "New admin? Create an account" with the same email. They get full access as soon as they confirm it. If they forget their password, "Forgot password?" on the login emails them a reset link.</p>
      <div class="field"><label for="i-email">Their email</label><input id="i-email" type="email" autocomplete="off"></div>
      <div class="formrow"><button class="btn" type="submit">Add admin</button></div>
      <p class="error" id="i-error" hidden role="alert"></p>
    </form></div>`;
  $('#invite-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#i-error'), email = $('#i-email').value.trim(); err.hidden = true;
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Please enter a valid email.'; err.hidden = false; return; }
    try { await db.inviteAdmin(email); flash(`${email} can now create an admin account.`); adminsTab(); } catch (ex) { err.textContent = nice(ex.message); err.hidden = false; }
  };
  $('.rows').onclick = async (e) => {
    const rw = e.target.closest('.rw'); if (!rw) return;
    try {
      if (e.target.closest('[data-approve]')) { await db.approveAdmin(rw.dataset.req); flash('Approved.'); return adminsTab(); }
      if (e.target.closest('[data-decline]')) { await db.declineRequest(rw.dataset.req); return adminsTab(); }
      if (e.target.closest('[data-uninvite]')) { await db.removeInvite(rw.dataset.invite); return adminsTab(); }
      const rm = e.target.closest('[data-remove]');
      if (rm && armed(rm)) { await db.removeAdmin(rw.dataset.admin); flash('Removed.'); return adminsTab(); }
    } catch (ex) { flash(nice(ex.message)); }
  };
}

boot();
