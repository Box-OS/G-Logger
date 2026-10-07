# G-Log — Google Calendar Time Logger

A one-tap start/stop timer that logs how you spend your time directly to Google Calendar. Built as a Google Apps Script web app, so it runs on Google's servers with no backend, database, or hosting of its own, and works from any phone or laptop browser.

## Try it

**[Open G-Log](https://script.google.com/macros/s/AKfycbxrJuZHOgyapJ5-xch7WRGy6MVgpkcG3ndafGpZyFknDFQ5Y07TQqJw8CCXciXdVmq2Og/exec)**. Any Google account works, and nothing to install.

1. Open the link and sign in with Google.
2. Approve Calendar access. The app is not verified by Google yet, so you'll see a warning first: choose **Advanced → Go to … (unsafe)** to continue.
3. Add it to your home screen: on iPhone, Safari → Share → **Add to Home Screen**; on Android, Chrome → ⋮ → **Add to Home screen**.

The app runs as *you*: it only ever touches your own calendar, and creates a calendar named **Log** on first use (changeable in ⚙). Your categories and running timer are stored privately in your Google account; the developer can't see them.

## Features

- **One-tap tracking**: tap a category to start a timer; tap another to switch, which closes the previous block automatically.
- **Calendar as the database**: every session becomes a real, color-coded Google Calendar event, so your week is visible alongside your schedule.
- **Live running indicator**: the event is created immediately with a ⏱ marker and finalized with the true end time on stop.
- **Optional detail**: add a note per session (e.g. `Deep work · EECS3101 PS2`).
- **Discard**: delete an accidental start without leaving a stray event.
- **In-app settings**: choose the target calendar (created automatically if missing, or `primary`) and edit categories and their Google Calendar colors.
- **Mobile-first UI** with automatic dark mode.

## How it works

| File | Role |
| --- | --- |
| `Code.gs` | Server side: serves the page (`doGet`), and exposes `start`, `stop`, `cancel`, `getInit` and `saveSettings`, which use `CalendarApp` to create and update events. |
| `index.html` | Client UI (vanilla HTML/CSS/JS). Calls the server through `google.script.run`. |
| `appsscript.json` | Manifest: V8 runtime; the web app runs as the user accessing it and is open to anyone with a Google account, so each person logs to their own calendar. |

State (settings and the currently running timer) is stored per user in `PropertiesService`, so the timer survives closing the tab or switching devices, and every user's data stays separate.

## Run your own copy

Only needed if you want to modify the code; otherwise just use the link above.


**Option A: Apps Script editor**

1. Create a new project at [script.google.com](https://script.google.com).
2. Copy in `Code.gs`, add an HTML file named `index` with the contents of `index.html`, and replace the manifest with `appsscript.json` (enable *Show "appsscript.json"* in Project Settings).
3. **Deploy → New deployment → Web app**, then authorize Calendar access.
4. Open the web app URL and add it to your phone's home screen.

**Option B: [clasp](https://github.com/google/clasp)**

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "Time Log"
clasp push
clasp deploy
```

## Tech

Google Apps Script (V8), CalendarApp, PropertiesService, HtmlService, vanilla JavaScript.
