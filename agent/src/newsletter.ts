// Weekly newsletter import, no model: reads the newest issue from the Rakia newsletter site and
// stores it in newsletter_issues, which the feed shows from the next refresh. Runs from the daily
// cron; on days with no new issue it costs one small request (the archive page).
import { db, must } from '../../lib/db.js';
import { isoDateIL } from '../../lib/dates.js';
import { NEWSLETTER_SITE, latestFromArchive, parseIssue } from '../../lib/newsletter.js';
import { NewsletterContent, importNewsletter } from '../../lib/wall-ops.js';
import { withRun, type RunCtx, type RunOpts } from './run.js';

// Two pages at most (archive, then the new issue): 15 s each keeps this step near 30 s at worst, well inside the
// daily cron's 60 s even if the site hangs.
async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'space-wall-agent/1.0', accept: 'text/html' } });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    throw ctrl.signal.aborted ? new Error(`${url} → no answer in ${timeoutMs / 1000} s`) : e;
  } finally { clearTimeout(t); }
}

/** Imports the newest issue unless it is already stored. `force` re-imports it anyway. */
export async function runNewsletter(force = false, opts?: RunOpts) {
  return withRun('newsletter', async (ctx: RunCtx) => {
    const latest = latestFromArchive(await fetchText(`${NEWSLETTER_SITE}/archive/`));
    if (!latest) throw new Error('הניוזלטר: דף הארכיון לא מציג אף גיליון');
    ctx.log.latest = latest;

    const have = must(await db().from('newsletter_issues').select('issue_date').eq('issue_date', latest).limit(1), 'newsletter_issues') as any[];
    if (have.length && !force) { ctx.log.skipped = 'already imported'; return { issue_date: latest, imported: false }; }

    const parsed = parseIssue(await fetchText(`${NEWSLETTER_SITE}/${latest}/`), isoDateIL());
    ctx.found = parsed.content.news.length;
    const content = NewsletterContent.parse(parsed.content);
    await importNewsletter(parsed.issue_date, parsed.source_url, content);
    ctx.published = content.news.length;
    ctx.log.ticker = content.ticker.length;
    return { issue_date: parsed.issue_date, imported: true, news: content.news.length, ticker: content.ticker.length };
  }, opts);
}
