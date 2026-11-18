// Data for the member and coach portal (app.html): who you are, programmes, workouts, scores,
// the leaderboard, personal bests, bookings and (for admins) people. Demo mode keeps it all in
// this browser so every screen can be tried without an account.
import { DEMO, client, must, uid, demoRead, demoWrite, compress } from './data.js';

export { DEMO };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const monday = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export { iso };

// ---------- Demo content ----------
const DEMO_ROLE = () => { const r = new URLSearchParams(location.search).get('demo'); return ['member', 'coach', 'admin'].includes(r) ? r : 'admin'; };
function demo() {
  const s = demoRead();
  if (!s.portal) {
    const m = monday(), d = (n) => iso(addDays(m, n));
    const tracks = [{ id: 't1', name: 'TRI FIT classes', audience: 'members', sort: 1 }, { id: 't2', name: 'HYROX', audience: 'members', sort: 2 }, { id: 't3', name: 'Coaches only', audience: 'coaches', sort: 3 }];
    const w = (id, track_id, day, title, body, tracked, score_type, published = true) => ({ id, track_id, day, title, body, tracked, score_type, published });
    const workouts = [
      w('w1', 't1', d(0), 'Squat and press', 'A. Back squat 5 x 3 @ {82.5% Back Squat}, rest 2:30\nB. Strict press 4 x 6 @ {70% Strict Press}\nC. 3 rounds: 12 walking lunges, 10 hollow rocks, 250m row @ {65% 2k Row /500m}', false, 'time'),
      w('w2', 't1', d(1), 'Loch Leven', 'A. Every 90 seconds x 8: 1 clean and jerk @ {75% Clean & Jerk}\nB. AMRAP 12: 12 cal row, 9 toes-to-bar, 6 power cleans @ {60% Clean & Jerk}', true, 'rounds_reps'),
      w('w3', 't1', d(2), 'Positions and engine', 'A. 12 minutes: wall walks and handstand holds\nB. 3 x 1000m row @ {75% 2k Row /500m}, rest 2:00, stroke rate 22 to 24', false, 'time'),
      w('w4', 't1', d(3), 'Deadlift and sprint', 'A. Deadlift 5 x 5 @ {75% Deadlift}\nB. For time: 21-15-9 wall balls and burpees over the rower, then 500m row @ {95% 500m Row /500m}', true, 'time'),
      w('w5', 't2', d(4), 'Race pace', '4 rounds: 1km run @ {85% 1k Run}, 1000m SkiErg @ {80% 1k Ski /500m}, 25m sled push, 20 wall balls', true, 'time'),
      w('w6', 't1', d(5), 'Erg intervals', 'A. 5 x 500m row @ {90% 2k Row /500m}, rest 2:00. Score is your slowest 500.\nB. Partner chipper: 100 cal ski, 80 kettlebell swings, 60 box step-overs, 40 burpees', true, 'time'),
      w('w7', 't1', d(7), 'Next week draft', 'A. Front squat 5 x 5 @ {70% Back Squat}', true, 'load', false),
    ];
    const others = [['Callum B.', 7011, true, 9], ['Eilidh S.', 7004, true, 12], ['Ross M.', 6025, true, 5], ['Isla K.', 7002, false, 7], ['Hamish P.', 6020, false, 4]];
    s.portal = {
      me: { name: 'Jamie R.', board_default: true }, tracks, workouts,
      notes: { w2: 'Aim for a round every 1:45. Scale toes-to-bar to hanging knee raises before slowing the row.' },
      scores: others.map(([name, value, rx, fives], i) => ({ id: 's' + i, workout_id: 'w2', user: 'u' + i, name, value, rx, public: true, fives, fived: false })),
      defs: [['Back Squat', 'lift'], ['Front Squat', 'lift'], ['Deadlift', 'lift'], ['Clean & Jerk', 'lift'], ['Snatch', 'lift'], ['Strict Press', 'lift'], ['Bench Press', 'lift'],
        ['2k Row', 'time', 2000], ['500m Row', 'time', 500], ['5k Row', 'time', 5000], ['1k Ski', 'time', 1000], ['1k Run', 'time', 1000], ['5k Run', 'time', 5000]]
        .map(([name, kind, distance_m = null], i) => ({ id: 'b' + i, name, kind, distance_m, sort: i + 1 })),
      log: [['Back Squat', 97.5, -160], ['Back Squat', 102.5, -110], ['Back Squat', 105, -62], ['Back Squat', 110, -20], ['Deadlift', 140, -150], ['Deadlift', 150, -35],
        ['Clean & Jerk', 70, -120], ['Clean & Jerk', 77.5, -28], ['Strict Press', 55, -40], ['2k Row', 471, -140], ['2k Row', 459, -75], ['2k Row', 448, -14], ['500m Row', 98, -9]]
        .map(([name, value, ago], i) => ({ id: 'l' + i, name, value, day: iso(addDays(new Date(), ago)) })),
      bookings: [],
      people: [
        { user_id: 'p1', email: 'new.member@example.com', name: 'New Member', role: 'member', status: 'pending', teamup_plan: null, tracks: [] },
        { user_id: 'p2', email: 'coach@example.com', name: 'Sample Coach', role: 'coach', status: 'active', teamup_plan: null, tracks: [] },
        { user_id: 'p3', email: 'member@example.com', name: 'Sample Member', role: 'member', status: 'active', teamup_plan: 'Unlimited monthly membership', tracks: [] },
      ],
    };
    demoWrite(s);
  }
  if (!s.portal.defs) { localStorage.removeItem('tf-demo-v1'); return demo(); } // demo data from before PB history: start it again
  return s;
}
const dsave = (s) => demoWrite(s);

// ---------- Who you are ----------
let ME = null;
/** null when signed out. Creates the profile on first sign-in. */
export async function me(name) {
  if (DEMO) { const p = demo().portal.me, role = DEMO_ROLE(); return (ME = { user_id: 'me', email: 'demo', name: p.name, role, status: 'active', board_default: p.board_default, is_admin: role === 'admin', avatar_url: p.avatar_url || null, demo: true }); }
  const c = await client();
  const { data: { session } } = await c.auth.getSession();
  if (!session) return (ME = null);
  const rows = must(await c.rpc('tf_me', { p_name: name || null }));
  return (ME = rows[0] ? { ...rows[0] } : null);
}
export async function updateMe(name, boardDefault) {
  if (DEMO) { const s = demo(); Object.assign(s.portal.me, { name, board_default: boardDefault }); return dsave(s); }
  const c = await client(); must(await c.rpc('tf_update_me', { p_name: name, p_board_default: boardDefault }));
}
const staff = () => ME && (ME.role === 'admin' || ME.role === 'coach');

// ---------- Profile photo ----------
// One photo per person, in tf-photos/avatars/<their id>/. A new photo replaces the old one.
export async function setAvatar(file) {
  if (DEMO) { const s = demo(); s.portal.me.avatar_url = (await compress(file, 320, 0.8)).dataUrl(); return dsave(s); }
  const c = await client(), folder = `avatars/${ME.user_id}`, path = `${folder}/${uid()}.jpg`;
  const { blob } = await compress(file, 512, 0.82);
  must(await c.storage.from('tf-photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
  must(await c.rpc('tf_set_avatar', { p_url: c.storage.from('tf-photos').getPublicUrl(path).data.publicUrl }));
  await clearAvatars(c, folder, path);
}
export async function removeAvatar() {
  if (DEMO) { const s = demo(); s.portal.me.avatar_url = null; return dsave(s); }
  const c = await client();
  must(await c.rpc('tf_set_avatar', { p_url: null }));
  await clearAvatars(c, `avatars/${ME.user_id}`, null);
}
async function clearAvatars(c, folder, keep) {
  const { data } = await c.storage.from('tf-photos').list(folder);
  const old = (data || []).map((f) => `${folder}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await c.storage.from('tf-photos').remove(old);
}

// ---------- Register (coaches) ----------
const DEMO_NAMES = ['Callum Brown', 'Eilidh Stewart', 'Ross Martin', 'Isla Kerr', 'Hamish Paterson', 'Morven Reid', 'Fraser Grant'];
const demoPeople = (key) => DEMO_NAMES.slice(0, 3 + (key.length + key.charCodeAt(key.length - 1)) % 5);
/** Booked counts per website class on one day: {class_id: {booked, present}}. */
export async function registerCounts(day) {
  if (DEMO) { const s = demo(), att = s.portal.att || {}; return Object.fromEntries(s.classes.map((c) => { const k = c.id; const ppl = demoPeople(k); return [k, { booked: ppl.length, present: ppl.filter((n) => att[`${day}|${k}|${n}`] === 'present').length }]; })); }
  const c = await client();
  return Object.fromEntries(must(await c.rpc('tf_register_counts', { p_day: day })).map((r) => [r.class_id, r]));
}
/** Who is booked into a website class (preview bookings), with any marks. */
export async function register(classId, day) {
  if (DEMO) { const att = demo().portal.att || {}; return demoPeople(classId).map((n) => ({ member_key: n, name: n, avatar_url: null, status: att[`${day}|${classId}|${n}`] || null })); }
  const c = await client(); return must(await c.rpc('tf_register', { p_class: classId, p_day: day }));
}
/** Marks already made for one class: {member_key: status}. */
export async function marks(day, classKey) {
  if (DEMO) { const att = demo().portal.att || {}, pre = `${day}|${classKey}|`; return Object.fromEntries(Object.entries(att).filter(([k]) => k.startsWith(pre)).map(([k, v]) => [k.slice(pre.length), v])); }
  const c = await client();
  return Object.fromEntries(must(await c.from('tf_attendance').select('member_key,status').eq('day', day).eq('class_key', classKey)).map((r) => [r.member_key, r.status]));
}
/** status: 'present', 'absent', or null to clear the mark. */
export async function mark(day, classKey, memberKey, name, status) {
  if (DEMO) { const s = demo(); s.portal.att = s.portal.att || {}; const k = `${day}|${classKey}|${memberKey}`; if (status) s.portal.att[k] = status; else delete s.portal.att[k]; return dsave(s); }
  const c = await client();
  if (!status) return must(await c.from('tf_attendance').delete().eq('day', day).eq('class_key', classKey).eq('member_key', memberKey));
  must(await c.from('tf_attendance').upsert({ day, class_key: classKey, member_key: memberKey, member_name: name, status, marked_by: ME.user_id, marked_at: new Date().toISOString() }, { onConflict: 'day,class_key,member_key' }));
}
/** Live register from TeamUp for one class. */
export async function roster(eventId) { const r = await teamup('roster', { event_id: eventId }); if (!r.ok) throw new Error(r.error || 'TeamUp did not send the register.'); return r.people || []; }
export const markInTeamup = (attendanceId, present) => teamup('mark', { attendance_id: attendanceId, present });

// ---------- Programmes and workouts ----------
export async function tracks() {
  if (DEMO) return demo().portal.tracks.filter((t) => staff() || t.audience === 'members').sort((a, b) => a.sort - b.sort);
  const c = await client(); return must(await c.from('tf_tracks').select('*').order('sort'));
}
export async function saveTrack(t) {
  const { id, ...rest } = t;
  if (DEMO) { const s = demo(), a = s.portal.tracks; if (id) Object.assign(a.find((x) => x.id === id), rest); else a.push({ id: uid(), sort: a.length + 1, ...rest }); return dsave(s); }
  const c = await client();
  if (id) return must(await c.from('tf_tracks').update(rest).eq('id', id));
  const top = must(await c.from('tf_tracks').select('sort').order('sort', { ascending: false }).limit(1));
  must(await c.from('tf_tracks').insert({ ...rest, sort: (top[0]?.sort || 0) + 1 }));
}
export async function deleteTrack(id) {
  if (DEMO) { const s = demo(); s.portal.tracks = s.portal.tracks.filter((x) => x.id !== id); s.portal.workouts = s.portal.workouts.filter((x) => x.track_id !== id); return dsave(s); }
  const c = await client(); must(await c.from('tf_tracks').delete().eq('id', id));
}
/** Workouts between two dates. Staff also get drafts and coach notes. */
export async function workouts(from, to) {
  if (DEMO) {
    const p = demo().portal, vis = new Set((await tracks()).map((t) => t.id));
    return p.workouts.filter((w) => w.day >= from && w.day <= to && vis.has(w.track_id) && (staff() || w.published))
      .map((w) => ({ ...w, notes: staff() ? p.notes[w.id] || '' : undefined })).sort((a, b) => a.day.localeCompare(b.day));
  }
  const c = await client();
  const rows = must(await c.from('tf_workouts').select('*').gte('day', from).lte('day', to).order('day').order('created_at'));
  if (staff() && rows.length) {
    const notes = must(await c.from('tf_workout_notes').select('*').in('workout_id', rows.map((r) => r.id)));
    const by = Object.fromEntries(notes.map((n) => [n.workout_id, n.notes]));
    rows.forEach((r) => (r.notes = by[r.id] || ''));
  }
  return rows;
}
export async function saveWorkout(w) {
  const { id, notes, ...rest } = w;
  if (DEMO) {
    const s = demo(), a = s.portal.workouts; let wid = id;
    if (id) Object.assign(a.find((x) => x.id === id), rest); else { wid = uid(); a.push({ id: wid, ...rest }); }
    s.portal.notes[wid] = notes || ''; return dsave(s);
  }
  const c = await client(); let wid = id;
  if (id) must(await c.from('tf_workouts').update(rest).eq('id', id));
  else wid = must(await c.from('tf_workouts').insert({ ...rest, created_by: ME.user_id }).select('id'))[0].id;
  must(await c.from('tf_workout_notes').upsert({ workout_id: wid, notes: notes || '' }));
}
export async function deleteWorkout(id) {
  if (DEMO) { const s = demo(); s.portal.workouts = s.portal.workouts.filter((x) => x.id !== id); s.portal.scores = s.portal.scores.filter((x) => x.workout_id !== id); return dsave(s); }
  const c = await client(); must(await c.from('tf_workouts').delete().eq('id', id));
}

// ---------- Scores and the leaderboard ----------
/** Rows for one workout: every public score, plus your own even when it is private. */
export async function leaderboard(workoutId) {
  if (DEMO) return demo().portal.scores.filter((s) => s.workout_id === workoutId && (s.public || s.user === 'me'))
    .map((s) => ({ score_id: s.id, name: s.user === 'me' ? demo().portal.me.name : s.name, value: s.value, rx: s.rx, note: s.note || null, is_public: s.public, is_me: s.user === 'me', fives: s.fives + (s.fived ? 1 : 0), i_fived: !!s.fived }));
  const c = await client();
  return must(await c.rpc('tf_leaderboard', { p_workout: workoutId })).map((r) => ({ ...r, value: Number(r.value) }));
}
export async function saveScore({ workout_id, value, rx, note, isPublic }) {
  if (DEMO) {
    const s = demo(), a = s.portal.scores, mine = a.find((x) => x.workout_id === workout_id && x.user === 'me');
    if (mine) Object.assign(mine, { value, rx, note, public: isPublic }); else a.push({ id: uid(), workout_id, user: 'me', value, rx, note, public: isPublic, fives: 0, fived: false });
    return dsave(s);
  }
  const c = await client();
  must(await c.from('tf_scores').upsert({ workout_id, user_id: ME.user_id, value, rx, note: note || null, public: isPublic }, { onConflict: 'workout_id,user_id' }));
}
export async function deleteScore(scoreId) {
  if (DEMO) { const s = demo(); s.portal.scores = s.portal.scores.filter((x) => x.id !== scoreId); return dsave(s); }
  const c = await client(); must(await c.from('tf_scores').delete().eq('id', scoreId));
}
export async function toggleFive(scoreId) {
  if (DEMO) { const s = demo(), x = s.portal.scores.find((r) => r.id === scoreId); if (x && x.user !== 'me') x.fived = !x.fived; return dsave(s); }
  const c = await client(); must(await c.rpc('tf_toggle_five', { p_score: scoreId }));
}

// ---------- Tracked lifts and tests, and each member's results ----------
/** What the gym tracks: {id, name, kind: lift|time|reps, distance_m}. Coaches manage the list. */
export async function benchDefs() {
  if (DEMO) return demo().portal.defs.slice().sort((a, b) => a.sort - b.sort);
  const c = await client(); return must(await c.from('tf_benchmark_defs').select('*').order('sort').order('created_at'));
}
export async function saveBenchDef({ id, ...rest }) {
  if (DEMO) { const s = demo(), a = s.portal.defs; if (id) Object.assign(a.find((x) => x.id === id), rest); else a.push({ id: uid(), sort: Math.max(0, ...a.map((x) => x.sort)) + 1, ...rest }); return dsave(s); }
  const c = await client();
  if (id) return must(await c.from('tf_benchmark_defs').update(rest).eq('id', id));
  const top = must(await c.from('tf_benchmark_defs').select('sort').order('sort', { ascending: false }).limit(1));
  must(await c.from('tf_benchmark_defs').insert({ ...rest, sort: (top[0]?.sort || 0) + 1 }));
}
export async function deleteBenchDef(id) {
  if (DEMO) { const s = demo(); s.portal.defs = s.portal.defs.filter((x) => x.id !== id); return dsave(s); }
  const c = await client(); must(await c.from('tf_benchmark_defs').delete().eq('id', id));
}
/** Every result the signed-in member has logged, oldest first. */
export async function benchLog() {
  if (DEMO) return demo().portal.log.slice().sort((a, b) => a.day.localeCompare(b.day));
  const c = await client();
  return must(await c.from('tf_benchmark_log').select('id,name,value,day').eq('user_id', ME.user_id).order('day').order('created_at')).map((r) => ({ ...r, value: Number(r.value) }));
}
export async function addBenchEntry(name, value, day) {
  if (DEMO) { const s = demo(); s.portal.log.push({ id: uid(), name, value, day }); return dsave(s); }
  const c = await client(); must(await c.from('tf_benchmark_log').insert({ user_id: ME.user_id, name, value, day }));
}
export async function deleteBenchEntry(id) {
  if (DEMO) { const s = demo(); s.portal.log = s.portal.log.filter((x) => x.id !== id); return dsave(s); }
  const c = await client(); must(await c.from('tf_benchmark_log').delete().eq('id', id));
}

// ---------- Timetable and bookings ----------
export async function classes() {
  if (DEMO) return demoRead().classes.slice().sort((a, b) => a.day - b.day || a.start_time.localeCompare(b.start_time));
  const c = await client(); return must(await c.from('tf_classes').select('*').order('day').order('start_time'));
}
export async function myBookings(from) {
  if (DEMO) return demo().portal.bookings.filter((b) => b.day >= from);
  const c = await client(); return must(await c.from('tf_bookings').select('*').eq('user_id', ME.user_id).gte('day', from));
}
/** TeamUp link: asks the server function. {linked:false} until the gym's TeamUp token is added. */
// Demo with &teamup added to the address pretends TeamUp is linked, with made-up spaces, so the
// live booking screens can be seen before the gym's token exists.
const DEMO_TU = DEMO && new URLSearchParams(location.search).has('teamup');
function demoTeamup(action, p) {
  const s = demo(); s.portal.tu = s.portal.tu || [];
  if (action === 'status') return { linked: true };
  if (action === 'sync') return { linked: true, ok: true, active: true, message: 'Membership found: Unlimited monthly membership (demo).' };
  if (action === 'timetable') {
    const events = [];
    for (let d = new Date(p.from + 'T12:00:00'); iso(d) <= p.to; d.setDate(d.getDate() + 1)) {
      const k = iso(d), wd = ((d.getDay() + 6) % 7) + 1;
      for (const c of s.classes.filter((x) => x.day === wd)) {
        const id = `${c.id}-${k}`, cap = /HYROX/i.test(c.name) ? 18 : 16, base = (c.start_time.charCodeAt(1) * 7 + d.getDate() * 3) % (cap + 1);
        const mine = s.portal.tu.includes(id);
        events.push({ id, day: k, time: c.start_time, name: c.name, coach: c.coach, capacity: cap, booked: Math.min(cap, base + (mine ? 1 : 0)), mine, waitlisted: false });
      }
    }
    return { linked: true, ok: true, matched: true, events };
  }
  if (action === 'roster') return { ok: true, people: demoPeople(p.event_id).map((n, i) => ({ attendance_id: 'a' + i, customer_id: 'c' + i, user_id: null, name: n, avatar_url: null, status: null, waitlist: false })) };
  if (action === 'mark') return { ok: true };
  if (action === 'book') { s.portal.tu.push(p.event_id); dsave(s); return { ok: true }; }
  if (action === 'cancel') { s.portal.tu = s.portal.tu.filter((x) => x !== p.event_id); dsave(s); return { ok: true }; }
  return { ok: false, error: 'Unknown action.' };
}
export async function teamup(action, payload = {}) {
  if (DEMO_TU) return demoTeamup(action, payload);
  if (DEMO) return { linked: false };
  try {
    const c = await client();
    const { data, error } = await c.functions.invoke('tf-teamup', { body: { action, ...payload } });
    if (error) return { linked: false, error: error.message };
    return data || { linked: false };
  } catch (e) { return { linked: false, error: e.message }; }
}
/** Preview booking, used until TeamUp is linked. It is saved here and holds no place. */
export async function book(classId, day) {
  if (DEMO) { const s = demo(); s.portal.bookings.push({ id: uid(), class_id: classId, day, status: 'preview' }); return dsave(s); }
  const c = await client(); must(await c.from('tf_bookings').insert({ user_id: ME.user_id, class_id: classId, day }));
}
export async function cancelBooking(id) {
  if (DEMO) { const s = demo(); s.portal.bookings = s.portal.bookings.filter((x) => x.id !== id); return dsave(s); }
  const c = await client(); must(await c.from('tf_bookings').delete().eq('id', id));
}
/** Live classes from TeamUp between two dates, with spaces and whether this member is booked. */
export const liveTimetable = (from, to) => teamup('timetable', { from, to });
export async function bookEvent(eventId) { const r = await teamup('book', { event_id: eventId }); if (!r.ok) throw new Error(r.error || 'TeamUp did not accept the booking.'); }
export async function cancelEvent(eventId) { const r = await teamup('cancel', { event_id: eventId }); if (!r.ok) throw new Error(r.error || 'TeamUp did not cancel the booking.'); }

// ---------- Admin: people ----------
export async function people() {
  if (DEMO) return demo().portal.people.map((p) => ({ ...p }));
  const c = await client();
  const [rows, access] = await Promise.all([
    c.from('tf_profiles').select('*').order('created_at', { ascending: false }).then(must),
    c.from('tf_track_access').select('*').then(must),
  ]);
  return rows.map((r) => ({ ...r, tracks: access.filter((a) => a.user_id === r.user_id).map((a) => a.track_id) }));
}
export async function setPerson(userId, role, status, trackIds) {
  if (DEMO) { const s = demo(); Object.assign(s.portal.people.find((p) => p.user_id === userId), { role, status, tracks: trackIds }); return dsave(s); }
  const c = await client(); must(await c.rpc('tf_set_person', { p_user: userId, p_role: role, p_status: status, p_tracks: trackIds }));
}
