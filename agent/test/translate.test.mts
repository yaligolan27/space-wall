// The wall in English (lib/translate.ts) without the network or a database: what goes to the model, what comes back
// where, fixed words that never reach the model, and Hebrew left in place when there is no key or no answer.
//
//   npm test
import sample from '../../app/data/feed.json' with { type: 'json' };

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

// No database here: the cache lives in memory only (its reads and writes fail quietly).
delete process.env.SUPABASE_URL;
console.warn = () => {};
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.AGENT_MODEL = 'test-model';
const { feedInEnglish, liveInEnglish, hasHebrew } = await import('../../lib/translate.js');

const sent: any[] = [];
let drop = '';                                     // a text the fake model "forgets"
globalThis.fetch = (async (url: string, init: any) => {
  const body = JSON.parse(init.body);
  sent.push(body);
  const items = JSON.parse(body.messages[0].content).filter((x: any) => x.text !== drop).map((x: any) => ({ id: x.id, en: 'EN<' + x.id + '>' + x.text.length }));
  return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items }) }] }), { status: 200 });
}) as any;

const feed: any = JSON.parse(JSON.stringify(sample));
feed.launches = (feed.launches || []).map((l: any, i: number) => ({ ...l, code: i ? 'Hold' : 'Go', siteEn: i ? '' : 'Cape Canaveral' }));
feed.directorate = [{ day: '06', dow: 'ג׳', mon: 'אוק׳', time: '10:00', name: 'הרמת כוסית', place: 'אולם', start: '', end: '' }];
feed.people = [{ type: 'יום הולדת', color: '#fff', name: 'סרן דנה כהן', line: 'חוגג/ת היום', date: '6.10', on: '2026-10-06', photo: null, celebrate: true }];
feed.ticker = [{ kind: 'הזדמנות', date: '5.10', name: 'קול קורא למענקי מחקר' }];

const en = await feedInEnglish(feed, 5000);
const asked = sent.flatMap(b => JSON.parse(b.messages[0].content).map((x: any) => x.text));
check('one request per chunk, to the configured model, with a JSON schema', sent.length >= 1 && sent.every(b => b.model === 'test-model' && b.output_config?.format?.type === 'json_schema'));
check('fixed words never reach the model', !asked.some((t: string) => ['יום הולדת', 'הזדמנות', 'ג׳', 'אוק׳', 'אירוע'].includes(t)), asked.filter((t: string) => t.length < 8).join(','));
check('only Hebrew text is sent', asked.every((t: string) => hasHebrew(t)));
check('each text is sent once', new Set(asked).size === asked.length);
check('nothing left in Hebrew', !JSON.stringify({ n: en.news, t: en.ticker, d: en.directorate, p: en.people, l: en.launches }).match(/[֐-׿]/), String(en.translated.missing));
check('fixed words in English', en.people[0].type === 'Birthday' && en.ticker[0].kind === 'Opportunity' && en.directorate[0].dow === 'Tue' && en.directorate[0].mon === 'Oct');
check('a name goes to the model', en.people[0].name.startsWith('EN<'));
check('a launch site in English from Launch Library, status from its code', !en.launches.length || (en.launches[0].site === 'Cape Canaveral' && en.launches[0].status === 'Go' && (en.launches.length < 2 || en.launches[1].status === 'On hold')));
check('category colours follow the translated categories', en.news.every((n: any) => !!en.catColor[n.cat]));
check('marked as English, nothing missing', en.lang === 'en' && en.translated.missing === 0 && !en.translated.error);

// cached: the same feed again asks nothing
const before = sent.length;
await feedInEnglish(feed, 5000);
check('a second time, all from the cache', sent.length === before);

// a text the model leaves out stays Hebrew and is counted
drop = 'כנס חדש לגמרי';
const live = await liveInEnglish({ urgent: 'כנס חדש לגמרי', takeover: { kind: 'event', title: 'טקס', place: 'אולם', until: '' } }, 5000);
check('the urgent banner the model skipped stays Hebrew', live.urgent === 'כנס חדש לגמרי');
check('a moment\'s title translated', live.takeover.title.startsWith('EN<'));

// no key: Hebrew stays, nothing is sent
delete process.env.ANTHROPIC_API_KEY;
const n = sent.length;
const noKey = await feedInEnglish({ ...feed, news: [{ cat: 'חדש', title: 'כותרת שלא נראתה', dek: '', src: 'x', date: '1.10' }] }, 5000);
check('no key: nothing sent, Hebrew kept, reported', sent.length === n && noKey.news[0].title === 'כותרת שלא נראתה' && noKey.translated.error === 'no-key' && noKey.translated.missing > 0);

if (failures) { console.error(`${failures} failed`); process.exit(1); }
console.log('all translation tests passed');
