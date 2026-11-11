// TRI FIT Kinross-shire website: settings.
// The anon key is meant to be public: the database rules in supabase/001_trifit.sql decide what
// the public can read and write. Every table, bucket and function for this site is prefixed
// tf_ / tf-, and admin access is its own list (tf_admins), so it can share a Supabase project
// with other sites without either seeing the other's data. To move it to its own project,
// change these two lines, run the SQL there, and deploy the function.
export const SUPABASE_URL = 'https://bzgnlzsdyjwjfpsexquz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6Z25senNkeWp3amZwc2V4cXV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwODk3ODEsImV4cCI6MjEwODY2NTc4MX0.UunT_CdsnPyMeRzuIoom6n1R2mBzNnlY5Bwh9v_0NjA';

// Demo mode: add ?demo to the address (or blank the URL above) and nothing touches the
// database. The admin page opens without a login and changes stay in that browser only.
export const DEMO = !SUPABASE_URL || new URLSearchParams(location.search).has('demo');
