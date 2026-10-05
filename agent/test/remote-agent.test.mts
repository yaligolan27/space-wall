// The remote's agent without the network or a database: its tools as the Messages API reads them, what it's told
// about the wall (no contact details), how the conversation is shaped, and what the operator reads when the API refuses.
//
//   npm test
import { AgentInput, ApiError, TOOLS, apiErrorHe, brief, conversation } from '../../lib/remote-agent.js';
import { DesignPatch, cssProblem, youtubeId } from '../../lib/remote-ops.js';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

// ---- tools
const names = TOOLS.map(t => t.name);
check('tool names are unique and valid', new Set(names).size === names.length && names.every(n => /^[a-zA-Z0-9_-]{1,64}$/.test(n)), names.join(','));
for (const t of TOOLS) {
  const sc = t.input_schema as any, props = Object.keys(sc.properties || {});
  const typed = (p: any): boolean => !!(p && (p.type || p.enum || p.anyOf)) && (p.type !== 'object' || Object.values(p.properties || {}).every(typed))
    && (p.type !== 'array' || typed(p.items));
  check(`${t.name}: object schema, required fields exist, every field typed`,
    sc.type === 'object' && !('$schema' in sc) && (sc.required || []).every((r: string) => props.includes(r)) && Object.values(sc.properties || {}).every(typed));
  check(`${t.name}: described in Hebrew`, /[֐-׿]/.test(t.description));
}

// ---- what the model is told about the wall
const snap: any = {
  now: '2026-10-04T09:30:00.000Z', today: '2026-10-04', life: [], events: [], ticker: [], newsletter: null, takeover: null, history: [],
  state: { design: { noon: true }, brightness: 100, urgent: '', noonToday: true },
  people: [{ id: 'p1', name: 'דנה שמש', first: 'דנה', last: 'שמש', rank: '', role: 'מהנדסת', unit: '', kind: 'civilian', birthday: '1996-10-04', showBday: true,
    onWall: true, joined: null, leaves: null, email: 'dana@example.com', phone: '050-1234567', notes: 'הערה פנימית', photo: null, active: true, profile: { q: 'תשובה בסקר' } }],
};
const b = brief(snap, 'יעלי');
check('the brief has today, the operator and the people', b.includes('(2026-10-04)') && b.includes('יעלי') && b.includes('"name":"דנה שמש"'));
check('no contact details, notes or survey answers in the brief', !/dana@example\.com|050-1234567|הערה פנימית|תשובה בסקר/.test(b));
const withPhoto = brief({ ...snap, events: [{ id: 'e1', title: 'השקה', date: '2026-10-04', start: '10:00', end: '11:00', place: '', big: false,
  photo: 'https://x.supabase.co/storage/v1/object/public/wall-photos/events/a.jpg' }] }, 'יעלי');
check('an event\'s picture is told as has_photo, without its address', withPhoto.includes('"has_photo":true') && !withPhoto.includes('wall-photos/events/a.jpg'));

// ---- the conversation
const JPG = (n: number) => ({ name: `p${n}.jpg`, dataUrl: 'data:image/jpeg;base64,' + Buffer.from('img' + n).toString('base64') });
const f = AgentInput.parse({
  text: 'ועכשיו', images: [JPG(5)],
  history: [{ role: 'assistant', text: 'שלום' }, { role: 'user', text: 'א', images: [JPG(1), JPG(2)] }, { role: 'user', text: 'ב', images: [JPG(3), JPG(4)] }, { role: 'assistant', text: 'ג' }],
});
const ctx = { images: [] as { name: string; dataUrl: string }[] };
const m = conversation(f, ctx);
check('starts with the operator, alternates', m.map(x => x.role).join() === 'user,assistant,user', m.map(x => x.role).join());
check('two operator turns merged', m[0].content.filter(c => c.type === 'text' && (c.text === 'א' || c.text === 'ב')).length === 2);
check('only the newest four pictures go', m.flatMap(x => x.content).filter(c => c.type === 'image').length === 4 && JSON.stringify(m[0]).includes('תמונה ישנה: p1.jpg'));
check('pictures numbered in order', ctx.images.map(i => i.name).join() === 'p2.jpg,p3.jpg,p4.jpg,p5.jpg' && JSON.stringify(m[2]).includes('תמונה 4: p5.jpg'));
check('the request comes last', m[2].content.at(-1)?.text === 'ועכשיו');
const files = conversation(AgentInput.parse({ text: 'x', files: [{ name: 'a.csv', text: 'שם\nדנה', rows: 2 }] }), { images: [] });
check('a file goes as text before the request', files[0].content[0].text.startsWith('[קובץ מצורף: a.csv, 2 שורות]\nשם') && files[0].content[1].text === 'x');

// ---- the style layer and streams
check('a style tweak passes', cssProblem('[data-w="logo-img"]{transform:translate(-2px,1px)!important}') === null);
check('nothing loaded from outside', ['a{background:url(https://x.y/a.png)}', '@import "x.css";', 'a{b:c}</style><script>', 'a{content:"\\3c"}', 'a{b:expression(alert(1))}']
  .every(c => cssProblem(c) !== null));
check('unbalanced braces refused', cssProblem('a{color:red') !== null && cssProblem('a}{') !== null);
check('the design takes the layer, a headline and hidden panels', DesignPatch.safeParse({ css: 'a{color:red!important}', headline: 'ברוכים הבאים', hide: ['ticker'] }).success
  && !DesignPatch.safeParse({ hide: ['menu'] }).success && !DesignPatch.safeParse({ css: 'a{background:url(x)}' }).success);
check('YouTube links → the video id', ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ?si=x', 'dQw4w9WgXcQ']
  .every(u => youtubeId(u) === 'dQw4w9WgXcQ'));
check('other links are not streams', youtubeId('https://x.com/SpaceX/status/1') === null && youtubeId('https://evil.com/watch?v=dQw4w9WgXcQ') === null);
const bLaunch = brief(snap, 'יעלי', [{ id: 'l1', mission: 'Crew-13', vehicle: 'Falcon 9', net: '2026-10-05T10:00:00Z', status: 'Go' }]);
check('the brief lists the launches', bLaunch.includes('"mission":"Crew-13"') && bLaunch.includes('"id":"l1"'));

// ---- errors in plain Hebrew
const he = (status: number, kind: string, message = '') => apiErrorHe(new ApiError(message, status, kind));
check('bad key', /לא תקף/.test(he(401, 'authentication_error')));
check('no credit', /נגמר הקרדיט/.test(he(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.')));
check('spend limit', /מגבלת ההוצאה/.test(he(400, 'invalid_request_error', 'You have reached your specified API usage limits.')));
check('rate limit', /יותר מדי בקשות/.test(he(429, 'rate_limit_error')));
check('overloaded', /עמוס/.test(he(529, 'overloaded_error')) && /עמוס/.test(he(500, 'api_error')));
check('timeout', /לא הספיק/.test(he(0, 'timeout')));
check('offline', /אין כרגע חיבור/.test(he(0, 'network')));
check('model', /המודל/.test(he(404, 'not_found_error', 'model: x')));

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all agent tests passed');
