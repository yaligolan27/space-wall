// Collection: RSS in, rows out. No model, no cost. Items land unenriched (status 'review')
// and the enrichment step picks them up.
import Parser from 'rss-parser';
import { db, must } from '../../lib/db';
import { withRun, type RunCtx } from './run';

const parser = new Parser({
  timeout: 20000,
  headers: { 'user-agent': 'space-wall-agent/1.0' },
  customFields: { item: [['media:content', 'media', { keepArray: true }], ['media:thumbnail', 'thumb']] },
});

export function cleanUrl(u: string): string {
  try {
    const x = new URL(u);
    [...x.searchParams.keys()].filter(k => /^(utm_|fbclid|gclid|ref$|mc_)/i.test(k)).forEach(k => x.searchParams.delete(k));
    x.hash = '';
    return x.toString();
  } catch { return u; }
}
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export async function runCollect() {
  return withRun('collect', async (ctx: RunCtx) => {
    const s = db();
    const sinceMs = Date.now() - 48 * 3600e3;
    const sources = must(await s.from('sources').select('*').eq('enabled', true).not('rss_url', 'is', null), 'sources') as any[];

    const found = new Map<string, any>();
    const errors: Record<string, string> = {};
    await Promise.all(sources.map(async src => {
      try {
        const feed = await parser.parseURL(src.rss_url);
        for (const it of feed.items || []) {
          if (!it.link || !it.title) continue;
          const pub = it.isoDate || (it.pubDate ? new Date(it.pubDate).toISOString() : null);
          if (pub && Date.parse(pub) < sinceMs) continue;
          const url = cleanUrl(it.link);
          if (found.has(url)) continue;
          const media = (it as any).media?.[0]?.$?.url || (it as any).thumb?.$?.url || it.enclosure?.url || null;
          found.set(url, {
            url, source_name: src.name, source_id: src.id, published_at: pub,
            title_original: it.title.trim(),
            summary_he: null,
            image_url: media,
            // 'review' marks the row as awaiting enrichment; the feed only serves 'published'.
            status: 'review', priority: 'archive', run_id: ctx.id,
          });
        }
      } catch (e: any) { errors[src.name] = e?.message || String(e); }
    }));
    ctx.log.rss_errors = errors;
    ctx.found = found.size;
    if (!found.size) return 0;

    const rows = [...found.values()];
    const urls = rows.map(r => r.url);
    const known = new Set<string>();
    for (let i = 0; i < urls.length; i += 200) {
      const seen = must(await s.from('news_items').select('url').in('url', urls.slice(i, i + 200)), 'known') as { url: string }[];
      seen.forEach(r => known.add(r.url));
    }
    const fresh = rows.filter(r => !known.has(r.url));
    if (fresh.length) must(await s.from('news_items').upsert(fresh, { onConflict: 'url', ignoreDuplicates: true }), 'insert raw');
    ctx.published = fresh.length;
    ctx.log.new_items = fresh.length;
    return fresh.length;
  });
}

/** Best-effort article image for the feature cards. */
export async function ogImage(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; space-wall-agent/1.0)' } });
    clearTimeout(t);
    const html = (await res.text()).slice(0, 200000);
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1] : null;
  } catch { return null; }
}
