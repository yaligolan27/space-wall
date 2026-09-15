// "Numbers of the week": grounded counts from the DB + Claude picks four headline figures from the week's items.
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { db, must } from '../../lib/db';
import { claude, MODEL, DIRECTORATE_PROFILE, addUsage } from '../../lib/claude';
import { isoDateIL } from '../../lib/dates';
import { withRun, fetchJson } from './run';

const Numbers = z.object({ numbers: z.array(z.object({ value: z.string().describe('מספר קצר, למשל "5", "$2.3B", "380 מ׳"'), label: z.string().describe('עד 5 מילים בעברית') })).length(4) });

export async function runNumbers() {
  return withRun('numbers', async ctx => {
    const s = db();
    const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString();
    const items = must(await s.from('news_items').select('title_en,summary_he,category,relevance').gte('published_at', weekAgo).neq('priority', 'skip').order('relevance', { ascending: false }).limit(60), 'items') as any[];
    let launchesCount: number | null = null;
    try {
      const prev = await fetchJson(`https://ll.thespacedevs.com/2.3.0/launches/previous/?limit=40&net__gte=${weekAgo.slice(0, 10)}`);
      launchesCount = (prev.results || []).filter((l: any) => l.status?.abbrev === 'Success' || l.status?.abbrev === 'Failure' || l.status?.abbrev === 'Partial Failure').length;
    } catch (e) { ctx.log.ll2_error = String(e); }
    const res = await claude().messages.parse({
      model: MODEL, max_tokens: 2000,
      system: `${DIRECTORATE_PROFILE}\n\nבחר ארבעה "מספרי השבוע" לצג: מספר + תווית קצרה. עובדות בלבד, מתוך הנתונים שניתנו. אם ניתן מספר שיגורים מסלוליים מהשבוע, הוא תמיד הראשון ("שיגורים מסלוליים השבוע"). אין להמציא מספרים; אם אין מספיק נתונים לארבעה, השתמש בספירות (למשל מספר ידיעות ביטחוניות השבוע).`,
      messages: [{ role: 'user', content: `שיגורים מסלוליים בשבוע האחרון (נתון מחושב): ${launchesCount ?? 'לא ידוע'}\nמספר ידיעות השבוע לפי קטגוריה: ${JSON.stringify(items.reduce((m: any, i) => (m[i.category] = (m[i.category] || 0) + 1, m), {}))}\n\nידיעות השבוע:\n${items.map(i => `- [${i.category}] ${i.title_en} — ${i.summary_he}`).join('\n')}` }],
      output_config: { format: zodOutputFormat(Numbers), effort: 'medium' },
    });
    addUsage(ctx.usage, res);
    const nums = res.parsed_output?.numbers; if (!nums) throw new Error('numbers failed: ' + res.stop_reason);
    const week_start = isoDateIL();
    must(await s.from('weekly_numbers').upsert(nums.map((n, i) => ({ week_start, position: i + 1, value: n.value, label: n.label, run_id: ctx.id })), { onConflict: 'week_start,position' }), 'weekly_numbers');
    ctx.found = items.length; ctx.published = 4;
  });
}
