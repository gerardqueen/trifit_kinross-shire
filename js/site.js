// Public landing page: draws the timetable, coaches, memberships and programming from the
// database (or the built-in content), and sends the enquiry form.
import { loadSite, sendEnquiry } from './data.js';
import { DAYS } from './defaults.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t12 = (t) => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`; };
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const CACHE = 'tf-site-cache-v1';

let SITE = null;
let DAY = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d; })();

function draw(site) {
  SITE = site;
  const s = site.settings;
  $$('[data-s]').forEach((el) => { const v = s[el.dataset.s]; el.textContent = v || ''; el.hidden = !v; });
  $$('[data-s-href]').forEach((el) => { const u = safeUrl(s[el.dataset.sHref]); el.hidden = !u; if (u) el.href = u; });
  $$('[data-teamup]').forEach((el) => { const u = safeUrl(s.teamup); el.hidden = !u; if (u) el.href = u; });
  const art = $('#hero-art'), hero = safeUrl(s.hero_image) || (/^data:image\//.test(s.hero_image || '') ? s.hero_image : '');
  art.classList.toggle('photo', !!hero);
  art.innerHTML = hero ? `<img src="${esc(hero)}" alt="Training at TRI FIT Kinross-shire">` : `<img src="img/logo.png" alt="TRI FIT logo: a triangle with Conditioning, Strength and Movement on its sides" width="360" height="357">`;

  // At a glance
  const coachCount = site.coaches.length, classCount = site.classes.length;
  $('#facts').innerHTML = [
    classCount ? [classCount, 'coached classes a week'] : null,
    coachCount ? [coachCount, 'coaches on the floor'] : null,
    ['HYROX', 'official affiliate'],
  ].filter(Boolean).map(([b, t]) => `<li><b>${esc(b)}</b><span>${esc(t)}</span></li>`).join('');

  drawWeek(); drawCoaches(); drawPlans(); drawProgramming(); drawContact();
}

function drawWeek() {
  const used = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 6 || SITE.classes.some((c) => c.day === 7));
  if (!used.includes(DAY)) DAY = 1;
  $('#daytabs').innerHTML = used.map((d) => `<button type="button" data-day="${d}" aria-pressed="${d === DAY}">${DAYS[d - 1].slice(0, 3)}</button>`).join('');
  $('#week').style.setProperty('--cols', used.length);
  $('#week').innerHTML = used.map((d) => {
    const rows = SITE.classes.filter((c) => c.day === d);
    return `<div class="day ${d === DAY ? 'sel' : ''}"><h3>${DAYS[d - 1]}</h3>${rows.length ? rows.map((c) => `<div class="slot">
      <span class="t">${t12(c.start_time)}</span><span class="n">${esc(c.name)}${c.note ? ` <em>${esc(c.note)}</em>` : ''}</span><span class="c">${esc(c.coach || '')}</span></div>`).join('')
      : '<p class="rest">Rest day</p>'}</div>`;
  }).join('');
}
$('#daytabs').addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (!b) return; DAY = +b.dataset.day; drawWeek(); });

function drawCoaches() {
  $('#coaches').hidden = !SITE.coaches.length;
  $('#coach-grid').innerHTML = SITE.coaches.map((c) => {
    // What each coach takes, worked out from the timetable so it never goes stale.
    const takes = [...new Set(SITE.classes.filter((k) => (k.coach || '').split(',').map((x) => x.trim().toLowerCase()).includes(c.name.trim().toLowerCase())).map((k) => k.name.replace(/^TRI FIT\s+/i, '')))];
    const photo = safeUrl(c.photo_url) || (/^data:image\//.test(c.photo_url || '') ? c.photo_url : '');
    return `<article class="coach">
      <div class="ph">${photo ? `<img src="${esc(photo)}" alt="${esc(c.name)}" loading="lazy">` : `<span aria-hidden="true">${esc(initials(c.name))}</span>`}</div>
      <h3>${esc(c.name)}</h3>${c.role ? `<p class="role">${esc(c.role)}</p>` : ''}
      ${c.blurb ? `<p class="blurb">${esc(c.blurb)}</p>` : ''}
      ${takes.length ? `<p class="takes">Coaches ${esc(takes.join(', '))}</p>` : ''}</article>`;
  }).join('');
}

function drawPlans() {
  $('#membership').hidden = !SITE.memberships.length;
  $('#plans').innerHTML = SITE.memberships.map((m) => `<article class="plan ${m.highlight ? 'hl' : ''}">
    ${m.highlight ? '<span class="tag">Most popular</span>' : ''}<h3>${esc(m.name)}</h3>
    <p class="price"><b>${esc(m.price)}</b>${m.period ? ` <span>${esc(m.period)}</span>` : ''}</p>
    ${m.description ? `<p>${esc(m.description)}</p>` : ''}</article>`).join('');
  const cur = $('#e-interest').value;
  $('#e-interest').innerHTML = ['Joining: not sure which option yet', ...SITE.memberships.map((m) => m.name), 'A free trial or taster class', 'Something else']
    .map((o) => `<option>${esc(o)}</option>`).join('');
  if (cur) $('#e-interest').value = cur;
}

function drawProgramming() {
  const of = (k) => SITE.programming.filter((p) => p.kind === k);
  $('#pillars').innerHTML = of('pillar').map((p) => `<article><span class="num">${esc(p.label || '')}</span><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p></article>`).join('');
  $('#rhythm').innerHTML = of('week').map((p) => `<li><b>${esc(p.label || '')}</b><div><h4>${esc(p.title)}</h4><p>${esc(p.body)}</p></div></li>`).join('');
  $('#principles').innerHTML = of('principle').map((p) => `<div><h4>${esc(p.title)}</h4><p>${esc(p.body)}</p></div>`).join('');
  $('#rhythm').closest('div').hidden = !of('week').length;
  $('#principles').closest('div').hidden = !of('principle').length;
  $('#programming').hidden = !SITE.programming.length && !SITE.settings.programming_intro;
}

function drawContact() {
  const s = SITE.settings, tel = (s.phone || '').replace(/[^\d+]/g, '');
  $('#contact').innerHTML = [
    s.contact_email ? ['Email', `<a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>`] : null,
    s.phone ? ['Phone', `<a href="tel:${esc(tel)}">${esc(s.phone)}</a>`] : null,
    s.location ? ['Find us', esc(s.location)] : null,
  ].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#socials').innerHTML = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['teamup', 'TeamUp']]
    .filter(([k]) => safeUrl(s[k])).map(([k, l]) => `<a class="btn ghost sm" href="${esc(s[k])}" target="_blank" rel="noopener">${l}</a>`).join('');
}

// ---------- Enquiry form ----------
$('#enq-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#e-error'), ok = $('#e-ok'), btn = $('#e-submit');
  err.hidden = true;
  const d = Object.fromEntries(new FormData(f));
  if (d.company) { ok.textContent = 'Thanks. Your enquiry has been sent.'; ok.hidden = false; return; } // bots fill the hidden field
  const fail = (m, el) => { err.textContent = m; err.hidden = false; el?.focus(); };
  if (!d.name.trim()) return fail('Please add your name.', $('#e-name'));
  if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) return fail('Please add an email address we can reply to.', $('#e-email'));
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    await sendEnquiry({ name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim() || null, interest: d.interest || null, message: d.message.trim() || null, page: location.pathname.slice(0, 200) });
    f.reset();
    ok.innerHTML = `<strong>Thanks, ${esc(d.name.trim().split(' ')[0])}. Your enquiry has been sent.</strong> We will reply to ${esc(d.email.trim())} as soon as we can.`;
    ok.hidden = false;
  } catch {
    const mail = SITE?.settings.contact_email;
    err.innerHTML = `Sorry, that did not send. Please try again${mail ? `, or email us at <a href="mailto:${esc(mail)}">${esc(mail)}</a>` : ''}.`;
    err.hidden = false;
  } finally { btn.disabled = false; btn.textContent = 'Send enquiry'; }
});

// ---------- Menu ----------
const menuBtn = $('#menu-btn'), nav = $('#nav');
menuBtn.addEventListener('click', () => { const open = nav.classList.toggle('open'); menuBtn.setAttribute('aria-expanded', open); });
nav.addEventListener('click', (e) => { if (e.target.closest('a')) { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); } });

// ---------- Start ----------
// Draw straight away from the last copy this browser saw, then refresh from the database.
// A first-time visitor waits for the live content, so they never see something an admin removed.
try { const c = JSON.parse(localStorage.getItem(CACHE)); if (c?.settings && Array.isArray(c.classes)) draw(c); } catch {}
loadSite().then((site) => {
  draw(site);
  if (site.source === 'live') { try { localStorage.setItem(CACHE, JSON.stringify(site)); } catch {} }
});
