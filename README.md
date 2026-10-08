# G-Log — Google Calendar Time Logger

A one-tap start/stop timer that logs how you spend your time directly to Google Calendar. Built as a Google Apps Script web app, so it runs on Google's servers with no backend, database, or hosting of its own, and works from any phone or laptop browser.

## Try it

**[Open G-Log](https://script.google.com/macros/s/AKfycbxrJuZHOgyapJ5-xch7WRGy6MVgpkcG3ndafGpZyFknDFQ5Y07TQqJw8CCXciXdVmq2Og/exec)**. Any Google account works, and nothing to install.

1. Open the link and sign in with Google.
2. Approve Calendar access. The app is not verified by Google yet, so you'll see a warning first: choose **Advanced → Go to … (unsafe)** to continue.
3. Add it to your home screen: on iPhone, Safari → Share → **Add to Home Screen**; on Android, Chrome → ⋮ → **Add to Home screen**.

The app runs as *you*: it only ever touches your own calendar, and creates a calendar named **Log** on first use (changeable in Settings). Your categories and running timer are stored privately in your Google account; the developer can't see them.

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
- Swipeable Timer, Today, History and Settings screens.
- Instant UI with background saves, haptics, light and dark mode, and an optional **Sport mode**.

</details>

## How it works

| File | Role |
| --- | --- |
| `Code.gs` | Server side: serves the page (`doGet`), and exposes the timer (`start`, `stop`, `resume`, `cancel`, `setStart`), settings (`getInit`, `saveSettings`) and the log editor (`history`, `saveEntry`, `deleteEntry`), all built on `CalendarApp`. |
| `index.html` | Client UI (vanilla HTML/CSS/JS). Calls the server through `google.script.run`. |
| `.github/workflows/apps-script.yml` | Uploads the code to Apps Script on every push with clasp, and deploys the live version on demand. |
| `appsscript.json` | Manifest: V8 runtime; the web app runs as the user accessing it and is open to anyone with a Google account, so each person logs to their own calendar. |

State (settings and the currently running timer) is stored per user in `PropertiesService`, so the timer survives closing the tab or switching devices, and every user's data stays separate.

## Tech

Google Apps Script (V8), CalendarApp, PropertiesService, HtmlService, vanilla JavaScript, clasp and GitHub Actions.
