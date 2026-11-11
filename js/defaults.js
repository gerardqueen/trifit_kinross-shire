// Starting content for the site. The same content is loaded into the database by
// supabase/001_trifit.sql (generated with tools/seed.mjs), and the public page falls back to
// it if the database can't be reached. After launch, everything here is edited on admin.html.
//
// Sources: timetable, coaches, prices and contact details are from Tri Fit's
// public TeamUp page (week of 9 Nov 2026). The programming text is a first draft for the gym
// to check and reword.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const SETTINGS = {
  name: 'TRI FIT Kinross-shire',
  hero_eyebrow: 'Functional fitness in Kinross',
  hero_headline: 'Strength. Movement. Conditioning.',
  hero_text: 'A friendly, community driven gym with coached classes for every level. Official HYROX affiliate. Group classes, 1:1 and small group personal training.',
  hero_image: '',
  schedule_note: 'Kids classes, HYROX academy, fundamentals courses and yoga also run at set times. See TeamUp for current dates.',
  membership_note: 'Memberships are bought and managed through TeamUp. Not sure which one fits? Send us an enquiry.',
  programming_heading: 'Three sides, one plan',
  programming_intro: 'Tri Fit is built on three things: strength, conditioning and movement. Each has its own session in the week, and our functional fitness classes bring them together. No class is random. Every session has a purpose, and the week is planned as a whole.',
  contact_email: 'jt.trifit@gmail.com',
  phone: '07773 704493',
  location: 'Kinross, Scotland',
  instagram: 'https://www.instagram.com/tri.fitkinrossshire/',
  facebook: 'https://www.facebook.com/profile.php?id=100076319800931',
  teamup: 'https://goteamup.com/p/4996174-tri-fit-kinross-shire/',
};

const cls = (day, start_time, name, coach, note = '') => ({ day, start_time, duration: 60, name, coach, note });
export const CLASSES = [
  cls(1, '06:00', 'TRI FIT strength', 'Beth Farmer'), cls(1, '07:00', 'TRI FIT strength', 'Beth Farmer'),
  cls(1, '17:30', 'TRI FIT strength', 'Mark Wallace, Jordan Leslie'), cls(1, '18:30', 'TRI FIT strength', 'Mark Wallace, Jordan Leslie'),
  cls(2, '06:00', 'TRI FIT FF', 'John Henderson'), cls(2, '07:00', 'TRI FIT FF', 'John Henderson'),
  cls(2, '17:30', 'TRI FIT FF', 'Jennifer Wallace'), cls(2, '18:30', 'HYROX', 'Jennifer Wallace', 'Ages 16+'),
  cls(3, '06:00', 'TRI FIT movement', 'Scott Allardice'), cls(3, '07:00', 'TRI FIT movement', 'Scott Allardice'),
  cls(3, '12:30', 'TRI FIT movement', 'John Henderson'), cls(3, '17:30', 'TRI FIT movement', 'Emma Armstrong'),
  cls(3, '18:30', 'TRI FIT movement', 'Emma Armstrong'),
  cls(4, '06:00', 'TRI FIT FF', 'John Henderson'), cls(4, '07:00', 'TRI FIT FF', 'John Henderson'),
  cls(4, '17:30', 'TRI FIT FF', 'Karen Young'), cls(4, '18:30', 'TRI FIT FF', 'Karen Young'),
  cls(5, '06:00', 'TRI FIT FF', 'Jennifer Wallace'), cls(5, '07:00', 'TRI FIT FF', 'Jennifer Wallace'),
  cls(5, '16:00', 'TRI FIT FF', 'John Henderson'), cls(5, '18:00', 'HYROX', 'John Henderson', 'Ages 16+'),
  cls(6, '07:30', 'TRI FIT conditioning', 'Mark Wallace, Karen Young'),
].map((c, i) => ({ id: `class-${i + 1}`, ...c }));

// Names are from the TeamUp timetable. Roles, blurbs and photos are for the gym to add.
export const COACHES = ['John Henderson', 'Jennifer Wallace', 'Mark Wallace', 'Beth Farmer', 'Scott Allardice',
  'Emma Armstrong', 'Karen Young', 'Jordan Leslie', 'Kirsty Gallagher',
].map((name, i) => ({ id: `coach-${i + 1}`, name, role: 'Coach', blurb: '', photo_url: '', published: true, sort: i + 1 }));

export const MEMBERSHIPS = [
  { name: 'Unlimited', price: '£65', period: 'per month', description: 'Access to every class on the timetable.', highlight: true },
  { name: 'Teen', price: '£45', period: 'per month', description: 'For ages 16 to 18 in full-time education.', highlight: false },
  { name: 'HYROX Kids', price: '£28', period: 'per month', description: 'The weekly HYROX kids class.', highlight: false },
  { name: 'Tri Fit Kids', price: '£28', period: 'class pass', description: 'Kids class pass. Starts on your first booking.', highlight: false },
  { name: '1:1 and small group PT', price: 'Ask us', period: '', description: 'Personal and small group coaching. Enquire for availability and prices.', highlight: false },
].map((m, i) => ({ id: `mem-${i + 1}`, ...m, published: true, sort: i + 1 }));

// kind: pillar = the three sides of the triangle, week = the weekly rhythm, principle = why it works.
const prog = (kind, label, title, body) => ({ kind, label, title, body });
export const PROGRAMMING = [
  prog('pillar', '01', 'Strength', 'Barbell and dumbbell lifts, built up in small steps from week to week. Getting stronger makes everything else easier, from carrying the shopping to race day, and it protects your joints as you age. Loads are set for you, so a first-timer and a ten-year lifter can train side by side.'),
  prog('pillar', '02', 'Conditioning', 'Rowers, ski ergs, running and bodyweight work at planned intensities. Some days are long and steady and some are short and hard, because your heart and lungs need both. You leave fitter without being flattened.'),
  prog('pillar', '03', 'Movement', 'Mobility, gymnastics skills and technique at a slower pace. Moving well is what lets you lift and breathe hard without picking up niggles, so it gets a session of its own instead of five rushed minutes at the end.'),
  prog('week', 'Mon', 'Strength', 'The heaviest lifting comes first, while you are fresh from the weekend.'),
  prog('week', 'Tue', 'Functional fitness and HYROX', 'A strength or skill piece, then a workout that mixes lifting, gymnastics and cardio. HYROX runs in the evening.'),
  prog('week', 'Wed', 'Movement', 'A lower intensity day in the middle of the week, so you can train five or six days without running yourself into the ground.'),
  prog('week', 'Thu', 'Functional fitness', 'Back to mixed work, with different lifts and time frames from Tuesday.'),
  prog('week', 'Fri', 'Functional fitness and HYROX', 'A last mixed session, plus race practice: running, sleds, ski, row, carries and wall balls.'),
  prog('week', 'Sat', 'Conditioning', 'One longer engine session to finish the week. Sunday is for rest.'),
  prog('principle', '', 'Planned, not random', 'Sessions are written in advance so that loads and skills build on the week before. You always know why you are doing what is on the board.'),
  prog('principle', '', 'Scaled for everyone', 'Every workout has options. The aim is the same effort for each person, whatever the weight on the bar.'),
  prog('principle', '', 'Coached, every class', 'Classes are capped at 12 to 18 people, so your coach can watch every lift and adjust on the spot.'),
].map((p, i) => ({ id: `prog-${i + 1}`, ...p, sort: i + 1 }));

export const DEFAULTS = { settings: SETTINGS, classes: CLASSES, coaches: COACHES, memberships: MEMBERSHIPS, programming: PROGRAMMING };
