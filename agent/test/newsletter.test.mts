// Parses saved pages of the Rakia newsletter site (agent/test/fixtures, images and styles
// stripped) and checks the result fits the feed's NewsletterContent contract. Needs no network
// and no database.
//
//   npm test
import { readFileSync } from 'node:fs';
import { parseIssue, latestFromArchive, compactRange, endDate } from '../../lib/newsletter.js';
import { NewsletterContent } from '../../lib/wall-ops.js';

const FIX = new URL('fixtures/', import.meta.url).pathname;
const page = (name: string) => readFileSync(FIX + name, 'utf8');
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

check('archive → newest issue', latestFromArchive(page('rakia-archive.html')) === '2026-10-08');
check('range across months', compactRange('27 בספטמבר עד 3 באוקטובר 2026') === '27.9–3.10');
check('range in one month', compactRange('23–29 באוגוסט') === '23–29.8');
check('end date of a span', endDate('27–29.10', '2026-10-08') === '2026-10-29');
check('end date rolls into next year', endDate('הגשה עד 11.1', '2026-10-08') === '2027-01-11');
check('explicit year wins', endDate('11–14.1.2027', '2026-10-08') === '2027-01-14');

// The current issue, read on the Sunday before its Thursday date.
const cur = parseIssue(page('rakia-2026-10-08.html'), '2026-10-04');
check('issue date from canonical', cur.issue_date === '2026-10-08');
check('issue url', cur.content.issue.url === 'https://rakia-weekly.vercel.app/2026-10-08/');
check('issue range', cur.content.issue.range === '27.9–3.10', cur.content.issue.range);
check('lead + 19 cards', cur.content.news.length === 20, String(cur.content.news.length));
const lead = cur.content.news[0];
check('lead story fields', lead.cat === 'שיגורים' && lead.date === '28.09' && lead.title.startsWith('סטארשיפ הגיעה למסלול') && lead.url.startsWith('https://spacepolicyonline.com/') && lead.dek.length > 20);
check('every item has a category, title and url', cur.content.news.every(n => n.cat && n.title.length > 3 && /^https?:/.test(n.url)));
check('no inline images carried over', cur.content.news.every(n => n.image === null));
check('six featured, lead first', cur.content.featured.length === 6 && cur.content.featured[0] === 0);
check('ticker has events and opportunities', cur.content.ticker.some(t => t.kind === 'אירוע') && cur.content.ticker.some(t => t.kind === 'הזדמנות'));
check('ticker drops what has passed', cur.content.ticker.every(t => endDate(t.date, '2026-10-08')! >= '2026-10-04'));
check('ticker capped', cur.content.ticker.length <= 14);
check('fits NewsletterContent', NewsletterContent.safeParse(cur.content).success);

// Older layouts: an empty range div (falls back to og:title) and a news-only issue with Israeli items.
const sep = parseIssue(page('rakia-2026-09-03.html'), '2026-09-03');
check('range from og:title when the hero has none', sep.content.issue.range === '23–29.8', sep.content.issue.range);
check('older issue fits NewsletterContent', NewsletterContent.safeParse(sep.content).success);
const aug = parseIssue(page('rakia-2026-08-13.html'), '2026-08-13');
check('Israeli items flagged', aug.content.news.filter(n => n.il).length === 2);
check('Israeli items featured', aug.content.news.every((n, i) => !n.il || aug.content.featured.includes(i)));
check('news-only issue fits NewsletterContent', NewsletterContent.safeParse(aug.content).success);

let threw = false;
try { parseIssue('<html><head></head><body>maintenance</body></html>', '2026-10-04'); } catch { threw = true; }
check('a page that is not an issue throws', threw);

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all newsletter tests passed');
