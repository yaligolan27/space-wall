// The year's occasions (lib/occasions.ts): their days from the Hebrew calendar, the moves of the national days, which
// ones are added ahead and once, how the wall dresses them and when it greets them. No database.
//
//   npm test
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

delete process.env.SUPABASE_URL;
const { occasionsBetween, planOccasions, occasionRow, occasionLook, occasionGreets, OCCASIONS } = await import('../../lib/occasions.js');
const { memorialPeriod } = await import('../../lib/remote-ops.js');

const days = (from: string, to: string) => Object.fromEntries(occasionsBetween(from, to).map(o => [o.key + ':' + o.from.slice(0, 4), o.from + (o.to !== o.from ? '..' + o.to : '')]));
const y24 = days('2024-01-01', '2024-12-31'), y25 = days('2025-01-01', '2025-12-31'), y27 = days('2027-01-01', '2027-12-31');
const want: [string, Record<string, string>, string][] = [
  ['Rosh Hashanah 2024', y24, 'rosh-hashana:2024=2024-10-03..2024-10-04'],
  ['Yom Kippur 2024', y24, 'yom-kippur:2024=2024-10-12'],
  ['Sukkot 2025, seven days', y25, 'sukkot:2025=2025-10-07..2025-10-13'],
  ['Hanukkah 2024 across the new year', y24, 'hanukkah:2024=2024-12-26..2025-01-02'],
  ['Purim 2025 (common year: Adar)', y25, 'purim:2025=2025-03-14'],
  ['Purim 2027 (leap year: Adar II)', y27, 'purim:2027=2027-03-23'],
  ['Passover 2025', y25, 'pesach:2025=2025-04-13..2025-04-19'],
  // the moves: 27 Nisan on a Friday → Thursday; on a Sunday → Monday
  ['Holocaust day 2025 back from Friday', y25, 'shoah:2025=2025-04-24'],
  ['Holocaust day 2024 on from Sunday', y24, 'shoah:2024=2024-05-06'],
  // 5 Iyar on a Saturday → Thursday; on a Monday → Tuesday (so Memorial Day is not a Sunday)
  ['Independence Day 2025 back to Thursday', y25, 'atzmaut:2025=2025-05-01'],
  ['Memorial Day 2025 the day before', y25, 'zikaron:2025=2025-04-30'],
  ['Independence Day 2024 on to Tuesday', y24, 'atzmaut:2024=2024-05-14'],
  ['Memorial Day 2024 on to Monday', y24, 'zikaron:2024=2024-05-13'],
  ['Jerusalem Day 2024', y24, 'yom-yerushalayim:2024=2024-06-05'],
  ['Shavuot 2025', y25, 'shavuot:2025=2025-06-02'],
  ["Tisha B'Av 2025 on from Saturday", y25, 'tisha-beav:2025=2025-08-03'],
  ['7 October every year', y25, 'oct7:2025=2025-10-07'],
];
for (const [name, map, w] of want) { const [k, v] = w.split('='); check(name, map[k] === v, `${k}: ${map[k]}`); }
check('every occasion once a year', OCCASIONS.every(o => o.key + ':2025' in y25), Object.keys(y25).filter(k => k.endsWith(':2025')).length + ' start in 2025');

// ---- added 60 days ahead, once; one deleted (its id kept) does not come back
const p1 = planOccasions('2026-10-07', []);
check('today: 7/10 and Hanukkah (59 days ahead)', p1.fresh.map(o => o.id).join() === 'oct7-2026,hanukkah-2026', p1.fresh.map(o => o.id).join());
check('nothing again the next day', planOccasions('2026-10-08', p1.ids).fresh.length === 0);
check('one already running is not added', !planOccasions('2026-12-07', []).fresh.some(o => o.key === 'hanukkah'));
const r = occasionRow(p1.fresh[1]);
check('an all-day row, midnight to the midnight after its last day', r.starts_at === '2026-12-05T00:00:00+02:00' && r.ends_at === '2026-12-13T00:00:00+02:00' && r.created_by === 'occasion:hanukkah');

// ---- dressed by its key; English only while the office kept the Hebrew name
const look = occasionLook({ created_by: 'occasion:hanukkah', title: 'חנוכה' });
check('an occasion row is dressed', !!look && look.kind === 'holiday' && look.en === 'Hanukkah');
check('a renamed one is translated instead', occasionLook({ created_by: 'occasion:hanukkah', title: 'חנוכה במנהלת' })?.en === null);
check('any other event is not', occasionLook({ created_by: 'remote:x', title: 'חנוכה' }) === null);

// ---- greeted: a holiday from the day before, the others on their days only
check('holiday: the eve', occasionGreets('holiday', '2026-12-05', '2026-12-12', '2026-12-04'));
check('holiday: not two days before', !occasionGreets('holiday', '2026-12-05', '2026-12-12', '2026-12-03'));
check('holiday: its last day', occasionGreets('holiday', '2026-12-05', '2026-12-12', '2026-12-12'));
check('Independence Day: not on Memorial Day', !occasionGreets('national', '2027-05-12', '2027-05-12', '2027-05-11'));

// ---- the Yizkor days
check('Yizkor on Holocaust day 2027 with its words', memorialPeriod(new Date('2027-05-04T09:00:00Z'))?.key === 'shoah');
check('Yizkor on 8.10.2026 (set by hand)', memorialPeriod(new Date('2026-10-08T09:00:00Z'))?.id === 'oct7-2026');
check('no Yizkor on Independence Day', memorialPeriod(new Date('2027-05-12T09:00:00Z')) === null);

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
