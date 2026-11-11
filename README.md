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
