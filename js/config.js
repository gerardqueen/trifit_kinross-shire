// TRI FIT Kinross-shire website: settings.
// This site has its own Supabase project (trifit-kinross), separate from every other site.
// The publishable key is meant to be public: the database rules in supabase/001_trifit.sql and
// 002_portal.sql decide what the public and each signed-in person can read and write.
export const SUPABASE_URL = 'https://hgfhrqnohvixhudjvfju.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_lX41pCwUkZU55eYF05MrVg_CCE12hFm';

// Demo mode: add ?demo to the address (or blank the URL above) and nothing touches the
// database. The admin page opens without a login and changes stay in that browser only.
// Emailed links (confirm sign-up, reset password) can't open inside the app, so they land on
// the members page on the website.
export const WEB_APP_URL = 'https://gerardqueen.github.io/trifit_kinross-shire/app.html';

// App mode: inside the iPhone or Android app, or add ?app to the members page on the website to
// see it. Everyone, coaches and admins included, gets the member view there; programming and
// admin tools stay on the website.
export const NATIVE = !!(typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export const APP = NATIVE || new URLSearchParams(location.search).has('app');

export const DEMO = !SUPABASE_URL || new URLSearchParams(location.search).has('demo');
