# Carrom Tournament

A production-ready, single-page Carrom Doubles Tournament management dashboard. Pure HTML5, CSS3, Bootstrap 5, and vanilla ES6 modules — no build step, no custom backend server. Live data is shared across every visitor via a free **Firebase Firestore** project (see setup below).

## Features

- **Dashboard** — tournament overview, live progress bar, today's/upcoming matches, latest results, next-match card, countdown to final.
- **Schedule** — full 50-match pool schedule (weekdays only, 2 matches/day, starting 27 July) with pool/team/date/status filters, search, list & calendar views, print, and CSV export.
- **Standings** — per-pool tables (Played/Won/Lost/Points/Net Diff) auto-sorted after every result, with Qualified / Wildcard / Eliminated highlighting.
- **Teams** — 25 team cards (2 players each) with live stats, search, pool filter, and quick links into fixtures/results.
- **Knockout Bracket** — auto-generated from standings once all 50 pool matches are complete (5 pool winners + best 3 runner-ups = 8 teams): Quarter Finals → Semi Finals → Final + 3rd Place, with champion celebration.
- **Statistics** — Chart.js dashboards: completion doughnut, pool wins, cumulative progress, matches/day, win-percentage, pool comparison radar, and a most-wins leaderboard.
- **Admin Panel** — protected by real Firebase Authentication (email/password): create/edit/delete teams, create matches, enter/undo results, generate the knockout bracket, reset the tournament, export standings to Excel/PDF, and backup/restore the full dataset as JSON.
- **Team Logos** — each team gets a short access code (visible to the admin in the Teams table); anyone with a team's code can upload that team's logo from the public "Team Logo" tab, no login needed. Images are compressed client-side and stored directly in Firestore — no Firebase Storage/billing plan required.
- **Live shared data** — every visitor reads the same Firestore data in real time. Anyone with the link sees the same up-to-the-second standings/schedule/bracket; only the signed-in admin can write scores and settings.
- **Responsive** — collapsible sidebar on desktop, bottom nav bar on mobile, horizontally scrollable bracket and tables.

## Setting up the shared live backend (Firebase)

This is a one-time, ~5 minute setup. It's required before the app will load — without it, `firebase-config.js` still points at placeholder values and Firestore calls will fail.

1. **Create a project** at https://console.firebase.google.com → "Add project" → follow the prompts (Google Analytics is optional, skip it).
2. **Add a web app**: in the project, click the `</>` (web) icon → register an app (no need for Firebase Hosting) → copy the `firebaseConfig` object it shows you.
3. **Paste your config** into [`assets/js/firebase-config.js`](assets/js/firebase-config.js), replacing the placeholder `apiKey`, `authDomain`, `projectId`, etc.
4. **Enable Firestore**: left sidebar → Build → Firestore Database → Create database → start in **production mode** → pick any region.
5. **Enable Authentication**: left sidebar → Build → Authentication → Get started → Sign-in method → enable **Email/Password**.
6. **Create your admin account**: Authentication → Users tab → Add user → enter an email (e.g. `admin@your-tournament.local`) and a password. This password is what you'll type into the app's Admin tab.
7. Update `ADMIN_EMAIL` in `firebase-config.js` to match the email you just used.
8. **Set Firestore security rules** so anyone can read live data, but only your signed-in admin account can write scores/settings — with one narrow exception letting anyone update just a team's logo field (see note below). Go to Firestore Database → Rules and paste:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /tournaments/{doc} {
         allow read: if true;
         allow write: if request.auth != null;
       }
       match /teams/{teamId} {
         allow read: if true;
         allow create: if !exists(/databases/$(database)/documents/teams/$(teamId));
         allow delete: if request.auth != null;
         allow update: if request.auth != null
           || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['pendingLogoBase64', 'pendingLogoStatus']);
       }
     }
   }
   ```

   Since you created exactly one Authentication user (your admin), any signed-in request is trusted. If you ever add more Firebase Auth users, tighten the `request.auth != null` checks to `request.auth.token.email == 'admin@your-tournament.local'`.

   **On the logo access code:** the code entered on the Team Logo page is checked client-side against the team's public data before uploading — it's a light social gate to stop casual visitors from changing a team's logo by accident, not cryptographic security (since `teams` is public-read, a technically determined person could bypass it). The rule above only limits the *blast radius*: even without the code, the absolute most a non-admin write can ever touch is a team's `pendingLogoBase64`/`pendingLogoStatus` fields — never scores, points, the live `logoBase64`, or any other data. That tradeoff was chosen deliberately to avoid needing Firebase Storage (which now requires a paid Blaze plan just to enable, even within the free-usage tier).

   **On logo moderation:** an uploaded logo is never shown publicly right away. It's written to `pendingLogoBase64`/`pendingLogoStatus` (a field only a non-admin is allowed to write), and only becomes the live, publicly-shown `logoBase64` once an admin approves it from the Admin panel's "Logo Approvals" card — a field only an authenticated admin can write.

9. Open the app (see **Running locally** below, or your deployed URL) — the first load auto-generates the 25 teams / 50-match schedule into Firestore, and every subsequent visitor shares that same live data.

**Firestore free tier** comfortably covers a single tournament's traffic (50k reads / 20k writes per day) at no cost — and this app never needs Firebase Storage or the Blaze plan.

## Running locally

Serve the folder over HTTP — ES module imports (including the Firebase SDK) are blocked under the `file://` protocol, so opening `index.html` directly will show a blank dashboard.

```bash
cd carrom-tournament
python3 -m http.server 8080
# or: npx serve .
```

Then open http://localhost:8080.

## Deployment

Static hosting only — push this folder to **GitHub Pages**, **Netlify**, or **Vercel**. No environment variables or servers needed; all Firebase calls happen client-side using the config you pasted into `firebase-config.js`. Once deployed, share the URL with anyone — they'll see live tournament data with read-only access; only your admin login can edit.

## Project structure

```
carrom-tournament/
├── index.html
├── manifest.json
├── service-worker.js
├── assets/
│   ├── css/        # style, responsive, and one file per module
│   └── js/         # app.js entrypoint + one module per feature
│                    #   storage.js talks to Firestore; firebase-config.js holds your project keys
└── data/           # reference JSON snapshot of the generated seed data (not used at runtime)
```

## Admin login

Sign in on the **Admin** tab with the password of the Firebase Authentication user you created in step 6 above. There's no separate app-level password — Firebase handles auth, and Firestore security rules enforce that only that signed-in account can write.
