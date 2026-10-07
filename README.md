# G-Log — Google Calendar Time Logger

A one-tap start/stop timer that logs how you spend your time directly to Google Calendar. Built as a Google Apps Script web app, so it runs on Google's servers with no backend, database, or hosting of its own, and works from any phone or laptop browser.

## Try it

**[Open G-Log](https://script.google.com/macros/s/AKfycbxrJuZHOgyapJ5-xch7WRGy6MVgpkcG3ndafGpZyFknDFQ5Y07TQqJw8CCXciXdVmq2Og/exec)**. Any Google account works, and nothing to install.

1. Open the link and sign in with Google.
2. Approve Calendar access. The app is not verified by Google yet, so you'll see a warning first: choose **Advanced → Go to … (unsafe)** to continue.
3. Add it to your home screen: on iPhone, Safari → Share → **Add to Home Screen**; on Android, Chrome → ⋮ → **Add to Home screen**.

The app runs as *you*: it only ever touches your own calendar, and creates a calendar named **Log** on first use (changeable in ⚙). Your categories and running timer are stored privately in your Google account; the developer can't see them.

## Features

- **Hold to start**: pick a category, then press and hold the big timer button; a ring in the category's colour fills and the session starts. Hold again to stop, or pick another category and hold to switch.
- **Focus screen**: starting a session floods the screen with the category's colour in a liquid fill; the focus view shows the timer and the category in large type, and holding anywhere drains it to stop.
- **Today timeline**: a zoomable vertical line of today's sessions as coloured blobs (pinch or ± to zoom); tap a blob for details and editing.
- **Forgot to start?** While a timer runs, tap **+5** to move its start 5 minutes earlier (or **−5** to undo); the calendar event follows.
- **Calendar as the database**: every session becomes a real, colour-coded Google Calendar event, so your week sits alongside your schedule.
- **History and editing**: browse past days with per-day totals and a category split; tap any entry to change its category, details or times, delete it, or add one you forgot to time.
- **Instant UI**: taps update the screen immediately while saves happen in the background, and roll back with a clear message if a save fails.
- **Optional detail** per session (e.g. `Deep work · EECS3101 PS2`) and a discard button for accidental starts.
- **In-app settings**: choose the target calendar (created automatically if missing, or `primary`) and edit categories and their colours.
- **Light and dark mode**, following the system by default with a manual toggle; mobile-first layout.

## How it works

| File | Role |
| --- | --- |
| `Code.gs` | Server side: serves the page (`doGet`), and exposes `start`, `stop`, `cancel`, `getInit`, `saveSettings`, and `history`, `saveEntry`, `deleteEntry` for the log editor, all built on `CalendarApp`. |
| `index.html` | Client UI (vanilla HTML/CSS/JS). Calls the server through `google.script.run`. |
| `appsscript.json` | Manifest: V8 runtime; the web app runs as the user accessing it and is open to anyone with a Google account, so each person logs to their own calendar. |

State (settings and the currently running timer) is stored per user in `PropertiesService`, so the timer survives closing the tab or switching devices, and every user's data stays separate.

## Run your own copy

Only needed if you want to modify the code; otherwise just use the link above. Uses [clasp](https://github.com/google/clasp), Google's command-line tool for Apps Script (requires Node.js).

1. Turn on the **Google Apps Script API** at [script.google.com/home/usersettings](https://script.google.com/home/usersettings).
2. Clone the repo and push it to a new Apps Script project:

```bash
npm install -g @google/clasp
git clone https://github.com/Box-OS/g-log.git && cd g-log
clasp login
clasp create --type webapp --title "G-Log" --rootDir .
git checkout appsscript.json   # clasp create replaces the manifest; restore the repo's version
clasp push --force
clasp deploy
```

3. Open the web app URL that `clasp deploy` prints (or find it under **Deploy → Manage deployments** in the editor) and authorize Calendar access.

While developing, `clasp push --watch` uploads every saved change, and the editor's **Deploy → Test deployments** URL always runs the latest code.

## Tech

Google Apps Script (V8), CalendarApp, PropertiesService, HtmlService, vanilla JavaScript.
