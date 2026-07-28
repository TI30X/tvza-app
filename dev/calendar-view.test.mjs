import test from 'node:test';
import assert from 'node:assert/strict';
import {
  datesForCalendarView,
  moveCalendarAnchor,
  calendarRangeTitle,
  calendarColorInk,
  normalizeCalendarPreference,
} from '../assets/js/calendar-view.js';

test('day, three-day and work-week views use familiar ranges', () => {
  assert.deepEqual(datesForCalendarView('2026-07-29', 'day'), ['2026-07-29']);
  assert.deepEqual(datesForCalendarView('2026-07-29', '3day'), [
    '2026-07-29', '2026-07-30', '2026-07-31',
  ]);
  assert.deepEqual(datesForCalendarView('2026-07-29', 'workweek'), [
    '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31',
  ]);
});

test('week navigation advances in the same-sized range', () => {
  assert.equal(moveCalendarAnchor('2026-07-29', 'day', 1), '2026-07-30');
  assert.equal(moveCalendarAnchor('2026-07-29', '3day', 1), '2026-08-01');
  assert.equal(moveCalendarAnchor('2026-07-29', 'week', -1), '2026-07-22');
  assert.equal(moveCalendarAnchor('2026-07-29', 'month', 1), '2026-08-01');
});

test('view title and preference fallback are stable', () => {
  assert.match(calendarRangeTitle('2026-07-29', 'month'), /Juli 2026/);
  assert.match(calendarRangeTitle('2026-07-29', 'week'), /27\. Juli.*2\. Aug/);
  assert.match(calendarRangeTitle('2026-07-29', 'agenda'), /Juli 2026/);
  assert.equal(moveCalendarAnchor('2026-07-31', 'agenda', 1), '2026-08-01');
  assert.deepEqual(normalizeCalendarPreference({ style:'outlook' }), {
    style:'outlook',
    view:'workweek',
    personalColor:'#7f77dd',
    showGroupFeatures:false,
  });
  assert.deepEqual(normalizeCalendarPreference({ style:'unknown', view:'nope', personalColor:'#e0b52f' }), {
    style:'google',
    view:'month',
    personalColor:'#e0b52f',
    showGroupFeatures:false,
  });
  assert.equal(calendarColorInk('#e0b52f'), '#342b00');
});
