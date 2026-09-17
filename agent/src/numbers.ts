// "Numbers of the week": grounded counts from the database plus Launch Library, handed to
// Claude Code to pick and phrase four headline figures.
import { db, must } from '../../lib/db';
import { DIRECTORATE_PROFILE } from '../../lib/profile';
import { WeeklyNumbers } from '../../lib/schemas';
import { isoDateIL } from '../../lib/dates';
import { runClaudeTask } from './cc';
import { withRun, fetchJson, type RunCtx } from './run';

const INSTRUCTIONS = `${DIRECTORATE_PROFILE}

משימה: בחר ארבעה "מספרי השבוע" לצג. ב-task.json יש ספירות מחושבות וכן ידיעות השבוע.
לכל מספר: value (מספר קצר, למשל "5" או "$2.3B" או "380 מ׳") ו-label (תווית בעברית, עד חמש מילים).

כללים:
- עובדות בלבד, מתוך הנתונים שב-task.json. אסור להמציא מספר שלא מופיע שם.
- אם orbital_launches_this_week אינו null, המספר הראשון הוא הוא, עם התווית "שיגורים מסלוליים השבוע".
- אם אין מספיק נתונים מספריים, השתמש בספירות מתוך items_by_category (למשל "ידיעות ביטחוניות השבוע").

מבנה result.json:
{"numbers":[{"value":"5","label":"שיגורים מסלוליים השבוע"},{"value":"$2.3B","label":"עסקאות וחוזים"},{"value":"3","label":"מטענים צבאיים לא מוצהרים"},{"value":"2","label":"התפרקויות במסלול"}]}

חובה בדיוק ארבעה פריטים.`;

export async function runNumbers() {
  return withRun('numbers', async (ctx: RunCtx) => {
    const s = db();
    const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString();
    const items = must(await s.from('news_items')
      .select('title_en,summary_he,category,relevance')
      .eq('status', 'published').neq('priority', 'skip')
      .gte('published_at', weekAgo)
      .order('relevance', { ascending: false }).limit(60), 'items') as any[];

    let orbital: number | null = null;
    try {
      const prev = await fetchJson(`https://ll.thespacedevs.com/2.3.0/launches/previous/?limit=40&net__gte=${weekAgo.slice(0, 10)}`);
      orbital = (prev.results || []).filter((l: any) => ['Success', 'Failure', 'Partial Failure'].includes(l.status?.abbrev)).length;
    } catch (e) { ctx.log.ll2_error = String(e); }

    const byCategory = items.reduce((m: Record<string, number>, i) => (m[i.category] = (m[i.category] || 0) + 1, m), {});
    const result = await runClaudeTask({
      name: 'numbers',
      input: {
        week_start: weekAgo.slice(0, 10),
        orbital_launches_this_week: orbital,
        items_by_category: byCategory,
        items: items.map(i => ({ category: i.category, title_en: i.title_en, summary_he: i.summary_he })),
      },
      instructions: INSTRUCTIONS,
      schema: WeeklyNumbers,
    });

    const week_start = isoDateIL();
    must(await s.from('weekly_numbers').upsert(
      result.numbers.map((n, i) => ({ week_start, position: i + 1, value: n.value, label: n.label, run_id: ctx.id })),
      { onConflict: 'week_start,position' },
    ), 'weekly_numbers');
    ctx.found = items.length;
    ctx.published = 4;
    return 4;
  });
}
