// The wall's people and events panels (lib/feed.ts) and an event's days and hours (lib/remote-ops.ts), which the remote
// lists for editing: what is shown, what waits for room, what repeats, and when each one leaves. No database.
//
//   npm test
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

delete process.env.SUPABASE_URL;
const { addDays, ilToIso, nextYearly } = await import('../../lib/dates.js');
const { PEOPLE_TILES, EVENT_ROWS, eventTiles, feedSettings, greetsToday, lifeWindow, peopleTiles } = await import('../../lib/feed.js');
const { eventSpan, spanText } = await import('../../lib/remote-ops.js');

const today = '2026-10-07', cfg = feedSettings(null);

// ---- birthdays on 29 February
check('29.2 is celebrated on 28.2 in a common year', nextYearly('02-29', '2027-02-20', 10) === '2027-02-28');
check('29.2 stays in a leap year', nextYearly('02-29', '2028-02-20', 10) === '2028-02-29');
check('a birthday outside the horizon is none', nextYearly('05-01', today, 10) === null);

// ---- a personal event's window
const w0 = lifeWindow({ event_date: '2026-10-20' });
check('default window: 10 days before to 3 after', w0.from === '2026-10-10' && w0.until === '2026-10-23', JSON.stringify(w0));
const w1 = lifeWindow({ event_date: '2027-03-15', show_from: '2026-10-01', show_until: '2027-03-25' });
check('a start far ahead of the day is held to 60 days before it', w1.from === '2027-01-14', w1.from);
check('greeted on the day and two days after', greetsToday({ celebrate: true, on: '2026-10-05' }, today) && !greetsToday({ celebrate: true, on: '2026-10-04' }, today)
  && !greetsToday({ celebrate: true, on: '2026-10-08' }, today) && !greetsToday({ celebrate: false, on: today }, today));

// ---- the people panel
const person = (id: string, name: string, extra: any = {}) => ({ id, display_name: name, rank: '', unit: '', photo_url: null, active: true, on_wall: true, ...extra });
const life = (id: string, p: any, date: string, extra: any = {}) => ({ id, person_id: p ? p.id : null, people: p, name: p ? null : extra.name, type: 'wedding', label: 'חתונה',
  event_date: date, show_from: addDays(date, -5), show_until: addDays(date, 10), ...extra });
const dana = person('p1', 'דנה כהן'), avi = person('p2', 'אבי לוי'), gone = person('p3', 'רון', { active: false }), off = person('p4', 'מיכל', { on_wall: false });
const rows = [
  life('l1', dana, today),
  life('l2', dana, today),                                   // entered twice
  life('l3', avi, addDays(today, 3)),
  life('l4', gone, today), life('l5', off, today),           // left, or asked to stay off the wall
  life('l6', null, addDays(today, -2), { name: 'אורחת' }),    // someone outside the list
  life('l7', avi, addDays(today, 30)),                       // not yet in its window
  life('l8', person('p5', 'יוסי'), addDays(today, 1), { type: 'birthday', label: 'יום הולדת' }),
];
const roster = [{ id: 'p5', display_name: 'יוסי', rank: '', unit: '', photo_url: null, birthday: '1990-' + addDays(today, 1).slice(5) },
  { id: 'p6', display_name: 'שרה', rank: 'סרן', unit: '', photo_url: null, birthday: '1985-' + today.slice(5) }];
const P = peopleTiles(rows, roster, today, cfg);
const refs = P.shown.map(c => (c.ref.kind === 'life' ? c.ref.id : 'b:' + c.ref.personId));
check('the same moment twice shows once', P.doubles.length === 1 && P.doubles[0] === 'l2' && !refs.includes('l2'), JSON.stringify(P.doubles));
check('people who left or asked to stay off are not shown', !refs.includes('l4') && !refs.includes('l5'));
check('a name outside the list is shown', refs.includes('l6'));
check('a moment before its window is not shown', !refs.includes('l7'));
check("a birthday typed as a moment stands for the list's birthday", refs.includes('l8') && !refs.includes('b:p5'), refs.join(','));
check("a birthday from the list is shown with its person", refs.includes('b:p6') && P.shown.find(c => c.ref.kind === 'bday')!.name === 'סרן שרה');
check("today's come first", refs[0] === 'l1' || refs[0] === 'b:p6', refs.join(','));
check('a tile stays until its window ends', P.shown.find(c => c.ref.kind === 'life' && c.ref.id === 'l3')!.until === addDays(today, 13));
check("a birthday's tile stays three days after it", P.shown.find(c => c.ref.kind === 'bday')!.until === addDays(today, 3));
const many = Array.from({ length: PEOPLE_TILES + 2 }, (_, i) => life('m' + i, person('q' + i, 'אדם ' + i), addDays(today, i), { show_from: addDays(today, -1) }));
const M = peopleTiles(many, [], today, cfg);
check(`the panel shows ${PEOPLE_TILES}, the rest wait for room`, M.shown.length === PEOPLE_TILES && M.waiting.length === 2 && M.waiting.every(c => c.sort > M.shown[PEOPLE_TILES - 1].sort));

// ---- the events panel
const ev = (id: string, date: string, start: string, endDate: string, end: string) => ({ id, title: id, starts_at: ilToIso(date, start), ends_at: ilToIso(endDate, end) });
const now = Date.parse(ilToIso(today, '12:00'));
const evs = [
  ev('over', today, '08:00', today, '09:00'),
  ev('now', today, '11:00', today, '13:00'),
  ev('days', addDays(today, -1), '00:00', addDays(today, 2), '00:00'),   // all day, yesterday to tomorrow
  ev('e1', addDays(today, 1), '10:00', addDays(today, 1), '11:00'),
  ev('e2', addDays(today, 2), '10:00', addDays(today, 2), '11:00'),
  ev('e3', addDays(today, 3), '10:00', addDays(today, 3), '11:00'),
  ev('far', addDays(today, 9), '10:00', addDays(today, 9), '11:00'),
];
const E = eventTiles(evs, now, today, cfg);
check('an event that ended is gone', !E.shown.concat(E.waiting).some(e => e.id === 'over'));
check('an event of several days shows while it runs', E.shown.some(e => e.id === 'days'));
check(`the panel shows ${EVENT_ROWS}, the rest wait`, E.shown.length === EVENT_ROWS && E.waiting.map(e => e.id).join() === 'e3', E.waiting.map(e => e.id).join());
check('beyond the week is not on the panel', !E.shown.concat(E.waiting).some(e => e.id === 'far'));

// ---- an event's days and hours
const one = eventSpan(ev('x', '2026-10-21', '10:00', '2026-10-21', '11:30'));
check('one day with hours', !one.allDay && one.date === '2026-10-21' && one.lastDay === '2026-10-21' && spanText(one) === '10:00–11:30', JSON.stringify(one));
const allDay = eventSpan(ev('x', '2026-10-21', '00:00', '2026-10-22', '00:00'));
check('all day', allDay.allDay && allDay.lastDay === '2026-10-21' && spanText(allDay) === '', JSON.stringify(allDay));
const days = eventSpan(ev('x', '2026-10-21', '00:00', '2026-10-24', '00:00'));
check('three days, all day', days.allDay && days.lastDay === '2026-10-23' && spanText(days) === '21.10–23.10', JSON.stringify(days));
const night = eventSpan(ev('x', '2026-10-21', '22:00', '2026-10-22', '01:00'));
check('into the night', !night.allDay && night.lastDay === '2026-10-22' && spanText(night) === '21.10 22:00 – 22.10 01:00', spanText(night));
const winter = eventSpan(ev('x', '2026-10-24', '00:00', '2026-10-26', '00:00'));   // the clocks go back on the night of 24-25.10
check('all day across the change of the clocks', winter.allDay && winter.lastDay === '2026-10-25', JSON.stringify(winter));
const open = eventSpan({ starts_at: ilToIso('2026-10-21', '10:00'), ends_at: null });
check('no end time: an hour', open.end === '11:00' && !open.allDay, JSON.stringify(open));

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
