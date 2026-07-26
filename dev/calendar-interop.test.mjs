import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarIcs,
  parseCalendarIcs
} from '../assets/js/calendar-interop.js';

test('imports timed and all-day events plus reminders', () => {
  const source = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:event-1',
    'SUMMARY:Training\\, Halle 2',
    'DTSTART:20260803T183000',
    'DTEND:20260803T200000',
    'LOCATION:Zürich',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:event-2',
    'SUMMARY:Ferien',
    'DTSTART;VALUE=DATE:20260810',
    'DTEND;VALUE=DATE:20260813',
    'END:VEVENT',
    'BEGIN:VTODO',
    'UID:todo-1',
    'SUMMARY:Pass einpacken',
    'DUE:20260809T180000',
    'STATUS:NEEDS-ACTION',
    'END:VTODO',
    'END:VCALENDAR'
  ].join('\r\n');

  const result = parseCalendarIcs(source);
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events[0], {
    uid: 'event-1',
    title: 'Training, Halle 2',
    description: '',
    location: 'Zürich',
    startDate: '2026-08-03',
    endDate: '2026-08-03',
    startTime: '18:30',
    endTime: '20:00',
    allDay: false,
    source: 'ics'
  });
  assert.equal(result.events[1].endDate, '2026-08-12');
  assert.equal(result.reminders[0].time, '18:00');
});

test('exports a provider-neutral calendar that can be imported again', () => {
  const source = buildCalendarIcs({
    calendarName: 'Familie',
    events: [{
      id: 'event-1',
      title: 'Zahnarzt',
      startDate: '2026-09-04',
      endDate: '2026-09-04',
      startTime: '09:15',
      endTime: '10:00',
      location: 'Bern'
    }],
    reminders: [{
      id: 'reminder-1',
      title: 'Versicherung bezahlen',
      date: '2026-09-01',
      time: '17:00',
      completed: false
    }]
  });

  assert.match(source, /BEGIN:VEVENT/);
  assert.match(source, /BEGIN:VTODO/);
  const roundTrip = parseCalendarIcs(source);
  assert.equal(roundTrip.events[0].title, 'Zahnarzt');
  assert.equal(roundTrip.events[0].startTime, '09:15');
  assert.equal(roundTrip.reminders[0].title, 'Versicherung bezahlen');
});
