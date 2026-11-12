// Data for the member and coach portal (app.html): who you are, programmes, workouts, scores,
// the leaderboard, personal bests, bookings and (for admins) people. Demo mode keeps it all in
// this browser so every screen can be tried without an account.
import { DEMO, client, must, uid, demoRead, demoWrite } from './data.js';

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
  if (DEMO) { const p = demo().portal.me, role = DEMO_ROLE(); return (ME = { user_id: 'me', email: 'demo', name: p.name, role, status: 'active', board_default: p.board_default, is_admin: role === 'admin', demo: true }); }
  const c = await client();
  const { data: { session } } = await c.auth.getSession();
  if (!session) return (ME = null);
  const rows = must(await c.rpc('tf_me', { p_name: name || null }));
  return (ME = rows[0] ? { ...rows[0] } : null);
}
export async function updateMe(name, boardDefault) {
  if (DEMO) { const s = demo(); s.portal.me = { name, board_default: boardDefault }; return dsave(s); }
  const c = await client(); must(await c.rpc('tf_update_me', { p_name: name, p_board_default: boardDefault }));
}
const staff = () => ME && (ME.role === 'admin' || ME.role === 'coach');

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
export async function teamup(action, payload = {}) {
  if (DEMO) return { linked: false };
  try {
    const c = await client();
    const { data, error } = await c.functions.invoke('tf-teamup', { body: { action, ...payload } });
    if (error) return { linked: false, error: error.message };
    return data || { linked: false };
  } catch (e) { return { linked: false, error: e.message }; }
}
export async function book(classId, day, linked) {
  if (DEMO) { const s = demo(); s.portal.bookings.push({ id: uid(), class_id: classId, day, status: 'preview' }); return dsave(s); }
  if (linked) { const r = await teamup('book', { class_id: classId, day }); if (!r.ok) throw new Error(r.error || 'TeamUp did not accept the booking.'); return; }
  const c = await client(); must(await c.from('tf_bookings').insert({ user_id: ME.user_id, class_id: classId, day }));
}
export async function cancelBooking(b, linked) {
  if (DEMO) { const s = demo(); s.portal.bookings = s.portal.bookings.filter((x) => x.id !== b.id); return dsave(s); }
  if (linked && b.status === 'booked') { const r = await teamup('cancel', { booking_id: b.id }); if (!r.ok) throw new Error(r.error || 'TeamUp did not cancel the booking.'); return; }
  const c = await client(); must(await c.from('tf_bookings').delete().eq('id', b.id));
}

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
