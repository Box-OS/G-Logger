# G&lt;Logger — Google Calendar Time Logger

A hold-to-start timer that logs how you spend your time straight into Google Calendar. It's an installable web app: a static front end that calls the Google Calendar API directly, plus a small serverless function for Google sign-in. Your calendar is the database, so there's no server-side storage.

## Try it

**[Open G&lt;Logger](https://g-logger.launchbeta.workers.dev)**. Any Google account works.

1. Tap **Continue with Google** and allow Calendar access. The app isn't verified by Google yet, so you'll see a warning first: choose **Advanced → Go to G&lt;Logger**.
2. Add it to your home screen: on iPhone, Safari → Share → **Add to Home Screen**; on Android, Chrome → ⋮ → **Install app**.

It only touches your own Google account: it creates a calendar named **Log** (changeable in Settings) and keeps your settings in a private app-data file in your Drive that it alone can see. See the [privacy policy](https://g-logger.launchbeta.workers.dev/privacy.html).

## Features

<details>
<summary><b>Show all features</b></summary>

**Tracking**
- **Hold to start and stop.** Pick a category on the arc-shaped picker, then hold the timer circle for 3 seconds. Starting floods the screen with the category's colour; stopping pulls it back into the circle like iron filings to a magnet.
- **Focus screen** with the live timer and the category in large type. Minimise it into a floating bubble and tap to bring it back.
- **Forgot to start?** Tap **+5** to move the start 5 minutes earlier.
- **Stop confirmation**: a notification-style banner ("You logged 20m of Study") whose **Undo** removes that session, plus a **Continue** button that resumes it instead.

**Your log**
- **Google Calendar is the database.** Every session is a real, colour-coded event.
- **Today timeline**: a zoomable vertical line of today's sessions.
- **History**: per-day totals, tap to edit, swipe left to delete (with undo), or add an entry you forgot to time.

**Feel**
- Swipeable Log, Today, History and Settings screens.
- Instant UI with background saves, haptics, light and dark mode, and an optional **Sport mode**.

</details>

## How it works

| File | Role |
| --- | --- |
| `index.html` | The whole app (vanilla HTML/CSS/JS). A small client (`GLOG`) talks to the Calendar REST API for sessions, keeps settings in a Drive `appDataFolder` file, and tags the running session's event so every device sees the same timer. |
| `worker/worker.js` | Cloudflare Worker for the OAuth 2.0 authorization-code flow. The refresh token lives in an AES-GCM-encrypted, HttpOnly cookie, so nothing is stored server-side; the page gets short-lived access tokens from `/auth/token`. |
| `worker/push.js` | Web Push from scratch with Web Crypto: payload encryption (RFC 8291) and VAPID signing (RFC 8292). A cron trigger checks running timers every 10 minutes and sends a reminder when one runs too long. |
| `public/` | Web app manifest, icons, the service worker that shows notifications, and the privacy policy. |
| `wrangler.toml` | Serves `public/` and the worker from one origin, so the sign-in cookie is first-party. |
| `.github/workflows/cloudflare.yml` | Publishes to Cloudflare on every push to `main`. |

**Design notes**
- **Google Calendar is the database.** Each session is a real, colour-coded event you can see in any calendar app.
- **One timer across devices.** The running session is a calendar event marked in its private extended properties; starting checks Google first, so only one log can run at a time.
- **Instant UI.** The app draws from an on-device cache straight away and refreshes from Google in the background; actions update the screen first and sync after.
- **Least privilege.** Scopes are limited to Calendar, Drive app data (not your files) and your email address.

It began as a Google Apps Script web app and was rebuilt as a standalone app for speed, a real home-screen install, and a proper OAuth setup. Setup for your own copy is in [SETUP.md](SETUP.md).

## Tech

Vanilla JavaScript, Google Calendar and Drive REST APIs, OAuth 2.0, Cloudflare Workers, Web App Manifest, GitHub Actions.
