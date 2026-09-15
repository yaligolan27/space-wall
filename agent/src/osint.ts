// OSINT pipeline: RSS (+ optional Claude web search) → dedupe → Claude enrichment (structured) → news_items.
import Parser from 'rss-parser';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { db, must } from '../../lib/db';
import { claude, MODEL, DIRECTORATE_PROFILE, addUsage } from '../../lib/claude';
import { CATEGORIES } from '../../lib/categories';
import { withRun, type RunCtx } from './run';

type Candidate = { url: string; title: string; source_name: string; source_id: number | null; published_at: string | null; snippet: string; image_url: string | null };

const parser = new Parser({ timeout: 20000, headers: { 'user-agent': 'space-wall-agent/1.0' }, customFields: { item: [['media:content', 'media', { keepArray: true }], ['media:thumbnail', 'thumb']] } });

function cleanUrl(u: string): string {
  try { const x = new URL(u); [...x.searchParams.keys()].filter(k => /^(utm_|fbclid|gclid|ref$|mc_)/i.test(k)).forEach(k => x.searchParams.delete(k)); x.hash = ''; return x.toString(); } catch { return u; }
}
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function collectRss(ctx: RunCtx, sinceMs: number): Promise<Candidate[]> {
  const sources = must(await db().from('sources').select('*').eq('enabled', true).not('rss_url', 'is', null), 'sources') as any[];
  const out: Candidate[] = []; const errors: Record<string, string> = {};
  await Promise.all(sources.map(async src => {
    try {
      const feed = await parser.parseURL(src.rss_url);
      for (const it of feed.items || []) {
        if (!it.link || !it.title) continue;
        const pub = it.isoDate || (it.pubDate ? new Date(it.pubDate).toISOString() : null);
        if (pub && Date.parse(pub) < sinceMs) continue;
        const media = (it as any).media?.[0]?.$?.url || (it as any).thumb?.$?.url || it.enclosure?.url || null;
        out.push({ url: cleanUrl(it.link), title: it.title.trim(), source_name: src.name, source_id: src.id, published_at: pub, snippet: strip(it.contentSnippet || it.content || it.summary || '').slice(0, 700), image_url: media });
      }
    } catch (e: any) { errors[src.name] = e?.message || String(e); }
  }));
  ctx.log.rss_errors = errors;
  return out;
}

const Discovered = z.object({ items: z.array(z.object({ url: z.string(), title: z.string(), source_name: z.string(), published_at: z.string().nullable(), snippet: z.string() })) });
/** Optional: ask Claude (web search, restricted to the source domains) for notable items the RSS feeds missed. */
async function discoverWeb(ctx: RunCtx, known: Set<string>, domains: string[]): Promise<Candidate[]> {
  const c = claude();
  const first = await c.messages.create({
    model: MODEL, max_tokens: 8000,
    system: DIRECTORATE_PROFILE,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, allowed_domains: domains.slice(0, 20) } as any],
    messages: [{ role: 'user', content: `מצא עד 8 ידיעות חשובות מה-24 שעות האחרונות בתחומי העניין (חלל ביטחוני, גאופוליטיקה של החלל, ישראל, SSA). החזר עבור כל אחת: URL מלא, כותרת מקורית, שם המקור, זמן פרסום אם ידוע, ומשפט תקציר.` }],
  });
  addUsage(ctx.usage, first);
  const text = first.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n');
  const parsed = await c.messages.parse({
    model: MODEL, max_tokens: 4000,
    messages: [{ role: 'user', content: `הפוך את הרשימה הבאה ל-JSON. השמט פריטים בלי URL.\n\n${text}` }],
    output_config: { format: zodOutputFormat(Discovered), effort: 'low' },
  });
  addUsage(ctx.usage, parsed);
  return (parsed.parsed_output?.items || []).filter(i => /^https?:\/\//.test(i.url) && !known.has(cleanUrl(i.url)))
    .map(i => ({ url: cleanUrl(i.url), title: i.title, source_name: i.source_name, source_id: null, published_at: i.published_at, snippet: i.snippet, image_url: null }));
}

const Enriched = z.object({
  items: z.array(z.object({
    index: z.number().int(),
    category: z.enum(CATEGORIES),
    relevance: z.number().int().min(0).max(100),
    priority: z.enum(['push', 'weekly', 'archive', 'skip']),
    title_en: z.string().describe('כותרת באנגלית, נקייה, עד 110 תווים'),
    title_he: z.string().describe('כותרת בעברית, עד 90 תווים'),
    summary_he: z.string().describe('משפט אחד או שניים'),
    why_he: z.string().describe('"למה חשוב למנהלת": משפט אחד, ענייני'),
  })),
});

async function enrich(ctx: RunCtx, batch: Candidate[]) {
  const listing = batch.map((c, i) => `#${i} | ${c.source_name} | ${c.published_at || '?'} | ${c.title}\n${c.snippet}`).join('\n\n');
  const res = await claude().messages.parse({
    model: MODEL, max_tokens: 12000,
    system: `${DIRECTORATE_PROFILE}

משימה: לכל ידיעה ברשימה קבע קטגוריה, ציון רלוונטיות (0–100) למנהלת, עדיפות, וכתוב כותרת בעברית, כותרת נקייה באנגלית, תקציר ושורת "למה חשוב למנהלת".
עדיפות: "push" = מבזק לרצועת 24 השעות (רלוונטיות 60+ וחדשותי); "weekly" = מועמד לכרטיס מורחב של השבוע (רלוונטיות 75+, משמעותי, יש מה להסביר); "archive" = רלוונטי אך לא לצג; "skip" = לא רלוונטי (חקר חלל כללי, צרכנות, תוכן שיווקי).
כלול כל פריט בפלט, עם ה-index המקורי.`,
    messages: [{ role: 'user', content: listing }],
    output_config: { format: zodOutputFormat(Enriched), effort: 'medium' },
  });
  addUsage(ctx.usage, res);
  if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error('enrich failed: ' + res.stop_reason);
  return res.parsed_output.items;
}

async function ogImage(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; space-wall-agent/1.0)' } }); clearTimeout(t);
    const html = (await res.text()).slice(0, 200000);
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1] : null;
  } catch { return null; }
}

export async function runOsint() {
  return withRun('osint', async ctx => {
    const s = db();
    const maxItems = Number(process.env.OSINT_MAX_ITEMS || 40);
    const since = Date.now() - 48 * 3600e3;
    let candidates = await collectRss(ctx, since);
    // dedupe within the run and against the database
    const byUrl = new Map<string, Candidate>(); for (const c of candidates) if (!byUrl.has(c.url)) byUrl.set(c.url, c);
    candidates = [...byUrl.values()];
    const urls = candidates.map(c => c.url);
    const known = new Set<string>();
    for (let i = 0; i < urls.length; i += 200) {
      const rows = must(await s.from('news_items').select('url').in('url', urls.slice(i, i + 200)), 'known') as { url: string }[];
      rows.forEach(r => known.add(r.url));
    }
    if (process.env.OSINT_WEB_SEARCH === '1') {
      const domains = (must(await s.from('sources').select('domain').eq('enabled', true), 'domains') as { domain: string }[]).map(d => d.domain);
      const extra = await discoverWeb(ctx, new Set([...known, ...urls]), domains);
      ctx.log.web_discovered = extra.length; candidates.push(...extra);
    }
    let fresh = candidates.filter(c => !known.has(c.url));
    fresh.sort((a, b) => (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0));
    ctx.found = fresh.length; ctx.log.rss_total = candidates.length;
    fresh = fresh.slice(0, maxItems);
    if (!fresh.length) return;

    const rows: any[] = [];
    for (let i = 0; i < fresh.length; i += 12) {
      const batch = fresh.slice(i, i + 12);
      const out = await enrich(ctx, batch);
      for (const e of out) {
        const c = batch[e.index]; if (!c) continue;
        rows.push({ url: c.url, source_name: c.source_name, source_id: c.source_id, published_at: c.published_at, title_original: c.title, title_en: e.title_en, title_he: e.title_he, summary_he: e.summary_he, why_he: e.why_he, category: e.category, relevance: e.relevance, priority: e.priority, image_url: c.image_url, status: 'published', run_id: ctx.id });
      }
    }
    // article images for feature candidates
    for (const r of rows) if (r.priority === 'weekly' && !r.image_url) { r.image_url = await ogImage(r.url); if (r.image_url) r.image_credit = r.source_name; }
    if (rows.length) must(await s.from('news_items').upsert(rows, { onConflict: 'url', ignoreDuplicates: true }), 'insert news');
    ctx.published = rows.filter(r => r.priority === 'push' || r.priority === 'weekly').length;
    ctx.log.by_priority = rows.reduce((m: Record<string, number>, r) => (m[r.priority] = (m[r.priority] || 0) + 1, m), {});
  });
}
