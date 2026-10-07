// A launch's broadcast on the wall (lib/launch-stream.ts) without the network or a database: which launch, which
// video, and when it is full screen, small in the space news corner, or gone.
//
//   npm test
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}
delete process.env.SUPABASE_URL;
const { ytId, webcastOf, pickLaunch, streamPhase } = await import('../../lib/launch-stream.js');
const { MOMENTS0 } = await import('../../lib/remote-ops.js');

const S = { ...MOMENTS0.stream }, min = 60e3, NET = Date.parse('2026-10-08T07:54:00Z');
const L = { id: 'da43dc2c-00af-4cc1-8ef1-90a60b2eb9e5', name: 'Falcon 9 · SDA Tranche 1', mission: 'SDA Tranche 1', vehicle: 'Falcon 9', net: new Date(NET).toISOString(), status: 'Go' };
const C = { videoId: 'dQw4w9WgXcQ', net: L.net, status: 'Go', webcastLive: true, end: null, checked: NET - 20 * min };
const none = new Set<string>();

check('youtube watch link', ytId('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
check('youtube live link', ytId('https://youtube.com/live/dQw4w9WgXcQ?si=x') === 'dQw4w9WgXcQ');
check('a channel page is not a video', ytId('https://www.youtube.com/@SpaceX/live') === null);
check('X is not YouTube', ytId('https://x.com/SpaceX/status/1') === null);

const w = webcastOf({ net: L.net, status: { abbrev: 'Go' }, webcast_live: false, vid_urls: [
  { priority: 1, url: 'https://x.com/SpaceX/broadcasts/1' },
  { priority: 10, url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb', language: { code: 'es' } },
  { priority: 10, url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', language: { code: 'en' } },
  { priority: 20, url: 'https://www.youtube.com/watch?v=ccccccccccc' }] });
check('first YouTube broadcast by priority, English first', w.videoId === 'aaaaaaaaaaa', w.videoId);
check('status and live flag kept', w.status === 'Go' && w.webcastLive === false);
check('no YouTube broadcast: no video', webcastOf({ vid_urls: [{ url: 'https://x.com/a' }] }).videoId === null);

check('picked an hour ahead', pickLaunch([L], S, NET - 50 * min)?.id === L.id);
check('not 2 hours ahead', pickLaunch([L], S, NET - 120 * min) === null);
check('not a TBC launch', pickLaunch([{ ...L, status: 'TBC' }], S, NET - 10 * min) === null);
check('big only skips a Falcon 9 payload', pickLaunch([L], { ...S, which: 'big' }, NET - 10 * min) === null);
check('big only keeps Starship', pickLaunch([{ ...L, name: 'Starship · Flight 12' }], { ...S, which: 'big' }, NET - 10 * min) !== null);
check('in flight still picked', pickLaunch([{ ...L, status: 'In Flight' }], S, NET + 60 * min)?.id === L.id);

const at = (m: number, c: any = C, s: any = S, dis = none) => streamPhase(L, c, s, dis, NET + m * min);
check('nothing 10 min before (before = 5)', at(-10) === null);
check('full 4 min before', at(-4)?.mode === 'full');
check('full 14 min after', at(14)?.mode === 'full');
check('small 20 min after', at(20)?.mode === 'small');
check('small ends when the broadcast is no longer live', at(60, { ...C, webcastLive: false, checked: NET + 50 * min }) === null);
check('…but not from a check made before liftoff', at(60, { ...C, webcastLive: false, checked: NET - 5 * min })?.mode === 'small');
check('small ends at the video end time', at(60, { ...C, end: new Date(NET + 45 * min).toISOString() }) === null);
check('no small part when switched off', at(20, C, { ...S, small: false }) === null);
check('gone 5 hours after', at(300) === null);
check('no video: nothing', at(0, { ...C, videoId: null }) === null);
check('scrubbed (Hold): nothing', at(-2, { ...C, status: 'Hold' }) === null);
check('slipped an hour: not yet', at(-2, { ...C, net: new Date(NET + 60 * min).toISOString() }) === null);
const key = at(0)!.key;
check('"to the side" from the remote', at(2, C, S, new Set(['streamfull:' + key]))?.mode === 'small');
check('"end" from the remote', at(2, C, S, new Set(['stream:' + key])) === null);
check('a new day after a scrub is a new broadcast', at(0, { ...C, net: new Date(NET + 864e5).toISOString() }, S, new Set(['stream:' + key])) === null
  && streamPhase(L, { ...C, net: new Date(NET + 864e5).toISOString() }, S, new Set(['stream:' + key]), NET + 864e5)?.mode === 'full');

if (failures) { console.log(failures + ' failed'); process.exit(1); }
console.log('all launch stream tests passed');
