// TRI FIT Kinross-shire website: settings.
// This site has its own Supabase project (trifit-kinross), separate from every other site.
// The publishable key is meant to be public: the database rules in supabase/001_trifit.sql and
// 002_portal.sql decide what the public and each signed-in person can read and write.
export const SUPABASE_URL = 'https://hgfhrqnohvixhudjvfju.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_lX41pCwUkZU55eYF05MrVg_CCE12hFm';

// Demo mode: add ?demo to the address (or blank the URL above) and nothing touches the
// database. The admin page opens without a login and changes stay in that browser only.
export const DEMO = !SUPABASE_URL || new URLSearchParams(location.search).has('demo');
