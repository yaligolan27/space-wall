// Adds the Israeli Space Forum's events from the newsletter to directorate_events, so they show in the wall's
// events panel and in the remote's events list like any event the office adds.
//
// Each event is added once. The keys of events already added live in settings ('newsletter_forum'), so an event the
// office edits keeps its edits and one it deletes does not come back with the next issue. The key is the event's
// dates and place, not its title: the newsletter rewords titles from week to week.
import { db, must } from './db.js';
import { addDays, ilToIso } from './dates.js';
import type { ForumEvent } from './newsletter.js';

const SETTING = 'newsletter_forum';
const KEEP_KEYS = 200;

export const forumKey = (e: ForumEvent) => [e.start, e.end, e.place.trim()].join('|');

/** The directorate_events row for a Forum event. Without an end time it lasts until the end of its last day. */
export function forumRow(e: ForumEvent) {
  return {
    title: e.title,
    type: 'other',
    starts_at: ilToIso(e.start, e.startTime || '00:00'),
    ends_at: e.endTime ? ilToIso(e.end, e.endTime) : ilToIso(addDays(e.end, 1), '00:00'),
    place: e.place || null,
    approved: true,
    created_by: 'newsletter',
  };
}

/** The events not added before, and the key list to store once they are. */
export function planForum(forum: ForumEvent[], seen: string[]) {
  const known = new Set(seen);
  const fresh = forum.filter(e => { const k = forumKey(e); return known.has(k) ? false : (known.add(k), true); });
  return { fresh, keys: [...seen, ...fresh.map(forumKey)].slice(-KEEP_KEYS) };
}

export async function syncForumEvents(forum: ForumEvent[]): Promise<{ added: number }> {
  if (!forum.length) return { added: 0 };
  const s = db();
  const cur = must(await s.from('settings').select('value').eq('key', SETTING).maybeSingle(), 'settings') as { value?: { keys?: string[] } } | null;
  const { fresh, keys } = planForum(forum, cur?.value?.keys || []);
  if (!fresh.length) return { added: 0 };
  must(await s.from('directorate_events').insert(fresh.map(forumRow)).select('id'), 'forum events');
  must(await s.from('settings').upsert({ key: SETTING, value: { keys }, updated_at: new Date().toISOString() }), 'settings');
  return { added: fresh.length };
}
