/* Standard calendar interchange for TVZA.
   ICS is intentionally provider-neutral: Google Calendar, Outlook/Exchange,
   Apple Calendar and Samsung Calendar can all import/export this format. */

const pad = value => String(value).padStart(2, '0');

function unescapeText(value = '') {
  return String(value)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function escapeText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function dateParts(value = '') {
  const match = String(value).match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/
  );
  if (!match) return null;

  if (match[7]) {
    const utc = new Date(Date.UTC(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)
    ));
    return {
      date: `${utc.getFullYear()}-${pad(utc.getMonth() + 1)}-${pad(utc.getDate())}`,
      time: match[4] ? `${pad(utc.getHours())}:${pad(utc.getMinutes())}` : '',
      allDay: !match[4]
    };
  }

  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: match[4] ? `${match[4]}:${match[5]}` : '',
    allDay: !match[4]
  };
}

function addDays(dateKey, amount) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readComponent(lines, name) {
  const start = `BEGIN:${name}`;
  const end = `END:${name}`;
  const components = [];
  let current = null;

  for (const line of lines) {
    if (line === start) {
      current = {};
      continue;
    }
    if (line === end) {
      if (current) components.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const rawName = line.slice(0, colon);
    const key = rawName.split(';')[0].toUpperCase();
    current[key] = {
      value: line.slice(colon + 1),
      params: rawName.slice(key.length)
    };
  }
  return components;
}

export function parseCalendarIcs(source) {
  const lines = String(source || '')
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .split(/\r?\n/)
    .map(line => line.trimEnd());

  const events = readComponent(lines, 'VEVENT').map(item => {
    const start = dateParts(item.DTSTART?.value);
    const rawEnd = dateParts(item.DTEND?.value);
    if (!start) return null;
    const allDay = /VALUE=DATE/i.test(item.DTSTART?.params || '') || start.allDay;
    const endDate = rawEnd?.date
      ? (allDay ? addDays(rawEnd.date, -1) : rawEnd.date)
      : start.date;
    return {
      uid: unescapeText(item.UID?.value || ''),
      title: unescapeText(item.SUMMARY?.value || 'Importierter Termin'),
      description: unescapeText(item.DESCRIPTION?.value || ''),
      location: unescapeText(item.LOCATION?.value || ''),
      startDate: start.date,
      endDate,
      startTime: allDay ? '' : start.time,
      endTime: allDay ? '' : (rawEnd?.time || ''),
      allDay,
      source: 'ics'
    };
  }).filter(Boolean);

  const reminders = readComponent(lines, 'VTODO').map(item => {
    const due = dateParts(item.DUE?.value || item.DTSTART?.value);
    if (!due) return null;
    return {
      uid: unescapeText(item.UID?.value || ''),
      title: unescapeText(item.SUMMARY?.value || 'Importierte Erinnerung'),
      notes: unescapeText(item.DESCRIPTION?.value || ''),
      date: due.date,
      time: due.time,
      completed: String(item.STATUS?.value || '').toUpperCase() === 'COMPLETED',
      source: 'ics'
    };
  }).filter(Boolean);

  return { events, reminders };
}

function compactDate(date = '') {
  return String(date).replace(/-/g, '');
}

function calendarDate(date, time, end = false) {
  if (!time) {
    const key = end ? addDays(date, 1) : date;
    return `;VALUE=DATE:${compactDate(key)}`;
  }
  return `:${compactDate(date)}T${String(time).replace(':', '')}00`;
}

function eventLines(event, index) {
  const startDate = event.startDate || event.date;
  const endDate = event.endDate || startDate;
  if (!startDate) return [];
  return [
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid || event.id || `event-${index}@tvza`)}`,
    `DTSTAMP:${compactDate(new Date().toISOString().slice(0, 10))}T000000Z`,
    `SUMMARY:${escapeText(event.title || event.name || 'Termin')}`,
    `DTSTART${calendarDate(startDate, event.startTime)}`,
    `DTEND${calendarDate(endDate, event.endTime || event.startTime, !event.startTime)}`,
    event.location || event.destination
      ? `LOCATION:${escapeText(event.location || event.destination)}`
      : '',
    event.description || event.notes
      ? `DESCRIPTION:${escapeText(event.description || event.notes)}`
      : '',
    'END:VEVENT'
  ].filter(Boolean);
}

function reminderLines(reminder, index) {
  if (!reminder.date) return [];
  return [
    'BEGIN:VTODO',
    `UID:${escapeText(reminder.uid || reminder.id || `reminder-${index}@tvza`)}`,
    `DTSTAMP:${compactDate(new Date().toISOString().slice(0, 10))}T000000Z`,
    `SUMMARY:${escapeText(reminder.title || 'Erinnerung')}`,
    `DUE${calendarDate(reminder.date, reminder.time)}`,
    reminder.notes ? `DESCRIPTION:${escapeText(reminder.notes)}` : '',
    reminder.completed ? 'STATUS:COMPLETED' : 'STATUS:NEEDS-ACTION',
    'END:VTODO'
  ].filter(Boolean);
}

export function buildCalendarIcs({
  events = [],
  reminders = [],
  calendarName = 'TVZA'
} = {}) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//TVZA//Kalender und Erinnerungen//DE',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...events.flatMap(eventLines),
    ...reminders.flatMap(reminderLines),
    'END:VCALENDAR'
  ].join('\r\n');
}
