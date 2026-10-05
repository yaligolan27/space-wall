// Parses saved pages of the Rakia newsletter site (agent/test/fixtures, images and styles
// stripped) and checks the result fits the feed's NewsletterContent contract. Needs no network
// and no database.
//
//   npm test
import { readFileSync } from 'node:fs';
import { parseIssue, latestFromArchive, compactRange, endDate } from '../../lib/newsletter.js';
import { NewsletterContent } from '../../lib/wall-ops.js';
import { storeNewsletterImages } from '../../lib/newsletter-images.js';

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
check('one inline picture per news item, kept out of the content', cur.images.length === cur.content.news.length && cur.images.every(p => p?.mime === 'image/jpeg' && p.base64.length > 0) && cur.content.news.every(n => n.image === null));
check('pictures stay aligned with their items', Buffer.from(cur.images[0]!.base64, 'base64').toString() === 'fake-jpeg-1' && Buffer.from(cur.images[19]!.base64, 'base64').toString() === 'fake-jpeg-20');
{
  // Storing: every picture is uploaded under the issue's folder and its public URL lands on the item; a failed upload leaves null.
  const issue = parseIssue(page('rakia-2026-10-08.html'), '2026-10-04');
  const paths: string[] = [];
  const store = {
    async upload(path: string, body: Buffer, o: { contentType: string }) { paths.push(path); return { error: path.startsWith('newsletter/2026-10-08/03-') ? { message: 'boom' } : (o.contentType === 'image/jpeg' && body.length ? null : { message: 'bad' }) }; },
    getPublicUrl(path: string) { return { data: { publicUrl: 'https://cdn.test/' + path } }; },
  };
  const res = await storeNewsletterImages(issue, store);
  check('uploads every picture', paths.length === 20 && paths.every(p => /^newsletter\/2026-10-08\/\d{2}-[0-9a-f]{10}\.jpg$/.test(p)), paths[0]);
  check('reports stored and failed', res.stored === 19 && res.failed === 1, JSON.stringify(res));
  check('items point at their files', issue.content.news[0].image === 'https://cdn.test/' + paths.find(p => p.includes('/00-')) && issue.content.news[3].image === null);
  check('content with pictures still fits NewsletterContent', NewsletterContent.safeParse(issue.content).success);
}
check('six featured, lead first', cur.content.featured.length === 6 && cur.content.featured[0] === 0);
check('ticker has events and opportunities', cur.content.ticker.some(t => t.kind === 'אירוע') && cur.content.ticker.some(t => t.kind === 'הזדמנות'));
check('ticker drops what has passed', cur.content.ticker.every(t => endDate(t.date, '2026-10-08')! >= '2026-10-04'));
check('ticker capped', cur.content.ticker.length <= 14);
check('ticker items carry their last day', cur.content.ticker.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t.end) && t.end === endDate(t.date, '2026-10-08') && t.end >= '2026-10-04'));
check('fits NewsletterContent', NewsletterContent.safeParse(cur.content).success);
check('NewsletterContent keeps the last day', NewsletterContent.parse(cur.content).ticker.every(t => t.end));
check('an issue stored before end existed still fits', NewsletterContent.safeParse({ ...cur.content, ticker: [{ kind: 'אירוע', date: '27–29.10', name: 'x' }] }).success);

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
