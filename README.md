# TRI FIT Kinross-shire website

A one-page landing site with an admin page. Plain HTML, CSS and JavaScript: no build step.

| File | What it is |
|---|---|
| `index.html`, `js/site.js` | The public page: timetable, coaches, membership options, programming, enquiry form, social links |
| `admin.html`, `js/admin.js` | Admin login (with "Forgot password?") and editors for everything on the page |
| `app.html`, `js/app.js`, `js/portal.js` | Members portal: programming with each member's own numbers, scores and opt-in leaderboard, PBs, bookings; programming editor for coaches; people and programmes for admins |
| `js/data.js` | Reads and writes Supabase; falls back to demo mode |
| `js/defaults.js` | Starting content, also used if the database can't be reached |
| `supabase/001_trifit.sql` | Tables, access rules, photo storage and starting content |
| `supabase/functions/tf-enquiry-alert` | Emails each new enquiry to the contact email through Resend |
| `supabase/002_portal.sql` | Members portal: people, programmes, workouts, scores, PBs, bookings and their access rules |
| `supabase/003_benchmarks.sql` | Tracked lifts and tests (coaches manage the list) and each member's dated results |
| `supabase/functions/tf-teamup` | TeamUp link (membership check, bookings). Off until the secret `TF_TEAMUP_TOKEN` is set |

## Try it without a database

Serve the folder (`python3 -m http.server`) and open `index.html?demo`, `admin.html?demo` and
`app.html?demo=member` (or `coach`, or `admin`).
Demo mode needs no login and keeps changes in that browser only.

## Where it runs

GitHub Pages serves the files. The database, sign-in, photos and functions are the Supabase
project **trifit-kinross** (its address and publishable key are in `js/config.js`). It shares
nothing with any other site.

## Go live (already done; kept for rebuilding elsewhere)

1. **GitHub Pages:** push this folder to a repo and turn Pages on for the `main` branch.
2. **Database:** in Supabase → SQL Editor, run `supabase/001_trifit.sql`. At the bottom of that
   file, put your email in the "First admin" line and run it.
3. **Email:** deploy `supabase/functions/tf-enquiry-alert` and set the secret `TF_ALERT_TO`
   (plus `RESEND_API_KEY` if the project doesn't have it yet). Enquiries go to the contact
   email set under Site details. Until a sending domain is verified in Resend, they arrive at
   `TF_ALERT_TO` instead, flagged for forwarding.
4. **Supabase → Authentication → URL Configuration:** add the site's address (ending
   `/admin.html`) to the redirect URLs, so confirmation and password-reset links come back
   to the admin page.
5. Open `admin.html`, create your account with the email from step 2, and you are in.

## Admins

Admins → "Add an admin": enter their email, and they create their own account with it.
Anyone who forgets their password uses "Forgot password?" on the login and gets a reset link.

## Members portal

Everyone signs in at `app.html`. New accounts wait until an admin switches them on (People
tab), or until TeamUp confirms an active membership once the link is on. Roles: member, coach
(writes programming), admin (also People, Programmes and the website content).

A session marked **Tracked** lets members record a score. Each member chooses, per score,
whether it goes on the leaderboard; unshared scores are visible only to them.

**TeamUp:** a TeamUp Owner or Admin creates a machine-to-machine token (Settings →
Integrations → API Integration → M2M Tokens) and saves it as the Supabase secret
`TF_TEAMUP_TOKEN`. Until then bookings in the portal are previews and hold no place.
The live TeamUp calls have not been tested yet; test them with the first real token.

**Preview for coaches:** the Programming tab shows a live phone-sized view of the session as a
member will see it, with your PBs, a sample member's, or none. On the Training tab, "See this
day as a member" does the same for a whole day.

**PB history:** coaches add or remove tracked lifts and tests on the PBs tab. Members log dated
results; the best is their PB, and each one shows the improvement since their first result.

**Day view and booking:** Training shows one day at a time: the programme switch (it starts on
the first programme; others such as HYROX show only when chosen), that day's programming, then
that day's classes with Book buttons. On the web, the Book tab is a week calendar. On a phone
there is no separate Book tab, because the day view already carries the classes.

## The members app (iPhone, Android later)

`mobile/` wraps the members page (`app.html`) with Capacitor, so the app and the website share one
codebase. `npm run build` in `mobile/` bundles `js/app.js` (with supabase-js from npm) into `www/`.

In the app (or `app.html?app` on the website) everyone, coaches and admins included, gets the
member view: Training, PBs and Account, with a bottom tab bar. Drafts, coach notes,
coaches-only programmes, the programming editor and admin tools stay on the website.
Emailed links (confirm sign-up, reset password) open the members page on the website.

**TestFlight via Codemagic** (`codemagic.yaml`, workflow `trifit-ios`, started by hand):
1. App Store Connect → Apps → + → New App: name TRI FIT, bundle ID `com.trifitkinross.app`
   (register it first under Certificates, Identifiers & Profiles → Identifiers if it is not listed).
2. Codemagic → add this repository as a new app, and add an environment variable group
   `app_store_connect` with the same three App Store Connect API key values as No Rule Nutrition.
3. Start the `trifit-ios` workflow. The build appears in TestFlight once Apple has processed it.

**TeamUp:** with the secret `TF_TEAMUP_TOKEN` set, a new member's account is matched to TeamUp by
email and switched on automatically if their membership is active; classes, spaces and their
bookings come live from TeamUp, and booking goes straight into it. Untested until the gym's token
exists: an admin can call the function's `inspect` action to see what TeamUp returns.
Demo: `app.html?demo=member&app&teamup` shows the app with TeamUp simulated.

## Class register and profile photos

- Coaches and admins get a **Register** tab, in the app and on the website. Pick a day and a class, see who is booked in (with their photo) and mark each person Present or Absent. "Mark everyone not yet marked as present" does the lot in one tap.
- Before TeamUp is linked the list comes from the preview bookings made in the app. Once TeamUp is linked it comes live from TeamUp (`tf-teamup` action `roster`), and each mark is also sent to TeamUp (`mark`, best effort: untested until there is a token). Marks are always saved in `tf_attendance`.
- In the app a coach sees the member view plus the Register only. Programming, people, programmes and website content stay on the website login.
- Everyone can add a profile photo on the Account tab. It is shrunk to 512px and stored in `tf-photos/avatars/<user id>/`; a new photo replaces the old one.
- Database: run `supabase/004_register_avatars.sql` (done on trifit-kinross).
