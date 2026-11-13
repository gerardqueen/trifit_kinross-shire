// Member and coach portal. Members see their programming with their own numbers, log scores,
// choose whether each score goes on the leaderboard, keep personal bests and book classes.
// Coaches write the programming. Admins also manage people and programmes.
import * as auth from './data.js';
import * as db from './portal.js';
import { DAYS } from './defaults.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t12 = (t) => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`; };
const { iso, monday, addDays } = db;
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = (d, long) => d.toLocaleDateString('en-GB', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
const SETUP_MSG = "The members area isn't switched on yet: supabase/002_portal.sql still needs to be run.";
const nice = (m) => (/schema cache|does not exist|Could not find the (table|function)/i.test(m || '') ? SETUP_MSG : (m || 'Something went wrong'));
let ME = null, TRACKS = [], PBS = {}, LINKED = false, DEFS = [], LOG = [], BENCH = {};
const isStaff = () => ME.role === 'admin' || ME.role === 'coach';

// ---------- Benchmarks and the percentage engine ----------
// A lift percentage is a straight share of the 1 rep max, rounded to the nearest 2.5kg.
// A timed percentage is effort: pace scales with power to the minus one third, so 80% is
// about 8% slower, not 20% faster.
// What can be tracked comes from the database (coaches manage it on the PBs tab). A member's PB
// for each is their best logged result: the heaviest lift, most reps, or fastest time.
const better = (kind) => (kind === 'time' ? (a, b) => a < b : (a, b) => a > b);
async function loadBench() {
  [DEFS, LOG] = await Promise.all([db.benchDefs(), db.benchLog()]);
  BENCH = Object.fromEntries(DEFS.map((d) => [d.name, { type: d.kind, dist: d.distance_m || null }]));
  PBS = {};
  for (const e of LOG) { const def = BENCH[e.name]; if (def && (PBS[e.name] == null || better(def.type)(e.value, PBS[e.name]))) PBS[e.name] = e.value; }
}
const fmtKg = (v) => parseFloat((+v).toFixed(2)) + 'kg';
const fmtTime = (s) => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const parseTime = (raw) => { const p = String(raw).trim().replace(/\./g, ':').split(':').map((n) => parseInt(n, 10)); if (p.some((n) => !Number.isFinite(n))) return NaN; return p.length === 1 ? p[0] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2]; };
const load = (max, pct) => Math.round(max * pct / 100 / 2.5) * 2.5;
const effort = (secs, pct) => secs / Math.cbrt(pct / 100);
function resolve(text, pbs) {
  return esc(text).replace(/\{(\d+(?:\.\d+)?)%\s+([^}\/]+?)\s*(?:\/(\d+)m)?\}/g, (m, p, name, per) => {
    name = name.trim().replace(/&amp;/g, '&');
    const def = BENCH[name]; if (!def) return m;
    const pb = pbs[name];
    if (pb == null) return `<span class="tok miss">${p}% ${esc(name)} (add your PB)</span>`;
    if (def.type === 'lift') return `<span class="tok"><b>${fmtKg(load(pb, +p))}</b><i>${p}% of ${fmtKg(pb)}</i></span>`;
    if (def.type === 'reps') return `<span class="tok"><b>${Math.max(1, Math.round(pb * p / 100))} reps</b><i>${p}% of ${pb}</i></span>`;
    const t = effort(pb, +p);
    if (per && def.dist) return `<span class="tok"><b>${fmtTime(t / def.dist * per)} /${per}m</b><i>${p}% of ${fmtTime(pb)}</i></span>`;
    return `<span class="tok"><b>${fmtTime(t)}</b><i>${p}% of ${fmtTime(pb)}</i></span>`;
  }).replace(/\n/g, '<br>');
}

// ---------- Scores ----------
const SCORE = {
  time: { label: 'Time', lowerWins: true, show: (v) => fmtTime(v) },
  rounds_reps: { label: 'Rounds and reps', show: (v) => `${Math.floor(v / 1000)}+${v % 1000}` },
  reps: { label: 'Reps', show: (v) => `${v} reps` },
  load: { label: 'Load in kg', show: (v) => fmtKg(v) },
  distance: { label: 'Distance in metres', show: (v) => `${v}m` },
};
function scoreInputs(type, v) {
  const f = (label, key, val, mode, ph = '') => `<label class="field"><span class="lab">${label}</span><input data-sc="${key}" inputmode="${mode}" placeholder="${ph}" value="${val}"></label>`;
  if (type === 'rounds_reps') return f('Rounds', 'a', v != null ? Math.floor(v / 1000) : '', 'numeric') + f('Reps', 'b', v != null ? v % 1000 : '', 'numeric');
  if (type === 'time') return f('Time (m:ss)', 'a', v != null ? fmtTime(v) : '', 'numeric', '7:21');
  return f(SCORE[type].label, 'a', v ?? '', 'decimal');
}
function readScore(type, form) {
  const a = $('[data-sc=a]', form).value.trim();
  if (type === 'rounds_reps') { const r = parseInt(a, 10), reps = parseInt($('[data-sc=b]', form).value || '0', 10); return Number.isFinite(r) && r >= 0 && reps >= 0 && reps < 1000 ? r * 1000 + reps : NaN; }
  if (type === 'time') return parseTime(a);
  return parseFloat(a.replace(/[^\d.]/g, ''));
}

// ---------- Sign in ----------
const authHash = new URLSearchParams(location.hash.slice(1));
const arrivedFromReset = authHash.get('type') === 'recovery';
const linkError = authHash.get('error_description');
let mode = 'signin', inRecovery = false;
const views = ['#login-view', '#reset-view', '#wait-view', '#app-view'];
const show = (id) => views.forEach((v) => ($(v).hidden = v !== id));
const signOut = async () => { await auth.signOut(); location.href = location.pathname; };

async function boot() {
  if (arrivedFromReset || inRecovery) return showReset();
  try { ME = await db.me($('#l-name').value.trim()); } catch (e) { return showLogin(nice(e.message)); }
  if (!ME) return showLogin(linkError ? 'That link has expired or was already used. Request a new one below.' : '');
  $('#signout').hidden = !!ME.demo; $('#signout').onclick = signOut;
  if (ME.status !== 'active') return showWait();
  show('#app-view');
  $('#site-link').hidden = ME.role !== 'admin'; if (ME.demo) $('#site-link').href = 'admin.html?demo';
  $('#demo-banner').hidden = !ME.demo;
  if (ME.demo) $('#demo-banner').innerHTML = `Demo mode: you are looking at the ${esc(ME.role)} view. Nothing is saved outside this browser. Switch to ${['member', 'coach', 'admin'].filter((r) => r !== ME.role).map((r) => `<a href="?demo=${r}">${r}</a>`).join(' or ')}.`;
  $('#who').textContent = ME.demo ? '' : `${ME.name || ME.email} · ${ME.role}`;
  [TRACKS] = await Promise.all([db.tracks(), loadBench()]);
  db.teamup('status').then((r) => { LINKED = !!r.linked; if (['training', 'book', 'account'].includes(TAB)) openTab(TAB); });
  drawTabs(); openTab(TAB);
}
function showLogin(msg) { show('#login-view'); if (msg) { $('#l-error').textContent = msg; $('#l-error').hidden = false; } }
async function showWait() {
  show('#wait-view');
  const blocked = ME.status === 'blocked';
  $('#wt-title').textContent = blocked ? 'Account paused' : 'Nearly there';
  $('#wt-text').textContent = blocked ? 'This account has been paused. Please speak to the gym.'
    : `You are signed in as ${ME.email}. Your account is waiting for TRI FIT to switch it on. You will be able to see the programming and book classes as soon as that is done.`;
  $('#wt-signout').onclick = signOut;
  const st = blocked ? { linked: false } : await db.teamup('status');
  $('#wt-check').hidden = !st.linked;
  $('#wt-check').onclick = async () => {
    $('#wt-check').disabled = true; const r = await db.teamup('sync'); $('#wt-check').disabled = false;
    if (r.active) return boot();
    $('#wt-msg').textContent = r.message || 'We could not find an active TeamUp membership for this email.'; $('#wt-msg').hidden = false;
  };
}
async function showReset() {
  inRecovery = true; show('#reset-view');
  try { const who = await auth.currentAdmin(); $('#r-email').textContent = who?.email || 'your account'; } catch { $('#r-email').textContent = 'your account'; }
  history.replaceState(null, '', location.pathname + location.search);
  $('#r-pass').focus();
}
auth.onPasswordRecovery(() => { if (!inRecovery) showReset(); });

function setMode(m) {
  mode = m; const up = m === 'signup', forgot = m === 'forgot';
  $('#l-title').textContent = up ? 'Create your account' : forgot ? 'Reset your password' : 'Member login';
  $('#l-submit').textContent = up ? 'Create account' : forgot ? 'Email me a reset link' : 'Sign in';
  $('#l-toggle').textContent = m === 'signin' ? 'New here? Create an account' : 'Back to sign in';
  $('#l-pass-field').hidden = forgot; $('#l-name-field').hidden = !up; $('#l-forgot').hidden = m !== 'signin'; $('#l-intro').hidden = m !== 'signin';
  $('#l-pass').autocomplete = up ? 'new-password' : 'current-password';
  $('#l-hint').hidden = !up; $('#l-error').hidden = true; $('#l-ok').hidden = true;
}
$('#l-toggle').onclick = () => setMode(mode === 'signin' ? 'signup' : 'signin');
$('#l-forgot').onclick = () => { setMode('forgot'); $('#l-email').focus(); };
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#l-error'), ok = $('#l-ok'); err.hidden = true; ok.hidden = true;
  const email = $('#l-email').value.trim(), pass = $('#l-pass').value, btn = $('#l-submit'); btn.disabled = true;
  try {
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Please enter your email address.');
    if (mode === 'forgot') {
      await auth.requestPasswordReset(email);
      ok.innerHTML = `If <strong>${esc(email)}</strong> has an account, a reset link is on its way. Check your inbox and spam, then follow the link to choose a new password.`; ok.hidden = false;
    } else if (mode === 'signup') {
      if (!$('#l-name').value.trim()) throw new Error('Please add your name.');
      if (pass.length < 8) throw new Error('Password must be at least 8 characters.');
      const { needsConfirm } = await auth.signUp(email, pass);
      if (needsConfirm) {
        try { localStorage.setItem('tf-pending-name', $('#l-name').value.trim()); } catch {}
        setMode('signin');
        ok.innerHTML = `Check <strong>${esc(email)}</strong> for a confirmation link, then sign in here. If nothing arrives, you may already have an account: use "Forgot password?" to set a new password.`; ok.hidden = false;
      } else await boot();
    } else { await auth.signIn(email, pass); try { $('#l-name').value = localStorage.getItem('tf-pending-name') || ''; localStorage.removeItem('tf-pending-name'); } catch {} await boot(); }
  } catch (ex) {
    const m = ex.message || 'Something went wrong';
    err.textContent = /confirm/i.test(m) ? 'Please click the confirmation link in your email first.'
      : /rate limit|too many|seconds/i.test(m) ? 'Too many requests just now. Please wait a minute and try again.'
      : /invalid login/i.test(m) ? 'Email or password is wrong. Use "Forgot password?" if you need a new one.' : nice(m);
    err.hidden = false;
  } finally { btn.disabled = false; }
});
$('#reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#r-error'); err.hidden = true;
  const p1 = $('#r-pass').value, p2 = $('#r-pass2').value;
  if (p1.length < 8) { err.textContent = 'Password must be at least 8 characters.'; err.hidden = false; return; }
  if (p1 !== p2) { err.textContent = "The two passwords don't match."; err.hidden = false; return; }
  const btn = $('#r-submit'); btn.disabled = true;
  try { await auth.updatePassword(p1); inRecovery = false; await boot(); flash('Password updated. You are signed in.'); }
  catch (ex) { err.textContent = /same|different/i.test(ex.message || '') ? 'Choose a password different from your old one.' : /session|expired|jwt/i.test(ex.message || '') ? 'This reset link has expired. Go back to the login page and request a new one.' : (ex.message || 'Could not save the new password.'); err.hidden = false; }
  finally { btn.disabled = false; }
});

// ---------- Tabs ----------
let TAB = 'training', WEEK = monday(), DAY = iso(new Date()), EDIT = null, PENDING = 0;
function tabList() {
  const t = [['training', 'Training'], ['book', 'Book'], ['pbs', 'PBs']];
  if (isStaff()) t.push(['programming', 'Programming']);
  if (ME.role === 'admin') t.push(['people', 'People'], ['programmes', 'Programmes']);
  t.push(['account', 'Account']);
  return t;
}
function drawTabs() {
  $('#tabs').innerHTML = tabList().map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${k === TAB ? 'active' : ''}">${l}${k === 'people' && PENDING ? `<span class="count">${PENDING}</span>` : ''}</button>`).join('');
}
$('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { EDIT = null; openTab(b.dataset.tab); } };
function flash(msg) { const f = $('#flash'); f.textContent = msg; f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => (f.hidden = true), 5000); }
async function openTab(k) {
  if (k === 'book' && matchMedia('(max-width:900px)').matches) k = 'training';
  TAB = k; drawTabs();
  $('#hello').textContent = Object.fromEntries(tabList())[k];
  const pane = $('#pane'); if (!pane.children.length) pane.innerHTML = '<p class="hint">Loading…</p>';
  try { await ({ training: trainingTab, book: bookTab, pbs: pbsTab, programming: programmingTab, people: peopleTab, programmes: programmesTab, account: accountTab }[k])(); }
  catch (e) { pane.innerHTML = `<p class="error">${esc(nice(e.message))}</p>`; }
  if (ME.role === 'admin' && k !== 'people') db.people().then((p) => { PENDING = p.filter((x) => x.status === 'pending').length; drawTabs(); }).catch(() => {});
}
function armed(btn) {
  if (btn.classList.contains('armed')) return true;
  btn.classList.add('armed'); btn.dataset.label = btn.textContent; btn.textContent = 'Sure?';
  setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; } }, 3500);
  return false;
}
const trackName = (id) => TRACKS.find((t) => t.id === id)?.name || 'Programme';
function weekNav(ws, strip = true) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(WEEK, i));
  return `<div class="weeknav"><button class="ib" data-week="-1" aria-label="Previous week">‹</button><b>Week of ${dayLabel(WEEK)}</b><button class="ib" data-week="1" aria-label="Next week">›</button>
    <button class="ib" data-week="0">This week</button></div>
    ${!strip ? '' : `<div class="daystrip">${days.map((d) => { const k = iso(d), n = ws.filter((w) => w.day === k).length; return `<button type="button" data-day="${k}" class="${n ? 'has' : ''}" aria-pressed="${k === DAY}"><b>${DAYS[(d.getDay() + 6) % 7].slice(0, 3)}</b><span>${d.getDate()}</span><em></em></button>`; }).join('')}</div>`}`;
}
function wireWeek(redraw) {
  $$('[data-week]').forEach((b) => (b.onclick = () => { const n = +b.dataset.week; WEEK = n ? addDays(WEEK, 7 * n) : monday(); DAY = n ? iso(WEEK) : iso(new Date()); redraw(); }));
  $$('[data-day]').forEach((b) => (b.onclick = () => { DAY = b.dataset.day; redraw(); }));
}
const inWeek = () => { if (DAY < iso(WEEK) || DAY > iso(addDays(WEEK, 6))) DAY = iso(WEEK); };

// ---------- Training ----------
// ---------- Classes and booking (shared by the day view and the week calendar) ----------
const nowHM = () => { const n = new Date(); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; };
const finished = (dayIso, start) => dayIso < iso(new Date()) || (dayIso === iso(new Date()) && start <= nowHM());
const classesOn = (cls, dayIso) => { const wd = ((parseDay(dayIso).getDay() + 6) % 7) + 1; return cls.filter((c) => c.day === wd); };
const PREVIEW_NOTE = 'TeamUp is not linked yet, so a booking here is a preview and holds no place. Use TeamUp for a real booking until the gym switches the link on.';
const bookState = (b) => (!b ? '' : b.status === 'booked' ? 'Booked' : b.status === 'failed' ? 'TeamUp did not accept this' : 'Preview booking');
function classRow(c, dayIso, mine) {
  const b = mine.find((x) => x.class_id === c.id && x.day === dayIso), past = finished(dayIso, c.start_time);
  return `<div class="rw cl ${b ? 'mine' : ''} ${past ? 'off' : ''}" data-class="${esc(c.id)}" data-day="${dayIso}"><span class="cltime">${t12(c.start_time)}</span>
    <div class="txt"><b>${esc(c.name)}${c.note ? ` <em class="pill">${esc(c.note)}</em>` : ''}</b><span>${esc([c.coach, bookState(b)].filter(Boolean).join(' · '))}</span></div>
    <div class="acts">${past ? '<span class="hint">Finished</span>' : b ? '<button class="ib" data-cancel>Cancel</button>' : '<button class="btn sm" data-book>Book</button>'}</div></div>`;
}
function wireBooking(root, mine, redraw) {
  if (!root) return;
  root.onclick = async (e) => {
    const el = e.target.closest('[data-class]'); if (!el) return;
    try {
      const bk = e.target.closest('[data-book]');
      if (bk) { bk.disabled = true; await db.book(el.dataset.class, el.dataset.day, LINKED); flash(LINKED ? 'Booked.' : 'Preview booking saved. No place is held in TeamUp yet.'); return redraw(); }
      if (e.target.closest('[data-cancel]')) { await db.cancelBooking(mine.find((x) => x.class_id === el.dataset.class && x.day === el.dataset.day), LINKED); return redraw(); }
    } catch (ex) { flash(nice(ex.message)); redraw(); }
  };
}

// ---------- Training: one day at a time ----------
// The programme switch starts on the first programme (TRI FIT classes). Others, such as HYROX,
// only show when chosen.
let ASMEMBER = false, TRACKSEL = null;
const pickTrack = (list) => (list.some((t) => t.id === TRACKSEL) ? TRACKSEL : (TRACKSEL = list[0]?.id || null));
const progChips = (list, sel, inert) => (list.length < 2 ? '' : `<div class="pchips" role="group" aria-label="Programme" ${inert ? 'inert' : ''}>${list.map((t) => `<button type="button" class="pchip" data-prog="${esc(t.id)}" aria-pressed="${t.id === sel}">${esc(t.name)}</button>`).join('')}</div>`);
const classList = (cls, dayIso, mine, inert) => { const rows = classesOn(cls, dayIso);
  return `<h3 class="dayhead">Classes</h3><div class="rows classlist" ${inert ? 'inert' : ''}>${rows.length ? rows.map((c) => classRow(c, dayIso, mine)).join('') : '<p class="hint">No classes on this day.</p>'}</div>`; };
async function trainingTab() {
  inWeek();
  const asM = isStaff() && ASMEMBER, from = iso(WEEK);
  const [all, cls, mine] = await Promise.all([db.workouts(from, iso(addDays(WEEK, 6))), db.classes(), db.myBookings(from)]);
  const tracks = TRACKS.filter((t) => !asM || t.audience !== 'coaches'), sel = pickTrack(tracks);
  const ws = all.filter((w) => w.track_id === sel && (!asM || w.published)), today = ws.filter((w) => w.day === DAY);
  const boards = await Promise.all(today.map((w) => (w.tracked ? db.leaderboard(w.id) : [])));
  const cards = today.length ? today.map((w, i) => workoutCard(w, boards[i], { asMember: asM })).join('')
    : `<p class="hint">Nothing programmed for ${esc(trackName(sel))} on this day${isStaff() && !asM ? '. Add a session from the Programming tab.' : ' yet.'}</p>`;
  const classes = classList(cls, DAY, mine) + (LINKED ? '' : `<p class="hint">${PREVIEW_NOTE}</p>`);
  const head = isStaff() ? `<div class="formrow" style="justify-content:space-between;margin-bottom:12px"><h3 class="dayhead" style="margin:0">${dayLabel(parseDay(DAY), true)}</h3>
      <button class="ib" id="as-member" aria-pressed="${asM}">${asM ? 'Back to coach view' : 'See this day as a member'}</button></div>` : `<h3 class="dayhead">${dayLabel(parseDay(DAY), true)}</h3>`;
  $('#pane').innerHTML = weekNav(ws) + head + (asM
    ? `<p class="hint" style="margin-bottom:12px">Member view on a phone: published sessions only, no coach notes, with your own PBs filling in the numbers.</p>${phone(progChips(tracks, sel) + cards + classes, dayLabel(parseDay(DAY), true))}`
    : `${progChips(tracks, sel)}<div class="daycols"><div class="stackcol">${cards}</div><div class="stackcol">${classes}</div></div>`);
  wireWeek(trainingTab);
  if ($('#as-member')) $('#as-member').onclick = () => { ASMEMBER = !ASMEMBER; trainingTab(); };
  $$('[data-prog]').forEach((b) => (b.onclick = () => { TRACKSEL = b.dataset.prog; trainingTab(); }));
  wireBooking($('.classlist'), mine, trainingTab);
  today.forEach((w, i) => wireWorkout(w, boards[i]));
}
// A phone-sized frame showing what the app looks like to a member.
function phone(inner, sub = '') {
  return `<div class="phone"><div class="phone-top"><img src="img/logo.png" alt=""><span><b>TRI FIT</b><small>${esc(sub)}</small></span></div><div class="phone-screen">${inner}</div>
    <div class="phone-tabs" aria-hidden="true"><span class="on">Training</span><span>PBs</span><span>Account</span></div></div>`;
}
const SAMPLE_PBS = { 'Back Squat': 90, 'Front Squat': 75, 'Deadlift': 120, 'Clean & Jerk': 62.5, 'Snatch': 47.5, 'Strict Press': 42.5, 'Bench Press': 65, '2k Row': 470, '500m Row': 104, '5k Row': 1260, '1k Ski': 245, '1k Run': 275, '5k Run': 1560 };
function rank(rows, type) {
  const dir = SCORE[type].lowerWins ? 1 : -1;
  return rows.slice().sort((a, b) => (b.rx - a.rx) || dir * (a.value - b.value));
}
function workoutCard(w, board, opt = {}) {
  const staffView = isStaff() && !opt.asMember, pbs = opt.pbs || PBS;
  const mine = board.find((r) => r.is_me), sc = SCORE[w.score_type], pub = rank(board.filter((r) => r.is_public), w.score_type);
  return `<article class="panel wk" data-w="${esc(w.id)}">
    <div class="formrow" style="justify-content:space-between"><span class="tag">${esc(trackName(w.track_id))}</span>
      <span class="formrow">${w.published ? '' : '<span class="tag out">Draft</span>'}${w.tracked ? '<span class="tag out">Tracked</span>' : ''}${staffView ? '<button class="ib" data-editw>Edit</button>' : ''}</span></div>
    <h3 class="wtitle">${esc(w.title)}</h3>
    <p class="wbody">${resolve(w.body, pbs)}</p>
    ${staffView && w.notes ? `<p class="coachnote"><b>Coach notes.</b> ${esc(w.notes).replace(/\n/g, '<br>')}</p>` : ''}
    ${w.tracked ? `<div class="scorebox" ${opt.inert ? 'inert' : ''}>
      ${mine ? `<div class="formrow" style="justify-content:space-between"><div><span class="lab">Your score</span><div class="myscore">${sc.show(mine.value)} <small>${mine.rx ? 'Rx' : 'Scaled'} · ${mine.is_public ? 'on the leaderboard' : 'private, only you can see it'}</small></div></div>
          <span class="formrow"><button class="ib" data-rescore>Change</button><button class="ib" data-unscore>Remove</button></span></div>` : ''}
      <form class="scoreform" ${mine ? 'hidden' : ''} novalidate>
        <span class="lab" style="width:100%">${mine ? 'Change your score' : 'Log your score'}</span>
        ${scoreInputs(w.score_type, mine?.value)}
        <label class="field"><span class="lab">Level</span><select data-sc="rx"><option value="1" ${!mine || mine.rx ? 'selected' : ''}>Rx</option><option value="0" ${mine && !mine.rx ? 'selected' : ''}>Scaled</option></select></label>
        <label class="check" style="width:100%"><input type="checkbox" data-sc="pub" ${(mine ? mine.is_public : ME.board_default) ? 'checked' : ''}> Show this score on the leaderboard</label>
        <button class="btn sm" type="submit">Save score</button><p class="error" hidden role="alert" style="width:100%"></p>
      </form>
      <div class="lb"><span class="lab">Leaderboard${pub.length ? ` · ${pub.length}` : ''}</span>
        ${pub.length ? pub.map((r, i) => `<div class="lbrow ${r.is_me ? 'you' : ''}"><span class="rk">${i + 1}</span><span class="nm"><b>${esc(r.name)}${r.is_me ? ' (you)' : ''}</b><small>${r.rx ? 'Rx' : 'Scaled'}</small></span><span class="sc">${sc.show(r.value)}</span>
          <button type="button" class="five" data-five="${esc(r.score_id)}" aria-pressed="${r.i_fived}" ${r.is_me ? 'disabled' : ''} aria-label="High five ${esc(r.name)}">🙌 ${r.fives}</button></div>`).join('')
          : '<p class="hint">No scores on the board yet. Only scores people choose to share appear here.</p>'}</div></div>` : ''}
  </article>`;
}
function wireWorkout(w, board) {
  const card = $(`[data-w="${CSS.escape(w.id)}"]`), mine = board.find((r) => r.is_me);
  $('[data-editw]', card)?.addEventListener('click', () => { EDIT = w.id; openTab('programming'); });
  if (!w.tracked) return;
  const form = $('.scoreform', card);
  $('[data-rescore]', card)?.addEventListener('click', () => { form.hidden = false; $('[data-sc=a]', form).focus(); });
  $('[data-unscore]', card)?.addEventListener('click', async (e) => { if (armed(e.currentTarget)) { await db.deleteScore(mine.score_id); trainingTab(); } });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('.error', form), v = readScore(w.score_type, form); err.hidden = true;
    if (!Number.isFinite(v) || v < 0) { err.textContent = w.score_type === 'time' ? 'Enter your time as m:ss, for example 7:21.' : 'Enter your score as a number.'; err.hidden = false; return; }
    try { await db.saveScore({ workout_id: w.id, value: v, rx: $('[data-sc=rx]', form).value === '1', isPublic: $('[data-sc=pub]', form).checked }); flash($('[data-sc=pub]', form).checked ? 'Score saved and added to the leaderboard.' : 'Score saved. Only you can see it.'); trainingTab(); }
    catch (ex) { err.textContent = nice(ex.message); err.hidden = false; }
  };
  $$('[data-five]', card).forEach((b) => (b.onclick = async () => { await db.toggleFive(b.dataset.five); trainingTab(); }));
}

// ---------- Programming (coaches and admins) ----------
async function programmingTab() {
  inWeek();
  const [ws, pcls] = await Promise.all([db.workouts(iso(WEEK), iso(addDays(WEEK, 6))), db.classes()]), editing = ws.find((w) => w.id === EDIT) || null;
  const w = editing || { day: DAY, track_id: TRACKS[0]?.id, title: '', body: '', notes: '', tracked: false, score_type: 'time', published: true };
  const tokens = DEFS.map((d) => `{80% ${d.name}${d.kind === 'time' && d.distance_m && d.distance_m !== 500 && /row|ski|bike|erg/i.test(d.name) ? ' /500m' : ''}}`);
  $('#pane').innerHTML = weekNav(ws) + `<div class="split three">
    <div class="rows">${ws.length ? [...new Set(ws.map((x) => x.day))].map((d) => `<h3>${dayLabel(parseDay(d), true)}</h3>` + ws.filter((x) => x.day === d).map((x) => `<div class="rw ${x.published ? '' : 'off'} ${editing?.id === x.id ? 'editing' : ''}" data-id="${esc(x.id)}">
        <div class="txt"><b>${esc(x.title)}</b><span>${esc(trackName(x.track_id))}${x.tracked ? ' · tracked' : ''}${x.published ? '' : ' · draft'}</span></div>
        <div class="acts"><button class="ib" data-copy title="Copy to the same day next week">Copy +7</button><button class="ib" data-edit>Edit</button><button class="ib" data-del>Delete</button></div></div>`).join('')).join('')
      : '<p class="hint">Nothing programmed this week yet. Add the first session with the form.</p>'}</div>
    <form class="panel" id="w-form" novalidate>
      <h2 style="font-size:21px">${editing ? 'Edit session' : 'Add a session'}</h2>
      <div class="two"><div class="field"><label for="w-day">Date</label><input id="w-day" type="date" value="${esc(w.day)}" required></div>
        <div class="field"><label for="w-track">Programme</label><select id="w-track">${TRACKS.map((t) => `<option value="${esc(t.id)}" ${t.id === w.track_id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div></div>
      <div class="field"><label for="w-title">Title</label><input id="w-title" maxlength="100" value="${esc(w.title)}" required></div>
      <div class="field"><label for="w-body">Session</label><textarea id="w-body" rows="7" maxlength="4000" placeholder="A. Back squat 5 x 3 @ {80% Back Squat}">${esc(w.body)}</textarea>
        <div class="chips">${tokens.map((t) => `<button type="button" class="chip" data-tok="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <p class="hint">Percentages in curly brackets turn into each member's own load, reps or split from their PBs. Change the 80 to whatever you need.</p></div>
      <div class="field"><label for="w-notes">Coach notes <span class="opt">only coaches see these</span></label><textarea id="w-notes" rows="3" maxlength="3000">${esc(w.notes || '')}</textarea></div>
      <label class="check"><input type="checkbox" id="w-tracked" ${w.tracked ? 'checked' : ''}> Tracked: members can record a score and choose whether it goes on the leaderboard</label>
      <div class="field" id="w-type-field"><label for="w-type">Scored by</label><select id="w-type">${Object.entries(SCORE).map(([k, v]) => `<option value="${k}" ${k === w.score_type ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" id="w-pub" ${w.published ? 'checked' : ''}> Published: members can see it</label>
      <div class="formrow"><button class="btn" type="submit" id="w-save">${editing ? 'Save changes' : 'Add session'}</button>${editing ? '<button class="btn ghost" type="button" id="w-cancel">Cancel</button>' : ''}</div>
      <p class="error" id="w-error" hidden role="alert"></p>
    </form>
    <div class="pvcol"><div class="formrow" style="justify-content:space-between;margin-bottom:10px"><span class="lab">What members see in the app</span>
        <select id="w-pv-as" aria-label="Whose numbers to show" style="width:auto"><option value="me">With my PBs</option><option value="sample">A sample member</option><option value="none">A member with no PBs yet</option></select></div>
      <div id="w-prev"></div>
      <p class="hint" style="margin-top:10px">Updates as you type. Coach notes never appear here. A draft is shown as it will look once published.</p></div></div>`;
  wireWeek(() => { EDIT = null; programmingTab(); });
  const form = $('#w-form'), body = $('#w-body');
  const prev = () => {
    const as = $('#w-pv-as').value, pbs = as === 'me' ? PBS : as === 'sample' ? SAMPLE_PBS : {}, day = $('#w-day').value;
    const draft = { id: 'preview', track_id: $('#w-track').value, day, title: $('#w-title').value.trim() || 'Session title', body: body.value.trim() || 'Your session text appears here.', tracked: $('#w-tracked').checked, score_type: $('#w-type').value, published: true };
    const okDay = /^\d{4}-\d{2}-\d{2}$/.test(day), memberTracks = TRACKS.filter((t) => t.audience !== 'coaches');
    $('#w-prev').innerHTML = phone(progChips(memberTracks, draft.track_id, true) + workoutCard(draft, [], { asMember: true, pbs, inert: true }) + (okDay ? classList(pcls, day, [], true) : ''), okDay ? dayLabel(parseDay(day), true) : 'Training');
  };
  const typeVis = () => ($('#w-type-field').hidden = !$('#w-tracked').checked);
  form.addEventListener('input', prev); form.addEventListener('change', () => { typeVis(); prev(); }); $('#w-pv-as').onchange = prev; typeVis(); prev();
  $$('[data-tok]', form).forEach((b) => (b.onclick = () => { const s = body.selectionStart ?? body.value.length; body.setRangeText(b.dataset.tok, s, body.selectionEnd ?? s, 'end'); body.focus(); prev(); }));
  if (editing) { $('#w-cancel').onclick = () => { EDIT = null; programmingTab(); }; if (matchMedia('(max-width:900px)').matches) form.scrollIntoView({ block: 'start' }); }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#w-error'); err.hidden = true;
    const row = { day: $('#w-day').value, track_id: $('#w-track').value, title: $('#w-title').value.trim(), body: body.value.trim(), notes: $('#w-notes').value.trim(), tracked: $('#w-tracked').checked, score_type: $('#w-type').value, published: $('#w-pub').checked };
    if (editing) row.id = editing.id;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day)) { err.textContent = 'Please choose a date.'; err.hidden = false; return; }
    if (!row.track_id) { err.textContent = 'Add a programme first, on the Programmes tab.'; err.hidden = false; return; }
    if (!row.title) { err.textContent = 'Please give the session a title.'; err.hidden = false; $('#w-title').focus(); return; }
    try { await db.saveWorkout(row); EDIT = null; WEEK = monday(parseDay(row.day)); DAY = row.day; flash(row.published ? 'Saved. Members can see it now.' : 'Saved as a draft.'); programmingTab(); }
    catch (ex) { err.textContent = nice(ex.message); err.hidden = false; }
  };
  $('.rows').onclick = async (e) => {
    const rw = e.target.closest('.rw'); if (!rw) return; const x = ws.find((r) => r.id === rw.dataset.id);
    try {
      if (e.target.closest('[data-edit]')) { EDIT = x.id; return programmingTab(); }
      if (e.target.closest('[data-copy]')) { const { id, created_at, created_by, ...copy } = x; await db.saveWorkout({ ...copy, day: iso(addDays(parseDay(x.day), 7)), published: false }); return flash('Copied to next week as a draft.'); }
      const del = e.target.closest('[data-del]');
      if (del && armed(del)) { await db.deleteWorkout(x.id); EDIT = null; flash('Deleted.'); return programmingTab(); }
    } catch (ex) { flash(nice(ex.message)); }
  };
}

// ---------- Book: the week as a calendar (web layout) ----------
// On a phone this tab is not shown: the Training day view carries that day's classes instead.
async function bookTab() {
  const from = iso(WEEK), todayIso = iso(new Date());
  const [cls, mine] = await Promise.all([db.classes(), db.myBookings(from)]);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(WEEK, i)).filter((d, i) => i < 6 || cls.some((c) => c.day === 7));
  const slot = (c, k) => { const b = mine.find((x) => x.class_id === c.id && x.day === k), past = finished(k, c.start_time);
    return `<div class="slot ${b ? 'mine' : ''} ${past ? 'off' : ''}" data-class="${esc(c.id)}" data-day="${k}"><span class="t">${t12(c.start_time)}</span>
      <span class="n">${esc(c.name)}${c.note ? ` <em>${esc(c.note)}</em>` : ''}</span><span class="c">${esc(c.coach || '')}</span>${b ? `<span class="st">${bookState(b)}</span>` : ''}
      ${past ? '<span class="c">Finished</span>' : b ? '<button class="ib" data-cancel>Cancel</button>' : '<button class="btn sm" data-book>Book</button>'}</div>`; };
  $('#pane').innerHTML = weekNav([], false) + (LINKED ? '' : `<p class="banner">${PREVIEW_NOTE}</p>`) +
    `<div class="week cal" style="--cols:${days.length}">${days.map((d) => { const k = iso(d), rows = classesOn(cls, k);
      return `<div class="day ${k === todayIso ? 'today' : ''}"><h3>${DAYS[(d.getDay() + 6) % 7].slice(0, 3)} ${d.getDate()}${k === todayIso ? ' · today' : ''}</h3>${rows.length ? rows.map((c) => slot(c, k)).join('') : '<p class="rest">No classes</p>'}</div>`; }).join('')}</div>`;
  wireWeek(bookTab);
  wireBooking($('.cal'), mine, bookTab);
}

// ---------- PBs ----------
// Each tracked lift or test keeps every dated result, so a member can see how far they have come.
let PBSEL = null;
const KIND = { lift: 'Lifts', time: 'Timed tests', reps: 'Max reps' };
const showVal = (def, v) => (def.type === 'lift' ? fmtKg(v) : def.type === 'time' ? fmtTime(v) : `${parseFloat((+v).toFixed(1))} reps`);
const shortDay = (d) => parseDay(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
// Improvement from one result to another, as a percentage: heavier, more, or faster.
const gain = (def, from, to) => (def.type === 'time' ? (from - to) / from : (to - from) / from) * 100;
const pct = (g) => `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(1)}%`;
function trend(def, entries, big) {
  if (entries.length < 2) return '';
  const W = big ? 560 : 120, H = big ? 150 : 34, pad = big ? 18 : 4, t0 = parseDay(entries[0].day).getTime(), t1 = parseDay(entries.at(-1).day).getTime();
  const vs = entries.map((e) => e.value), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const x = (e, i) => pad + (t1 > t0 ? (parseDay(e.day).getTime() - t0) / (t1 - t0) : i / (entries.length - 1)) * (W - 2 * pad);
  const y = (v) => { const r = (v - lo) / span; return pad + (def.type === 'time' ? r : 1 - r) * (H - 2 * pad - (big ? 16 : 0)); }; // better is always higher on the chart
  const pts = entries.map((e, i) => [x(e, i), y(e.value)]), best = PBS[entries[0].name];
  return `<svg class="trend ${big ? 'big' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Results over time">
    <polyline points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#fff" stroke-width="${big ? 2 : 1.5}" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${big ? 4.5 : 2.5}" fill="${entries[i].value === best ? '#f0c02c' : '#fff'}" stroke="#000" stroke-width="${big ? 1.5 : 0}"/>`).join('')}
    ${big ? `<text x="${pad}" y="${H - 3}">${shortDay(entries[0].day)} · ${showVal(def, entries[0].value)}</text><text x="${W - pad}" y="${H - 3}" text-anchor="end">${shortDay(entries.at(-1).day)} · ${showVal(def, entries.at(-1).value)}</text>` : ''}</svg>`;
}
async function pbsTab() {
  await loadBench();
  const today = iso(new Date());
  const row = (d) => {
    const def = BENCH[d.name], es = LOG.filter((e) => e.name === d.name), best = PBS[d.name], open = PBSEL === d.name, g = es.length > 1 ? gain(def, es[0].value, best) : null;
    return `<div class="pb ${open ? 'open' : ''}" data-name="${esc(d.name)}">
      <button type="button" class="pbhead" aria-expanded="${open}">
        <span class="txt"><b>${esc(d.name)}</b><span>${es.length ? (g != null ? `${pct(g)} since ${shortDay(es[0].day)} · ${es.length} results` : `First result ${shortDay(es[0].day)}`) : 'No result yet'}</span></span>
        ${trend(def, es, false)}
        <span class="pbval">${best != null ? showVal(def, best) : '—'}${best != null && def.type === 'time' && def.dist && def.dist !== 500 ? `<small>${fmtTime(best / def.dist * 500)} /500m</small>` : ''}</span></button>
      ${open ? `<div class="pbbody">
        ${g != null ? `<p class="pbgain"><b>${pct(g)}</b> ${def.type === 'time' ? 'faster' : def.type === 'lift' ? 'heavier' : 'more'} than your first result (${showVal(def, es[0].value)} on ${shortDay(es[0].day)}).</p>` : ''}
        ${trend(def, es, true)}
        <form class="scoreform pbadd" novalidate><label class="field"><span class="lab">${def.type === 'lift' ? 'Weight in kg' : def.type === 'time' ? 'Time (m:ss)' : 'Reps'}</span><input data-v inputmode="${def.type === 'time' ? 'numeric' : 'decimal'}" placeholder="${def.type === 'time' ? '7:21' : ''}"></label>
          <label class="field" style="width:160px"><span class="lab">Date</span><input data-d type="date" value="${today}" max="${today}"></label>
          <button class="btn sm" type="submit">Add result</button><p class="error" hidden role="alert" style="width:100%"></p></form>
        ${es.length ? `<div class="lb">${es.slice().reverse().map((e) => `<div class="lbrow" style="grid-template-columns:minmax(0,1fr) auto auto auto"><span class="nm"><b>${shortDay(e.day)}</b></span><span class="hint">${e === es[0] ? 'first' : pct(gain(def, es[0].value, e.value))}</span>
          <span class="sc">${showVal(def, e.value)}${e.value === best ? ' <span class="tag">PB</span>' : ''}</span><button type="button" class="ib" data-del="${esc(e.id)}">Delete</button></div>`).join('')}</div>` : ''}</div>` : ''}</div>`;
  };
  $('#pane').innerHTML = `<p class="hint" style="margin-bottom:16px">Your results are private. The best one for each lift or test is your PB, and it turns the percentages in the programming into your own numbers. Tap one to add a result or see your history.</p>
    <div class="pbs">${Object.keys(KIND).map((k) => { const ds = DEFS.filter((d) => d.kind === k); return ds.length ? `<h3 class="dayhead" style="margin-top:18px">${KIND[k]}</h3>${ds.map(row).join('')}` : ''; }).join('') || '<p class="hint">Nothing is being tracked yet.</p>'}</div>
    ${isStaff() ? `<h3 class="grp" style="margin-top:34px">Tracked lifts and tests (coaches)</h3>
      <p class="hint" style="margin:10px 0 14px">This list is what every member can log and what you can use in programming, written as {80% Name}. Removing one hides it from members; their results are kept and come back if you add the same name again.</p>
      <div class="split"><div class="rows">${DEFS.map((d) => `<div class="rw" data-def="${esc(d.id)}"><div class="txt"><b>${esc(d.name)}</b><span>${d.kind === 'lift' ? 'Lift, in kg' : d.kind === 'time' ? `Timed test${d.distance_m ? `, ${d.distance_m}m` : ''}` : 'Max reps'}</span></div><div class="acts"><button class="ib" data-deldef>Remove</button></div></div>`).join('')}</div>
        <form class="panel" id="def-form" novalidate><h2 style="font-size:21px">Add a lift or test</h2>
          <div class="field"><label for="d-name">Name</label><input id="d-name" maxlength="40" placeholder="Thruster, 400m Run, Max pull-ups"></div>
          <div class="field"><label for="d-kind">Measured as</label><select id="d-kind"><option value="lift">Lift, in kg (heavier is better)</option><option value="time">Timed test (faster is better)</option><option value="reps">Max reps (more is better)</option></select></div>
          <div class="field" id="d-dist-field" hidden><label for="d-dist">Distance in metres <span class="opt">optional, for pace per 500m</span></label><input id="d-dist" inputmode="numeric" placeholder="2000"></div>
          <div class="formrow"><button class="btn" type="submit">Add to the list</button></div><p class="error" id="d-error" hidden role="alert"></p></form></div>` : ''}`;

  $('.pbs').onclick = async (e) => {
    const box = e.target.closest('.pb'); if (!box) return;
    if (e.target.closest('.pbhead')) { PBSEL = PBSEL === box.dataset.name ? null : box.dataset.name; return pbsTab(); }
    const del = e.target.closest('[data-del]');
    if (del && armed(del)) { await db.deleteBenchEntry(del.dataset.del); pbsTab(); }
  };
  const add = $('.pbadd');
  if (add) add.onsubmit = async (e) => {
    e.preventDefault();
    const name = add.closest('.pb').dataset.name, def = BENCH[name], err = $('.error', add), raw = $('[data-v]', add).value.trim(), day = $('[data-d]', add).value; err.hidden = true;
    const v = def.type === 'time' ? parseTime(raw) : parseFloat(raw.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(v) || v <= 0) { err.textContent = def.type === 'time' ? 'Enter the time as m:ss, for example 7:21.' : 'Enter a number.'; err.hidden = false; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) { err.textContent = 'Choose a date that is today or earlier.'; err.hidden = false; return; }
    const before = PBS[name];
    try { await db.addBenchEntry(name, v, day); flash(before == null ? 'First result saved.' : better(def.type)(v, before) ? `New PB: ${pct(gain(def, before, v))} on your previous best.` : 'Result saved. Your PB is unchanged.'); pbsTab(); }
    catch (ex) { err.textContent = nice(ex.message); err.hidden = false; }
  };
  const df = $('#def-form');
  if (df) {
    $('#d-kind').onchange = () => ($('#d-dist-field').hidden = $('#d-kind').value !== 'time');
    df.onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#d-error'), name = $('#d-name').value.trim().replace(/\s+/g, ' '), kind = $('#d-kind').value, dist = parseInt($('#d-dist').value, 10); err.hidden = true;
      if (!name) { err.textContent = 'Please give it a name.'; err.hidden = false; return; }
      if (/[{}\/%]/.test(name)) { err.textContent = 'The name cannot contain { } / or %.'; err.hidden = false; return; }
      if (DEFS.some((d) => d.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'That name is already on the list.'; err.hidden = false; return; }
      try { await db.saveBenchDef({ name, kind, distance_m: kind === 'time' && dist > 0 ? dist : null }); flash(`${name} added. Members can log it now.`); pbsTab(); }
      catch (ex) { err.textContent = nice(ex.message); err.hidden = false; }
    };
    $('.split .rows').onclick = async (e) => { const del = e.target.closest('[data-deldef]'); if (del && armed(del)) { await db.deleteBenchDef(del.closest('.rw').dataset.def); flash('Removed from the list.'); pbsTab(); } };
  }
}

// ---------- Account ----------
async function accountTab() {
  $('#pane').innerHTML = `<form class="panel" id="acc-form" novalidate style="max-width:560px">
    <div class="field"><label for="a-name">Name shown on the leaderboard</label><input id="a-name" maxlength="80" value="${esc(ME.name || '')}"></div>
    <label class="check"><input type="checkbox" id="a-board" ${ME.board_default ? 'checked' : ''}> Tick "show on the leaderboard" for me by default</label>
    <p class="hint">You still choose each time you log a score. Unticked scores stay private to you.</p>
    <div class="formrow"><button class="btn" type="submit">Save</button></div>
    <h3 class="grp">Membership</h3>
    <p>${ME.teamup_plan ? `${esc(ME.teamup_plan)}${ME.teamup_status ? ` · ${esc(ME.teamup_status)}` : ''}` : LINKED ? 'Not checked yet.' : 'TeamUp is not linked to this site yet, so your membership is not shown here.'}</p>
    ${LINKED ? '<div class="formrow"><button class="btn ghost sm" type="button" id="a-sync">Check my TeamUp membership</button></div>' : ''}
    <p class="hint">Signed in as ${esc(ME.email)}.</p></form>`;
  $('#acc-form').onsubmit = async (e) => { e.preventDefault(); try { await db.updateMe($('#a-name').value.trim(), $('#a-board').checked); ME = await db.me(); $('#who').textContent = ME.demo ? '' : `${ME.name || ME.email} · ${ME.role}`; flash('Saved.'); } catch (ex) { flash(nice(ex.message)); } };
  $('#a-sync')?.addEventListener('click', async (e) => { e.target.disabled = true; const r = await db.teamup('sync'); ME = await db.me(); flash(r.message || (r.active ? 'Membership found.' : 'No active membership found for this email.')); accountTab(); });
}

// ---------- People (admins) ----------
async function peopleTab() {
  const [rows, all] = await Promise.all([db.people(), db.tracks()]);
  const sel = all.filter((t) => t.audience === 'selected');
  PENDING = rows.filter((p) => p.status === 'pending').length; drawTabs();
  const order = { pending: 0, active: 1, blocked: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status]);
  $('#pane').innerHTML = `<p class="hint" style="margin-bottom:16px">Everyone who has created an account. Switch people on, make someone a coach, pause an account, and choose who sees the selected-only programmes. Website admins are managed under Website content → Admins.</p>
    <div class="rows">${rows.length ? rows.map((p) => `<div class="rw person ${p.status === 'blocked' ? 'off' : ''} ${p.status === 'pending' ? 'editing' : ''}" data-id="${esc(p.user_id)}">
      <div class="txt"><b>${esc(p.name || p.email)}</b><span>${esc(p.email)}${p.teamup_plan ? ` · TeamUp: ${esc(p.teamup_plan)}` : ''}</span></div>
      <div class="acts">
        <select data-role aria-label="Role"><option value="member" ${p.role === 'member' ? 'selected' : ''}>Member</option><option value="coach" ${p.role === 'coach' ? 'selected' : ''}>Coach</option></select>
        <select data-status aria-label="Status"><option value="pending" ${p.status === 'pending' ? 'selected' : ''}>Waiting</option><option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option><option value="blocked" ${p.status === 'blocked' ? 'selected' : ''}>Paused</option></select>
        ${sel.map((t) => `<label class="check sm"><input type="checkbox" data-track="${esc(t.id)}" ${p.tracks.includes(t.id) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('')}
        <button class="ib" data-save>Save</button>${p.status === 'pending' ? '<button class="btn sm" data-activate>Switch on</button>' : ''}</div></div>`).join('')
      : '<p class="hint">Nobody has created an account yet. Send people to this page and ask them to choose "Create an account".</p>'}</div>`;
  $('.rows').onclick = async (e) => {
    const rw = e.target.closest('.rw'); if (!rw || !e.target.closest('[data-save],[data-activate]')) return;
    const status = e.target.closest('[data-activate]') ? 'active' : $('[data-status]', rw).value;
    try { await db.setPerson(rw.dataset.id, $('[data-role]', rw).value, status, $$('[data-track]:checked', rw).map((c) => c.dataset.track)); flash('Saved.'); peopleTab(); } catch (ex) { flash(nice(ex.message)); }
  };
}

// ---------- Programmes (admins) ----------
const AUD = { members: 'Every active member', selected: 'Only people you tick on the People tab', coaches: 'Coaches and admins only' };
async function programmesTab(editId = null) {
  TRACKS = await db.tracks();
  const editing = TRACKS.find((t) => t.id === editId) || null;
  $('#pane').innerHTML = `<p class="hint" style="margin-bottom:16px">A programme is a stream of sessions, such as the class programme or HYROX. Who can see each one is set here.</p><div class="split">
    <div class="rows">${TRACKS.map((t) => `<div class="rw ${editing?.id === t.id ? 'editing' : ''}" data-id="${esc(t.id)}"><div class="txt"><b>${esc(t.name)}</b><span>${AUD[t.audience]}</span></div>
      <div class="acts"><button class="ib" data-edit>Edit</button><button class="ib" data-del>Delete</button></div></div>`).join('') || '<p class="hint">No programmes yet.</p>'}</div>
    <form class="panel" id="t-form" novalidate><h2 style="font-size:21px">${editing ? 'Edit programme' : 'Add a programme'}</h2>
      <div class="field"><label for="t-name">Name</label><input id="t-name" maxlength="60" value="${esc(editing?.name || '')}" required></div>
      <div class="field"><label for="t-aud">Who can see it</label><select id="t-aud">${Object.entries(AUD).map(([k, v]) => `<option value="${k}" ${k === (editing?.audience || 'members') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="formrow"><button class="btn" type="submit">${editing ? 'Save changes' : 'Add programme'}</button>${editing ? '<button class="btn ghost" type="button" id="t-cancel">Cancel</button>' : ''}</div>
      <p class="error" id="t-error" hidden role="alert"></p></form></div>`;
  if (editing) $('#t-cancel').onclick = () => programmesTab();
  $('#t-form').onsubmit = async (e) => {
    e.preventDefault(); const err = $('#t-error'), name = $('#t-name').value.trim(); err.hidden = true;
    if (!name) { err.textContent = 'Please give the programme a name.'; err.hidden = false; return; }
    try { await db.saveTrack({ ...(editing ? { id: editing.id } : {}), name, audience: $('#t-aud').value }); flash('Saved.'); programmesTab(); } catch (ex) { err.textContent = nice(ex.message); err.hidden = false; }
  };
  $('.rows').onclick = async (e) => {
    const rw = e.target.closest('.rw'); if (!rw) return;
    try {
      if (e.target.closest('[data-edit]')) return programmesTab(rw.dataset.id);
      const del = e.target.closest('[data-del]');
      if (del) { if (!del.classList.contains('armed')) flash('Deleting a programme also deletes its sessions and scores.'); if (armed(del)) { await db.deleteTrack(rw.dataset.id); flash('Deleted.'); programmesTab(); } }
    } catch (ex) { flash(nice(ex.message)); }
  };
}

boot();
