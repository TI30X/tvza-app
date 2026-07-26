const pad = value => String(value).padStart(2, '0');

export const CALENDAR_VIEWS = [
  { key:'day', label:'Tag' },
  { key:'3day', label:'3 Tage' },
  { key:'workweek', label:'Arbeitswoche' },
  { key:'week', label:'Woche' },
  { key:'month', label:'Monat' },
  { key:'agenda', label:'Terminübersicht' },
];

export const CALENDAR_STYLES = {
  google: {
    key:'google',
    name:'Google Kalender',
    description:'Ruhig, rund und mit Terminübersicht',
    defaultView:'month',
    agendaLabel:'Terminübersicht',
  },
  outlook: {
    key:'outlook',
    name:'Outlook',
    description:'Kompakt, klar und auf die Arbeitswoche ausgerichtet',
    defaultView:'workweek',
    agendaLabel:'Agenda',
  },
};

export const CALENDAR_COLORS = [
  { value:'#7f77dd', label:'Violett', ink:'#ffffff' },
  { value:'#2f6fed', label:'Blau', ink:'#ffffff' },
  { value:'#1d9e75', label:'Grün', ink:'#ffffff' },
  { value:'#e0b52f', label:'Gelb', ink:'#342b00' },
  { value:'#d8761d', label:'Orange', ink:'#ffffff' },
  { value:'#d4537e', label:'Pink', ink:'#ffffff' },
  { value:'#1d9e9e', label:'Türkis', ink:'#ffffff' },
  { value:'#777674', label:'Grau', ink:'#ffffff' },
];

export const DEFAULT_CALENDAR_COLOR = CALENDAR_COLORS[0].value;

export function normalizeCalendarColor(value, fallback = DEFAULT_CALENDAR_COLOR) {
  return CALENDAR_COLORS.some(color => color.value === value) ? value : fallback;
}

export function calendarColorInk(value) {
  return CALENDAR_COLORS.find(color => color.value === value)?.ink || '#ffffff';
}

export function dateKey(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addCalendarDays(value, amount) {
  const date = value instanceof Date
    ? new Date(value.getFullYear(), value.getMonth(), value.getDate())
    : new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function startOfCalendarWeek(value) {
  const date = value instanceof Date
    ? new Date(value.getFullYear(), value.getMonth(), value.getDate())
    : new Date(`${value}T00:00:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return dateKey(date);
}

export function datesForCalendarView(anchor, view) {
  if (view === 'day') return [dateKey(anchor)];
  if (view === '3day') return [0, 1, 2].map(offset => addCalendarDays(anchor, offset));
  if (view === 'workweek') {
    const monday = startOfCalendarWeek(anchor);
    return [0, 1, 2, 3, 4].map(offset => addCalendarDays(monday, offset));
  }
  if (view === 'week') {
    const monday = startOfCalendarWeek(anchor);
    return [0, 1, 2, 3, 4, 5, 6].map(offset => addCalendarDays(monday, offset));
  }
  return [];
}

export function moveCalendarAnchor(anchor, view, direction) {
  const step = direction < 0 ? -1 : 1;
  if (view === 'day') return addCalendarDays(anchor, step);
  if (view === '3day') return addCalendarDays(anchor, step * 3);
  if (view === 'workweek' || view === 'week') return addCalendarDays(anchor, step * 7);
  if (view === 'agenda') return addCalendarDays(anchor, step * 30);

  const date = new Date(`${anchor}T00:00:00`);
  date.setMonth(date.getMonth() + step, 1);
  return dateKey(date);
}

function shortDate(value, includeYear = false) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('de-CH', {
    day:'numeric',
    month:'short',
    ...(includeYear ? { year:'numeric' } : {}),
  });
}

export function calendarRangeTitle(anchor, view) {
  const anchorDate = new Date(`${anchor}T00:00:00`);
  if (view === 'month') {
    return anchorDate.toLocaleDateString('de-CH', { month:'long', year:'numeric' });
  }
  if (view === 'agenda') return 'Kommende Termine';

  const dates = datesForCalendarView(anchor, view);
  if (dates.length === 1) {
    return new Date(`${dates[0]}T00:00:00`).toLocaleDateString('de-CH', {
      weekday:'long', day:'numeric', month:'long', year:'numeric',
    });
  }
  const first = new Date(`${dates[0]}T00:00:00`);
  const last = new Date(`${dates[dates.length - 1]}T00:00:00`);
  const includeFirstYear = first.getFullYear() !== last.getFullYear();
  return `${shortDate(dates[0], includeFirstYear)} – ${shortDate(dates.at(-1), true)}`;
}

export function normalizeCalendarPreference(raw = {}) {
  const style = CALENDAR_STYLES[raw.style] ? raw.style : 'google';
  const validViews = new Set(CALENDAR_VIEWS.map(view => view.key));
  const view = validViews.has(raw.view) ? raw.view : CALENDAR_STYLES[style].defaultView;
  const personalColor = normalizeCalendarColor(raw.personalColor);
  return { style, view, personalColor };
}
