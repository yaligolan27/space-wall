import { TZ } from './env.js';

const HEB_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** YYYY-MM-DD of a date in Israel time. */
export function isoDateIL(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => p.find(x => x.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function dayDiff(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 864e5);
}
/** "15.9" */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-'); return `${Number(d)}.${Number(m)}`;
}
/** "היום" / "מחר" / "ג׳ 15.9" */
export function relLabel(iso: string, todayIso: string): string {
  const diff = dayDiff(todayIso, iso);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  return `${HEB_DAYS[dow]} ${shortDate(iso)}`;
}
/** Israel wall-clock date + time → ISO with that moment's offset (+03:00 in summer, +02:00 in winter). */
export function ilToIso(date: string, time = '09:00'): string {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, timeZoneName: 'longOffset' });
  const offAt = (t: number) => (fmt.formatToParts(new Date(t)).find(p => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00');
  const mins = (o: string) => { const m = o.match(/^([+-])(\d\d):(\d\d)$/); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0; };
  const naive = Date.parse(`${date}T${time}:00Z`);
  // The offset at the wall-clock time read as UTC is a guess; checking it again at the real instant settles the
  // night the clocks change.
  const off = offAt(naive - mins(offAt(naive)) * 60e3);
  return `${date}T${time}:00${off}`;
}
/** HH:MM in Israel time */
export function timeIL(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
/** month/day of a yearly date in the next `horizon` days (birthdays). Returns the ISO date this year or next. */
export function nextYearly(mmdd: string, todayIso: string, horizon: number): string | null {
  const year = Number(todayIso.slice(0, 4));
  for (const y of [year, year + 1]) {
    const iso = `${y}-${mmdd}`;
    const diff = dayDiff(todayIso, iso);
    if (diff >= 0 && diff <= horizon) return iso;
  }
  return null;
}
