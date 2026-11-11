// Prints the SQL that loads the starting content (js/defaults.js) into the database.
// Usage: node tools/seed.mjs   → paste into the "Starting content" part of supabase/001_trifit.sql
import { SETTINGS, CLASSES, COACHES, MEMBERSHIPS, PROGRAMMING } from '../js/defaults.js';
const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const insert = (table, cols, rows) => `insert into public.${table} (${cols.join(', ')})\nselect * from (values\n${rows.map((r) => '  (' + cols.map((c) => q(r[c])).join(', ') + ')').join(',\n')}\n) v\nwhere not exists (select 1 from public.${table});\n`;
console.log(`insert into public.tf_content (key, value) values ('settings', ${q(JSON.stringify(SETTINGS))}::jsonb)\non conflict (key) do nothing;\n`);
console.log(insert('tf_coaches', ['name', 'role', 'blurb', 'photo_url', 'published', 'sort'], COACHES));
console.log(insert('tf_classes', ['day', 'start_time', 'duration', 'name', 'coach', 'note'], CLASSES));
console.log(insert('tf_memberships', ['name', 'price', 'period', 'description', 'highlight', 'published', 'sort'], MEMBERSHIPS));
console.log(insert('tf_programming', ['kind', 'label', 'title', 'body', 'sort'], PROGRAMMING));
