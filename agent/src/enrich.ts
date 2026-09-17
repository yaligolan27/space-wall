// Enrichment: takes the rows collect() left as 'review' and asks Claude Code to classify,
// score and write the Hebrew copy. Runs on the local subscription; no API key.
import { db, must } from '../../lib/db';
import { DIRECTORATE_PROFILE } from '../../lib/profile';
import { EnrichResult } from '../../lib/schemas';
import { runClaudeTask } from './cc';
import { ogImage } from './collect';
import { withRun, type RunCtx } from './run';

const BATCH = Number(process.env.ENRICH_BATCH || 12);

const INSTRUCTIONS = `${DIRECTORATE_PROFILE}

משימה: ב-task.json יש מערך "items" של ידיעות גולמיות, כל אחת עם index, source, published_at, title ו-snippet.
לכל ידיעה קבע:
- category: אחד מ-defense, geopolitics, launches, industry, israel, policy, tech, ssa, exploration, weather
- relevance: 0 עד 100, כמה הידיעה רלוונטית לאנשי המנהלת
- priority: "push" = מבזק לרצועת 24 השעות (רלוונטיות 60 ומעלה, חדשותי); "weekly" = מועמד לכרטיס מורחב (רלוונטיות 75 ומעלה, משמעותי, יש מה להסביר); "archive" = רלוונטי אך לא לצג; "skip" = לא רלוונטי (חקר חלל כללי, צרכנות, תוכן שיווקי)
- title_en: הכותרת באנגלית, נקייה, עד 110 תווים
- title_he: כותרת בעברית, עד 90 תווים
- summary_he: משפט אחד או שניים
- why_he: "למה חשוב למנהלת", משפט אחד ענייני

מבנה result.json:
{"items":[{"index":0,"category":"defense","relevance":82,"priority":"push","title_en":"...","title_he":"...","summary_he":"...","why_he":"..."}]}

חובה: כלול כל פריט מ-task.json עם ה-index המקורי שלו, בלי להוסיף פריטים. אין להמציא עובדות שלא מופיעות בכותרת או ב-snippet.`;

export async function runEnrich() {
  return withRun('enrich', async (ctx: RunCtx) => {
    const s = db();
    const pending = must(await s.from('news_items').select('id,url,source_name,published_at,title_original,image_url')
      .eq('status', 'review').order('published_at', { ascending: false }).limit(BATCH), 'pending') as any[];
    ctx.found = pending.length;
    if (!pending.length) return 0;

    const result = await runClaudeTask({
      name: 'enrich',
      input: {
        items: pending.map((p, i) => ({
          index: i, source: p.source_name, published_at: p.published_at,
          title: p.title_original, snippet: (p.summary_he || '').slice(0, 700),
        })),
      },
      instructions: INSTRUCTIONS,
      schema: EnrichResult,
    });

    let applied = 0;
    for (const e of result.items) {
      const row = pending[e.index];
      if (!row) continue;
      const patch: Record<string, unknown> = {
        category: e.category, relevance: e.relevance, priority: e.priority,
        title_en: e.title_en, title_he: e.title_he, summary_he: e.summary_he, why_he: e.why_he,
        status: 'published', run_id: ctx.id,
      };
      if (e.priority === 'weekly' && !row.image_url) {
        const img = await ogImage(row.url);
        if (img) { patch.image_url = img; patch.image_credit = row.source_name; }
      }
      must(await s.from('news_items').update(patch).eq('id', row.id), 'enrich update');
      applied++;
    }
    // Anything the model skipped stays 'review' and is retried next cycle; give up after a day.
    ctx.published = applied;
    ctx.log.by_priority = result.items.reduce((m: Record<string, number>, r) => (m[r.priority] = (m[r.priority] || 0) + 1, m), {});
    return applied;
  });
}

/** Rows that have been waiting too long are almost certainly unparseable; hide them. */
export async function expireStaleReview() {
  const cutoff = new Date(Date.now() - 24 * 3600e3).toISOString();
  must(await db().from('news_items').update({ status: 'hidden' }).eq('status', 'review').lt('fetched_at', cutoff), 'expire');
}

/** How many rows are waiting for enrichment. */
export async function pendingCount(): Promise<number> {
  const r = await db().from('news_items').select('id', { count: 'exact', head: true }).eq('status', 'review');
  if (r.error) throw new Error(`pendingCount: ${r.error.message}`);
  return r.count ?? 0;
}
