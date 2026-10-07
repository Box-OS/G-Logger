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
    { name: 'Deep work', color: 'BLUE' }, { name: 'Class', color: 'GREEN' },
    { name: 'App', color: 'MAUVE' }, { name: 'Gym', color: 'RED' },
    { name: 'Admin', color: 'YELLOW' }, { name: 'Leisure', color: 'GRAY' },
  ],
};

const props = () => PropertiesService.getUserProperties();
const readJSON = k => { const v = props().getProperty(k); return v ? JSON.parse(v) : null; };
const label = (cat, title) => (title ? `${cat} · ${title}` : cat);

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Time Log')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getInit() {
  return { settings: getSettings(), colors: COLORS, running: readJSON('running') };
}

function getSettings() {
  return readJSON('settings') || DEFAULTS;
}

function saveSettings(s) {
  const calendar = String(s.calendar || '').trim() || DEFAULTS.calendar;
  const seen = new Set();
  const cats = (s.cats || [])
    .map(c => ({ name: String(c.name || '').trim(), color: COLORS[c.color] ? c.color : 'GRAY' }))
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
function start(catName, title) {
  if (readJSON('running')) stop();
  const st = getSettings();
  const cat = st.cats.find(c => c.name === catName);
  if (!cat) throw new Error('Unknown category: ' + catName);
  const cal = getCalendar_(st.calendar);
  const now = new Date();
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
  props().deleteProperty('running');
  return null;
}

// Deletes the running timer's event (for accidental starts).
function cancel() {
  const s = readJSON('running');
  if (!s) return null;
  const ev = runningEvent_(s);
  if (ev) ev.deleteEvent();
  props().deleteProperty('running');
  return null;
}
