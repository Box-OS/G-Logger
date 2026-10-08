// Time Log: start/stop timer that writes events to a Google Calendar.
// Categories and the target calendar are edited in the app (⚙), not here.

const COLORS = { // Apps Script color id: [Google Calendar name, hex]
  PALE_BLUE: ['Lavender', '#7986cb'], PALE_GREEN: ['Sage', '#33b679'], MAUVE: ['Grape', '#8e24aa'],
  PALE_RED: ['Flamingo', '#e67c73'], YELLOW: ['Banana', '#f6bf26'], ORANGE: ['Tangerine', '#f4511e'],
  CYAN: ['Peacock', '#039be5'], GRAY: ['Graphite', '#616161'], BLUE: ['Blueberry', '#3f51b5'],
  GREEN: ['Basil', '#0b8043'], RED: ['Tomato', '#d50000'],
};

const DEFAULTS = {
  calendar: 'Log',
  cats: [
    { name: 'School', color: 'GREEN', icon: 'book' }, { name: 'Study', color: 'BLUE', icon: 'target' },
    { name: 'Gym', color: 'RED', icon: 'dumbbell' }, { name: 'Work', color: 'YELLOW', icon: 'briefcase' },
    { name: 'Leisure', color: 'MAUVE', icon: 'game' }, { name: 'Other', color: 'GRAY', icon: 'star' },
  ],
};
const NAME_MAX = 12;

const props = () => PropertiesService.getUserProperties();
const readJSON = k => { const v = props().getProperty(k); return v ? JSON.parse(v) : null; };
const label = (cat, title) => (title ? `${cat} · ${title}` : cat);

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Time Log')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getInit() {
  const running = readJSON('running'), last = readJSON('lastStopped');
  const lastStopped = !running && last && Date.now() - last.end < RESUME_WINDOW_MS ? last : null;
  return { settings: getSettings(), colors: COLORS, running, lastStopped };
}

const RESUME_WINDOW_MS = 10 * 60 * 1000;

function getSettings() {
  return readJSON('settings') || DEFAULTS;
}

function saveSettings(s) {
  const calendar = String(s.calendar || '').trim() || DEFAULTS.calendar;
  const seen = new Set();
  const cats = (s.cats || [])
    .map(c => ({ name: String(c.name || '').trim().slice(0, NAME_MAX).trim(), color: COLORS[c.color] ? c.color : 'GRAY', icon: String(c.icon || '').replace(/[^a-z]/g, '').slice(0, 16) }))
    .filter(c => c.name && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()));
  if (!cats.length) throw new Error('Add at least one category.');
  getCalendar_(calendar); // creates the calendar now if it doesn't exist
  props().setProperty('settings', JSON.stringify({ calendar, cats }));
  return getInit();
}

// "primary" = your main calendar; any other name is found or created.
function getCalendar_(name) {
  if (name.toLowerCase() === 'primary') return CalendarApp.getDefaultCalendar();
  return CalendarApp.getOwnedCalendarsByName(name)[0] || CalendarApp.createCalendar(name);
}

function runningEvent_(s) {
  const cal = CalendarApp.getCalendarById(s.calId);
  return cal ? cal.getEventById(s.id) : null;
}

// Starts a timer. If one is already running it's stopped first, so tapping another category switches.
// startMs is the moment the phone started counting, so the server's clock matches what's on screen.
function start(catName, title, startMs) {
  if (readJSON('running')) stop();
  props().deleteProperty('lastStopped');   // switching tasks isn't something to undo
  const st = getSettings();
  const cat = st.cats.find(c => c.name === catName);
  if (!cat) throw new Error('Unknown category: ' + catName);
  const cal = getCalendar_(st.calendar);
  const t = Date.now(), want = Number(startMs);
  const now = new Date(want && Math.abs(t - want) < 5 * 60000 ? Math.min(t, want) : t);
  const ev = cal.createEvent('⏱ ' + label(cat.name, title), now, new Date(now.getTime() + 60000));
  ev.setColor(CalendarApp.EventColor[cat.color]);
  const s = { calId: cal.getId(), id: ev.getId(), cat: cat.name, color: cat.color, title: title || '', start: now.getTime() };
  props().setProperty('running', JSON.stringify(s));
  return s;
}

// Sets the real end time and removes the ⏱ marker.
function stop() {
  const s = readJSON('running');
  if (!s) return null;
  const ev = runningEvent_(s);
  if (ev) {
    ev.setTime(new Date(s.start), new Date(Math.max(Date.now(), s.start + 60000)));
    ev.setTitle(label(s.cat, s.title));
  }
  props().setProperty('lastStopped', JSON.stringify(Object.assign({}, s, { end: Date.now() })));
  props().deleteProperty('running');
  return null;
}

// Undoes the last stop: the same calendar event keeps running from its original start.
function resume() {
  if (readJSON('running')) throw new Error('A timer is already running.');
  const s = readJSON('lastStopped');
  if (!s || Date.now() - s.end > RESUME_WINDOW_MS) throw new Error('There is no recent session to resume.');
  const ev = runningEvent_(s);
  if (!ev) throw new Error('That session is no longer in your calendar.');
  ev.setTime(new Date(s.start), new Date(Math.max(Date.now(), s.start + 60000)));
  ev.setTitle('⏱ ' + label(s.cat, s.title));
  delete s.end;
  props().setProperty('running', JSON.stringify(s));
  props().deleteProperty('lastStopped');
  return s;
}

// Moves the running timer's start time (for when you forgot to start it).
function setStart(ms) {
  const s = readJSON('running');
  if (!s) throw new Error('No timer is running.');
  const now = Date.now();
  ms = Math.min(Number(ms), now);
  if (!(ms > now - 24 * 3600e3)) throw new Error('The start time has to be within the last 24 hours.');
  const ev = runningEvent_(s);
  if (ev) ev.setTime(new Date(ms), new Date(Math.max(now, ms + 60000)));
  s.start = ms;
  props().setProperty('running', JSON.stringify(s));
  return s;
}

// Deletes the running timer's event (for accidental starts).
function cancel() {
  const s = readJSON('running');
  if (!s) return null;
  const ev = runningEvent_(s);
  if (ev) ev.deleteEvent();
  props().deleteProperty('running');
  props().deleteProperty('lastStopped');
  return null;
}

// ---------- history ----------

// Calendar color id ("1".."11") -> our color key.
function colorKeyOf_(ev) {
  const c = ev.getColor();
  return Object.keys(COLORS).find(k => String(CalendarApp.EventColor[k]) === String(c)) || 'GRAY';
}

// Logged sessions between two timestamps (ms), excluding the running one.
function history(fromMs, toMs) {
  const st = getSettings();
  const cal = getCalendar_(st.calendar);
  const r = readJSON('running');
  return cal.getEvents(new Date(fromMs), new Date(toMs))
    .filter(e => !e.isAllDayEvent() && !(r && e.getId() === r.id))
    .map(e => {
      const t = e.getTitle().replace(/^⏱\s*/, '');
      const i = t.indexOf(' · ');
      const cat = i >= 0 ? t.slice(0, i) : t;
      const known = st.cats.find(c => c.name === cat);
      return {
        id: e.getId(), cat, title: i >= 0 ? t.slice(i + 3) : '',
        color: known ? known.color : colorKeyOf_(e),
        start: e.getStartTime().getTime(), end: e.getEndTime().getTime(),
      };
    });
}

// Creates (no id) or updates (id) a logged session.
function saveEntry(x) {
  const st = getSettings();
  const cat = st.cats.find(c => c.name === x.cat);
  if (!cat) throw new Error('Unknown category: ' + x.cat);
  const start = new Date(Number(x.start)), end = new Date(Number(x.end));
  if (!(end > start)) throw new Error('End time must be after the start time.');
  const cal = getCalendar_(st.calendar);
  const title = label(cat.name, String(x.title || '').trim());
  let ev;
  if (x.id) {
    ev = cal.getEventById(x.id);
    if (!ev) throw new Error('That entry no longer exists in your calendar.');
    ev.setTitle(title);
    ev.setTime(start, end);
  } else {
    ev = cal.createEvent(title, start, end);
  }
  ev.setColor(CalendarApp.EventColor[cat.color]);
  return ev.getId();
}

function deleteEntry(id) {
  const ev = getCalendar_(getSettings().calendar).getEventById(id);
  if (ev) ev.deleteEvent();
  return null;
}
