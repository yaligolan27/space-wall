// Builds the JSON the display consumes (see app/README.md → Feed contract) from the database.
import { db, must } from './db';
import { addDays, isoDateIL, nextYearly, relLabel, shortDate, timeIL } from './dates';

type Settings = { pushCount: number; weeklyCount: number; launchCount: number; eventsHorizonDays: number; lifeEventsHorizonDays: number };
const DEFAULTS: Settings = { pushCount: 7, weeklyCount: 2, launchCount: 4, eventsHorizonDays: 120, lifeEventsHorizonDays: 10 };

const LIFE_TEXT: Record<string, (p: { display_name: string; unit: string | null; rank: string | null }) => string> = {
  birthday: p => ['יום הולדת', p.display_name, p.unit].filter(Boolean).join(' · '),
  wedding: p => ['מזל טוב', p.display_name, 'נישואין'].join(' · '),
  birth: p => ['מזל טוב', p.display_name, 'לידה'].join(' · '),
  bereavement: p => ['משתתפים בצער', p.display_name].join(' · '),
  promotion: p => ['עלייה בדרגה', p.display_name, p.rank].filter(Boolean).join(' · '),
  discharge: p => ['טקס שחרור', p.display_name].join(' · '),
  joined: p => ['ברוכים הבאים', p.display_name, p.unit].filter(Boolean).join(' · '),
  other: p => p.display_name,
};

export async function buildFeed() {
  const s = db();
  const today = isoDateIL();
  const now = new Date();

  const settingsRows = must(await s.from('settings').select('key,value'), 'settings') as { key: string; value: any }[];
  const setting = (k: string) => settingsRows.find(r => r.key === k)?.value;
  const cfg: Settings = { ...DEFAULTS, ...(setting('feed') || {}) };

  // ---- 24h push loop
  const since36h = new Date(now.getTime() - 36 * 3600e3).toISOString();
  const pushRows = must(await s.from('news_items').select('*').eq('status', 'published').eq('priority', 'push')
    .gte('published_at', since36h).order('published_at', { ascending: false }).limit(cfg.pushCount), 'push') as any[];
  const push = pushRows.reverse().map(n => ({
    category: n.category, source: n.source_name, time: n.published_at ? timeIL(new Date(n.published_at)) : '',
    title: n.title_he || n.title_original, titleEn: n.title_en || n.title_original, url: n.url,
  }));

  // ---- weekly feature cards (fill from strongest push items if needed)
  const since8d = new Date(now.getTime() - 8 * 86400e3).toISOString();
  let weeklyRows = must(await s.from('news_items').select('*').eq('status', 'published').eq('priority', 'weekly')
    .gte('published_at', since8d).order('relevance', { ascending: false }).limit(cfg.weeklyCount), 'weekly') as any[];
  if (weeklyRows.length < cfg.weeklyCount) {
    const fill = must(await s.from('news_items').select('*').eq('status', 'published').eq('priority', 'push')
      .gte('published_at', since8d).order('relevance', { ascending: false }).limit(cfg.weeklyCount * 2), 'weekly-fill') as any[];
    for (const f of fill) if (weeklyRows.length < cfg.weeklyCount && !weeklyRows.some(w => w.id === f.id)) weeklyRows.push(f);
  }
  const weekly = weeklyRows.map(n => ({
    category: n.category,
    source: `${n.source_name}${n.published_at ? ' · ' + shortDate(n.published_at.slice(0, 10)) : ''}`,
    title: n.title_he || n.title_original, titleEn: n.title_en || n.title_original,
    why: n.why_he || '', url: n.url, image: n.image_url || null, imageNote: n.title_en || n.title_original,
    credit: n.image_credit || null, creditHref: n.image_credit ? n.url : null,
  }));

  // ---- numbers of the week
  const numRows = must(await s.from('weekly_numbers').select('*').order('week_start', { ascending: false }).order('position').limit(8), 'numbers') as any[];
  const latestWeek = numRows[0]?.week_start;
  const numbers = numRows.filter(r => r.week_start === latestWeek).slice(0, 4).map(r => ({ value: r.value, label: r.label }));

  // ---- directorate block: life events + directorate events + birthdays
  const horizon = addDays(today, cfg.lifeEventsHorizonDays);
  const items: { date: string; name: string; sort: string }[] = [];
  const life = must(await s.from('life_events').select('*, people(display_name,unit,rank,active)').eq('approved', true)
    .gte('event_date', addDays(today, -1)).lte('event_date', horizon), 'life_events') as any[];
  for (const e of life) {
    if (e.show_from && e.show_from > today) continue;
    if (e.show_until && e.show_until < today) continue;
    const p = e.people || { display_name: '', unit: null, rank: null };
    items.push({ date: relLabel(e.event_date, today), name: e.text_he || LIFE_TEXT[e.type]?.(p) || '', sort: e.event_date });
  }
  const people = must(await s.from('people').select('display_name,unit,rank,birthday,leaves_on').eq('active', true), 'people') as any[];
  for (const p of people) {
    if (p.birthday) {
      const next = nextYearly(p.birthday.slice(5), today, cfg.lifeEventsHorizonDays);
      if (next && !life.some(e => e.type === 'birthday' && e.people?.display_name === p.display_name && e.event_date === next))
        items.push({ date: relLabel(next, today), name: LIFE_TEXT.birthday(p), sort: next });
    }
  }
  const dEvents = must(await s.from('directorate_events').select('*').eq('approved', true)
    .gte('starts_at', today + 'T00:00:00+03:00').lte('starts_at', addDays(today, cfg.lifeEventsHorizonDays * 3) + 'T23:59:59+03:00')
    .order('starts_at'), 'directorate_events') as any[];
  for (const e of dEvents) {
    if (e.show_from && e.show_from > today) continue;
    if (e.show_until && e.show_until < today) continue;
    const d = new Date(e.starts_at), iso = isoDateIL(d), t = timeIL(d);
    const parts = [e.title, t !== '00:00' ? t : null, e.place].filter(Boolean);
    items.push({ date: relLabel(iso, today), name: parts.join(' · '), sort: iso });
  }
  items.sort((a, b) => a.sort.localeCompare(b.sort));
  const directorate = items.slice(0, 5).map(({ date, name }) => ({ date, name }));

  // ---- industry events ticker
  const evRows = must(await s.from('industry_events').select('*').eq('approved', true)
    .lte('starts_on', addDays(today, cfg.eventsHorizonDays)).order('starts_on'), 'industry_events') as any[];
  const events = evRows.filter(e => (e.ends_on || e.starts_on) >= today)
    .map(e => ({ date: shortDate(e.starts_on), name: e.name, place: e.place_he || '' }));

  // ---- launches
  const lRows = must(await s.from('launches').select('*').gte('net', new Date(now.getTime() - 3600e3).toISOString())
    .order('net').limit(cfg.launchCount), 'launches') as any[];
  const launches = lRows.map(l => ({ name: l.name, site: l.site_he || l.site_en || '', net: l.net, actor: l.actor }));

  // ---- freshness: last successful OSINT run
  const lastRun = must(await s.from('agent_runs').select('finished_at').eq('kind', 'osint').eq('status', 'ok')
    .order('finished_at', { ascending: false }).limit(1), 'runs') as any[];

  return {
    generatedAt: lastRun[0]?.finished_at || now.toISOString(),
    weekRange: `${shortDate(addDays(today, -7))} – ${shortDate(today)}`,
    orbital: setting('orbital') || null,
    spaceWeather: setting('space_weather') || null,
    push, weekly, numbers, directorate, events, launches,
  };
}
