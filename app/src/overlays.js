// Full-screen "moments" for the wall: launch mode, personal celebration, 12:00 promo show. window.makeWallOverlays(React) → components.
// Avatar: a real photo URL when the person has one, otherwise an initials badge. Never a stock face:
// these are real colleagues, and a random portrait next to a real name would be wrong.
window.wallAvatar = (sz, photo, name) => {
  if (typeof photo === 'string' && photo) return photo;
  const cache = window.__avatarCache || (window.__avatarCache = {});
  const key = sz + '|' + name; if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = c.height = sz; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, sz, sz); gr.addColorStop(0, '#1d3a6e'); gr.addColorStop(1, '#0c1a38'); g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
  // A rank before the name is not an initial ("רס״ן דנה כהן" → דכ). It is written with ״, " or ” (or none), so compare bare.
  // In English (the wall's English mode) the rank is an abbreviation, possibly two words ("Lt. Col.", "2nd Lt.").
  const RANKS = new Set(['טוראי', 'טור', 'רבט', 'סמל', 'סמר', 'רסל', 'רסר', 'רסמ', 'רסם', 'רסב', 'רנג', 'סגמ', 'סגם', 'סגן', 'סרן', 'רסן', 'סאל', 'אלמ', 'אלם', 'תאל', 'אלוף', 'ראל',
    'pvt', 'cpl', 'sgt', 'ssgt', 'sfc', 'msgt', 'sgtmaj', 'cwo', '2nd', 'lt', 'capt', 'maj', 'col', 'brig', 'gen']);
  const words = String(name || '').replace(/[^\u0590-\u05FFA-Za-z0-9״" ]/g, '').trim().split(/\s+/);
  while (words.length > 1 && RANKS.has(words[0].replace(/[״"׳]/g, '').toLowerCase())) words.shift();
  const ini = words.slice(0, 2).map((w) => w[0]).join('');
  g.fillStyle = '#e6f1ff'; g.font = '700 ' + Math.round(sz * 0.38) + 'px Heebo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillText(ini, sz / 2, sz / 2 + sz * 0.03);
  return (cache[key] = c.toDataURL());
};
// The home wall's emblem slot and the welcome screen's hero emblem, in stage px (1920×1080). Both wall.js and the welcome use
// it: the hero lands exactly where the wall's own emblem draws, as a downscale (the emblem's framing depends only on the
// box's aspect, so equal px-per-unit and globe centre mean an identical picture).
window.wallGeo = (() => {
  // The slot follows the wall's layout (wall.js render): stage rows 88 / 1fr / ticker 50 (0 when hidden) / launches 118
  // (16 when hidden); with data, the emblem's column lies between the side panels (470 + a 26 gap each, 36 padding), and
  // without data it spans the stage. The emblem is at most 860 wide, centred. pl/pr: a panel on the physical left/right.
  const slot = ({ data, pl, pr, ticker, launches }) => {
    const p = data ? { x: 36 + (pl ? 496 : 0), y: 102, w: 1848 - (pl ? 496 : 0) - (pr ? 496 : 0), h: 1080 - 88 - (ticker ? 50 : 0) - (launches ? 118 : 16) - 30 }
      : { x: 0, y: 88, w: 1920, h: 1080 - 88 - (launches ? 118 : 16) };
    const w = Math.min(p.w, 860);
    return { x: p.x + (p.w - w) / 2, y: p.y, w, h: p.h };
  };
  const ALL = { pl: true, pr: true, ticker: true, launches: true };
  const SLOT_DATA = slot(Object.assign({ data: true }, ALL)), SLOT_NODATA = slot(Object.assign({ data: false }, ALL));
  const ppu = (b) => b.h / (2 * Math.max(1.62, 1.62 * b.h / b.w));            // px per emblem unit (emblem-v2 fit())
  const gc = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 - 0.2 * ppu(b) });   // the globe's centre
  const HERO = { w: 1027.2, h: 952.8, ppu: 952.8 / 3.24, g: { x: 1376, y: 500 } };   // the slot ×1.2; its globe centre on the stage
  HERO.gIn = { x: HERO.w / 2, y: HERO.h / 2 - 0.2 * HERO.ppu };                   // …and inside its box
  const landing = (slot) => { const c = gc(slot); return { s: ppu(slot) / HERO.ppu, tx: c.x - HERO.g.x, ty: c.y - HERO.g.y, gc: c }; };
  return { slot, SLOT_DATA, SLOT_NODATA, ppu, gc, HERO, landing };
})();
window.makeWallOverlays = (React) => {
  const h = React.createElement, { useState, useEffect, useRef } = React;
  const LEX = "'Lexend',sans-serif", MONO = "'IBM Plex Mono',monospace";
  const p2 = (n) => String(n).padStart(2, '0');
  const clock = () => (window.wallNow ? window.wallNow() : Date.now());   // the wall's server-corrected clock
  const useNow = (ms = 100) => { const [n, set] = useState(clock()); useEffect(() => { const id = setInterval(() => set(clock()), ms); return () => clearInterval(id); }, [ms]); return n; };
  const fmtHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
  // English (window.wallLang 'en', the remote's switch): the moments' own words, left to right.
  const EN = () => window.wallLang === 'en';
  const tr = (he, en) => (EN() ? en : he);
  const shell = (children, extra) => h('div', { style: Object.assign({ position: 'absolute', inset: 0, zIndex: 50, overflow: 'hidden', animation: 'ovIn .9s ease both', direction: EN() ? 'ltr' : 'rtl', fontFamily: 'Heebo, sans-serif', color: '#e6f1ff' }, extra) }, children);

  // ---------- particles: fireworks + confetti ----------
  const Party = () => {
    const ref = useRef(null);
    useEffect(() => {
      const c = ref.current, g = c.getContext('2d'), W = c.width = 1920, H = c.height = 1080;
      const COLORS = ['#d4f25c', '#6fd6ea', '#e9b872', '#b9a6f5', '#ffffff', '#f2a37a'];
      const conf = Array.from({ length: 180 }, () => ({ x: Math.random() * W, y: -Math.random() * H, vx: (Math.random() - .5) * 1.5, vy: 1.5 + Math.random() * 2.5, r: Math.random() * 6.28, vr: (Math.random() - .5) * .2, w: 8 + Math.random() * 8, h: 4 + Math.random() * 6, c: COLORS[(Math.random() * COLORS.length) | 0] }));
      const rockets = [], sparks = []; let next = 0, raf, t0 = performance.now();
      const loop = (now) => {
        const t = (now - t0) / 1000;
        g.clearRect(0, 0, W, H);
        if (t > next && t < 10) { rockets.push({ x: 300 + Math.random() * (W - 600), y: H, vy: -(13 + Math.random() * 4), ty: 180 + Math.random() * 320, c: COLORS[(Math.random() * COLORS.length) | 0] }); next = t + .35 + Math.random() * .5; }
        g.globalCompositeOperation = 'lighter';
        for (let i = rockets.length - 1; i >= 0; i--) { const r = rockets[i]; r.y += r.vy; r.vy *= .985; g.fillStyle = r.c; g.beginPath(); g.arc(r.x, r.y, 3, 0, 6.28); g.fill();
          if (r.y <= r.ty || r.vy > -2) { for (let k = 0; k < 90; k++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 6; sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: r.c }); } rockets.splice(i, 1); } }
        for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vx *= .97; s.vy = s.vy * .97 + .06; s.life -= .012; if (s.life <= 0) { sparks.splice(i, 1); continue; } g.globalAlpha = s.life; g.fillStyle = s.c; g.beginPath(); g.arc(s.x, s.y, 2.2, 0, 6.28); g.fill(); }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        for (const p of conf) { p.x += p.vx + Math.sin(t * 2 + p.r) * .6; p.y += p.vy; p.r += p.vr; if (p.y > H + 20 && t < 9) { p.y = -20; p.x = Math.random() * W; }
          g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos(t * 4 + p.r)); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
    }, []);
    return h('canvas', { ref, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' } });
  };

  // ---------- Celebration ----------
  const TITLES = { 'יום הולדת': 'יום הולדת שמח!', 'שחרור': 'בהצלחה בהמשך הדרך!', 'ברוכים הבאים': 'ברוכים הבאים למנהלת!', 'מזל טוב': 'מזל טוב!',
    // the same chips in English (lib/translate.ts FIXED)
    Birthday: 'Happy Birthday!', Farewell: 'All the best ahead!', Welcome: 'Welcome aboard!', Congratulations: 'Congratulations!' };
  const Celebration = ({ person }) => {
    const p = person;
    return shell([
      h('div', { key: 'bg', style: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 900px 640px at 50% 50%, rgba(20,40,80,.88), rgba(4,9,20,.96))', backdropFilter: 'blur(10px)' } }),
      h(Party, { key: 'party' }),
      h('div', { key: 'c', style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 } },
        h('div', { style: { position: 'relative', width: 300, height: 300, animation: 'popIn 1s cubic-bezier(.2,1.4,.4,1) .2s both' } },
          h('div', { style: { position: 'absolute', inset: -14, borderRadius: '50%', background: `conic-gradient(${p.color}, #6fd6ea, #d4f25c, ${p.color})`, animation: 'spin 5s linear infinite', filter: 'blur(1px)' } }),
          h('div', { style: { position: 'absolute', inset: -40, borderRadius: '50%', border: `2px solid ${p.color}`, animation: 'ping 2.4s ease-out infinite' } }),
          h('img', { src: window.wallAvatar(400, p.photo, p.name), alt: p.name, style: { position: 'absolute', inset: 0, width: 300, height: 300, borderRadius: '50%', objectFit: 'cover', border: '6px solid #0a1428' } })),
        h('div', { style: { fontSize: 30, fontWeight: 700, color: '#0a1224', background: p.color, padding: '8px 28px', borderRadius: 999, animation: 'rise .8s ease .6s both' } }, p.type),
        h('div', { style: { fontSize: 120, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', textShadow: `0 0 60px ${p.color}66`, animation: 'rise .9s ease .8s both' } }, TITLES[p.type] || tr('מזל טוב!', 'Congratulations!')),
        h('div', { style: { fontSize: 72, fontWeight: 700, lineHeight: 1.1, animation: 'rise .9s ease 1s both' } }, p.name),
        h('div', { style: { fontSize: 30, color: '#b3c2dc', fontWeight: 300, animation: 'rise .9s ease 1.2s both' } }, [p.line, tr('כל המנהלת מברכת', 'Warm wishes from all of us at the Space Program Office')].filter(Boolean).join(' · ')))
    ]);
  };

  // ---------- Launch mode ----------
  const LaunchMode = ({ launch }) => {
    const now = useNow(100), at = Date.parse(launch.at), d = at - now, live = d <= 0;
    const a = Math.abs(d), m = Math.floor(a / 60e3), s = Math.floor(a / 1e3) % 60, ds = Math.floor(a / 100) % 10;
    const frac = Math.max(0, Math.min(1, d / 600e3));
    const steps = [['GO/NO-GO', d < 540e3], [tr('מילוי דלק', 'Fueling'), d < 420e3], [tr('מערכות פנימיות', 'Internal power'), d < 120e3], [tr('הצתה', 'Ignition'), d < 3e3], [tr('המראה', 'Liftoff'), live]];
    return shell([
      h('div', { key: 'bg', style: { position: 'absolute', inset: 0, background: live ? 'radial-gradient(ellipse at 50% 100%, rgba(255,170,90,.35), rgba(8,14,30,.99) 60%)' : 'radial-gradient(ellipse at 50% 60%, rgba(16,40,78,.97), rgba(4,9,20,.99) 70%)', transition: 'background 1.5s ease' } }),
      h('div', { key: 'grid', style: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(111,214,234,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(111,214,234,.06) 1px, transparent 1px)', backgroundSize: '60px 60px', WebkitMaskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)' } }),
      live ? h('div', { key: 'flash', style: { position: 'absolute', inset: 0, background: '#fff', animation: 'flash 1.2s ease-out both', pointerEvents: 'none' } }) : null,
      h('div', { key: 'top', style: { position: 'absolute', top: 60, left: 0, right: 0, display: 'flex', justifyContent: 'center' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 30px', borderRadius: 999, border: `1px solid ${live ? '#e9b872' : '#d4f25c'}`, background: 'rgba(10,20,40,.7)', fontSize: 26, fontWeight: 700, color: live ? '#e9b872' : '#d4f25c' } },
          h('span', { style: { width: 14, height: 14, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 16px currentColor', animation: 'breathe 1s ease-in-out infinite' } }), live ? tr('שוגר! · LIFTOFF', 'LIFTOFF!') : tr('מצב שיגור · LAUNCH MODE', 'LAUNCH MODE'))),
      h('div', { key: 'mid', style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 } },
        h('div', { style: { fontSize: 34, color: '#8b9dbd', fontWeight: 300, whiteSpace: 'nowrap' } }, launch.vehicle + ' · ' + launch.site),
        h('div', { style: { fontSize: 78, fontWeight: 700, lineHeight: 1.05, textAlign: 'center' } }, launch.mission),
        h('div', { dir: 'ltr', style: { fontFamily: LEX, fontVariantNumeric: 'tabular-nums', fontSize: 260, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.02em', color: live ? '#e9b872' : '#ffffff', textShadow: live ? '0 0 80px rgba(233,184,114,.6)' : '0 0 60px rgba(111,214,234,.35)' } },
          (live ? 'T+' : 'T−') + p2(m) + ':' + p2(s), h('span', { style: { fontSize: 110, color: live ? '#e9b872' : '#6fd6ea' } }, '.' + ds)),
        h('div', { style: { width: 1100, height: 6, borderRadius: 6, background: 'rgba(150,190,240,.15)', overflow: 'hidden' } }, h('div', { style: { height: '100%', width: (100 - frac * 100) + '%', background: 'linear-gradient(270deg,#d4f25c,#6fd6ea)', boxShadow: '0 0 20px #6fd6ea', transition: 'width .1s linear' } })),
        h('div', { style: { display: 'flex', gap: 14, marginTop: 10 } }, steps.map(([lab, done], i) => h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px', borderRadius: 999, fontSize: 22, fontWeight: 500, whiteSpace: 'nowrap', border: `1px solid ${done ? 'rgba(143,224,184,.7)' : 'rgba(150,190,240,.2)'}`, color: done ? '#8fe0b8' : '#6f82a6', background: done ? 'rgba(143,224,184,.08)' : 'transparent', transition: 'all .6s ease' } }, h('span', null, done ? '✓' : '○'), lab)))),
      live ? h('div', { key: 'trail', style: { position: 'absolute', left: '50%', bottom: 0, width: 8, marginLeft: -4, height: 1080, background: 'linear-gradient(0deg, rgba(255,200,120,0), rgba(255,220,160,.9) 60%, #fff)', filter: 'blur(2px)', transformOrigin: 'bottom', animation: 'liftoff 4s cubic-bezier(.5,0,.8,.4) both' } }) : null
    ]);
  };

  // ---------- 12:00 show: 10…0 countdown around the logo, then the promo video ----------
  // The video loads, unseen, from the start of the countdown, so it plays from the first frame without waiting on the
  // network. Without a src (the remote's preview, which shows its own card) the show ends on the dark background.
  const NoonShow = ({ src, logo, muted, onDone }) => {
    const [phase, setPhase] = useState('count'), [n, setN] = useState(10), vid = useRef(null);
    useEffect(() => { if (phase !== 'count') return; const id = setInterval(() => setN((x) => { if (x <= 0) { clearInterval(id); setTimeout(() => setPhase('video'), 900); return 0; } return x - 1; }), 1000); return () => clearInterval(id); }, [phase]);
    useEffect(() => { if (phase !== 'video' || !vid.current) return; const v = vid.current; v.muted = !!muted; v.volume = 1; v.play().catch(() => { v.muted = true; v.play().catch(() => onDone && onDone()); }); }, [phase]);
    const playing = phase === 'video';
    const ticks = Array.from({ length: 10 }, (_, i) => i);
    return shell([
      h('div', { key: 'bg', style: { position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(14,34,70,.94), rgba(2,5,12,.99) 65%)' } }),
      phase === 'count' ? h('div', { key: 'cnt', style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40, paddingBottom: 60 } },
        h('div', { style: { position: 'relative', width: 560, height: 560, marginBottom: 150 } },
          h('div', { style: { position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(from 0deg, #6fd6ea ${(10 - n) * 36}deg, rgba(150,190,240,.12) 0)`, WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px))', mask: 'radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px))', transition: 'background .8s ease', filter: 'drop-shadow(0 0 16px rgba(111,214,234,.6))' } }),
          ticks.map((i) => h('span', { key: i, style: { position: 'absolute', left: '50%', top: '50%', width: 4, height: 30, marginLeft: -2, marginTop: -15, borderRadius: 2, background: i < 10 - n ? '#d4f25c' : 'rgba(150,190,240,.3)', boxShadow: i < 10 - n ? '0 0 12px #d4f25c' : 'none', transform: `rotate(${i * 36}deg) translateY(-312px)`, transition: 'all .4s ease' } })),
          h('div', { style: { position: 'absolute', inset: 30, borderRadius: '50%', border: '1px dashed rgba(111,214,234,.35)', animation: 'spin 30s linear infinite' } }),
          h('div', { style: { position: 'absolute', inset: 110, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fff, #dfeaf7 60%, #a9c3e2)', boxShadow: `0 0 ${60 + (10 - n) * 12}px rgba(111,214,234,.55)`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: n === 0 ? 'scale(1.25)' : 'scale(1)', transition: 'transform .9s cubic-bezier(.3,1.4,.5,1), box-shadow .8s ease' } }, h('img', { src: logo, alt: '', style: { width: '82%', height: '82%', objectFit: 'contain' } })),
          h('div', { key: n, dir: 'ltr', style: { position: 'absolute', left: 0, right: 0, bottom: -150, textAlign: 'center', fontFamily: LEX, fontSize: 110, fontWeight: 300, color: n === 0 ? '#d4f25c' : '#fff', animation: 'countPop .9s ease both', fontVariantNumeric: 'tabular-nums' } }, n === 0 ? 'LIFTOFF' : p2(n))),
        h('div', { style: { fontSize: 40, fontWeight: 700, letterSpacing: '.02em' } }, tr('מנהלת החלל · סרטון תדמית', 'Space Program Office · Promo video')),
        h('div', { style: { fontFamily: MONO, fontSize: 20, color: '#8b9dbd', letterSpacing: '.2em' } }, '12:00 · DAILY BROADCAST')) : null,
      src ? h('video', { key: 'v', ref: vid, src, preload: 'auto', playsInline: true, onEnded: () => onDone && onDone(), style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000', visibility: playing ? 'visible' : 'hidden', animation: playing ? 'ovIn 1s ease both' : 'none' } }) : null,
      n === 0 && !playing ? h('div', { key: 'fl', style: { position: 'absolute', inset: 0, background: '#fff', animation: 'flash 1.2s ease-out both', pointerEvents: 'none' } }) : null
    ]);
  };

  // ---------- important directorate event, started from the remote or automatically while it runs ----------
  // `until` is when this screen itself ends (the remote can show an event for less, or after, its own end).
  // With a picture (event.img), the words take one side and the picture, whole and uncropped, the other.
  const EventTakeover = ({ event, until }) => shell([
    h('div', { key: 'bg', style: { position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#0b1d42 0%,#040914 70%)' } }),
    h('div', { key: 'c', style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 80, padding: 134, boxSizing: 'border-box' } },
      h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 27 } },
        h('span', { style: { fontSize: 38, fontWeight: 700, color: '#9fdcff', letterSpacing: '.08em', animation: 'rise .8s ease .2s both' } }, tr('עכשיו במנהלת', 'Happening now')),
        h('span', { style: { fontSize: event.img ? 84 : 108, fontWeight: 800, lineHeight: 1.1, textWrap: 'balance', animation: 'rise .9s ease .4s both' } }, event.title),
        h('span', { style: { fontSize: 44, color: '#cfe0f7', animation: 'rise .9s ease .6s both' } }, event.start + '–' + event.end + (event.place ? ' · ' + event.place : ''))),
      event.img ? h('img', { src: event.img, alt: '', onError: (ev) => { ev.currentTarget.style.display = 'none'; }, style: { flex: 'none', display: 'block', maxWidth: 760, maxHeight: 760, borderRadius: 28, border: '1px solid rgba(150,190,240,.22)', boxShadow: '0 30px 80px rgba(0,0,0,.55)', animation: 'popIn 1s cubic-bezier(.2,1.4,.4,1) .3s both' } }) : null),
    h('span', { key: 'end', style: { position: 'absolute', bottom: 77, [EN() ? 'left' : 'right']: 134, fontSize: 29, color: '#8b9dbd' } }, tr('יורד לבד ב-', 'Until ') + (until ? fmtHM.format(new Date(until)) : event.end))
  ]);

  // ---------- welcome screen for a delegation's visit, until "enter" in the remote ----------
  // Deep space with the directorate's realistic 3D emblem on the right: it waits at night, the sun rises on its limb and the
  // logo assembles (emblem-v2 intro="go"), then the title lands on the left. Idle, everything breathes on one 9 s cycle
  // (sun → limb → glow → words) while the sky slowly wheels. On "enter" (`leaving`, a performance.now() stamp from the wall)
  // the words drift off and one continuous camera move carries the Earth into the home wall's emblem slot while the wall
  // assembles around it (wall.js); two rings clamp it, and the hero hands over to the wall's own emblem, drawn on the same
  // page clock, so nothing visibly changes. 12 s in all. Light on purpose (the lobby computer is weak): one 2D canvas, one
  // WebGL loop, and otherwise only transform/opacity animations (WAAPI for the way out, so they run on the compositor).
  const GEO = window.wallGeo, G = GEO.HERO.g, GB = GEO.HERO.gIn, HB = GEO.HERO;
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const bez = (x1, y1, x2, y2) => (x) => {   // a CSS cubic-bezier as a function (for the canvas's part of the camera move)
    if (x <= 0) return 0; if (x >= 1) return 1;
    let u = x; for (let i = 0; i < 8; i++) { const cx = 3 * u * (1 - u) * (1 - u) * x1 + 3 * u * u * (1 - u) * x2 + u * u * u - x, d = 3 * (1 - u) * (1 - u) * x1 + 6 * u * (1 - u) * (x2 - x1) + 3 * u * u * (1 - x2); if (Math.abs(cx) < 1e-5 || !d) break; u = Math.min(1, Math.max(0, u - cx / d)); }
    return 3 * u * (1 - u) * (1 - u) * y1 + 3 * u * u * (1 - u) * y2 + u * u * u;
  };
  const camEase = bez(0.42, 0, 0.18, 1);
  // A faint static dither over the gradients: no banding on an 8-bit lobby panel.
  const dither = () => window.__wlDither || (window.__wlDither = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), d = g.createImageData(128, 128); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 4; } g.putImageData(d, 0, 0); return c.toDataURL(); })());

  // The sky: ~1500 seeded stars in three depths on a disc around the Earth, wheeling slowly about it (each depth at its
  // own rate, the rate itself breathing), twinkling, with a rare satellite pass and shooting star. On the way out it brakes,
  // then gives the camera move its parallax (near stars streak). fx off: drawn once.
  const Sky = ({ fx, leaving, target, preview }) => {
    const ref = useRef(null), io = useRef({});
    io.current.fx = fx; io.current.leaving = leaving; io.current.target = target;
    useEffect(() => {
      const c = ref.current, g = c.getContext('2d');
      const st = c.getBoundingClientRect().width / 1920 || 1, k = preview ? 0.5 : Math.min(1, st * (window.devicePixelRatio || 1));
      c.width = Math.round(1920 * k); c.height = Math.round(1080 * k);
      const rnd = mulberry(0x5EED), BANDS = [[1024, 0.5, 0.9, 0.22, 0.5, 0.04], [376, 0.8, 1.3, 0.45, 0.8, 0.07], [82, 1.3, 2.0, 0.75, 1, 0.11]];
      const N = BANDS.reduce((a, b) => a + b[0], 0);
      const band = new Uint8Array(N), rc = new Float32Array(N), rs = new Float32Array(N), rad = new Float32Array(N), a0 = new Float32Array(N), col = new Uint8Array(N);
      const tw = new Float32Array(N), om = new Float32Array(N), ph = new Float32Array(N), px = new Float32Array(N), py = new Float32Array(N), qx = new Float32Array(N), qy = new Float32Array(N), bk = new Uint8Array(N), order = new Uint16Array(N), cnt = new Uint16Array(19);
      let n = 0;
      BANDS.forEach(([count, r0, r1, al0, al1], b) => { for (let i = 0; i < count; i++, n++) {
        const r = 1500 * Math.sqrt(rnd()), f = rnd() * Math.PI * 2;
        band[n] = b; rc[n] = r * Math.cos(f); rs[n] = r * Math.sin(f); rad[n] = r0 + (r1 - r0) * rnd(); a0[n] = al0 + (al1 - al0) * rnd();
        const cr = rnd(); col[n] = cr < 0.8 ? 0 : cr < 0.92 ? 1 : 2;
        const tr0 = rnd(); tw[n] = b === 2 && tr0 < 0.05 ? 0.4 : tr0 < 0.3 ? 0.25 : 0; om[n] = tw[n] === 0.4 ? 1.2 + 0.8 * rnd() : 0.25 + 0.65 * rnd(); ph[n] = rnd() * 6.283;
      } });
      const COLS = ['#ffffff', '#cfe6ff', '#ffe9c8'];
      const sprite = document.createElement('canvas'); sprite.width = sprite.height = 16;
      (() => { const sg = sprite.getContext('2d'), gr = sg.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, 'rgba(230,242,255,.5)'); gr.addColorStop(0.35, 'rgba(230,242,255,.14)'); gr.addColorStop(1, 'rgba(230,242,255,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 16, 16); })();
      const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
      const mask = (x, y) => 1 - 0.7 * sm(60, 100, x) * (1 - sm(960, 1000, x)) * sm(296, 336, y) * (1 - sm(766, 806, y));
      const theta = [0, 0, 0], RATE = BANDS.map((b) => b[5] * Math.PI / 180);
      const OFF = [[-40, -5], [-120, -15], [-300, -36]], SC = [1, 0.985, 0.95];
      let raf = 0, last = performance.now(), t = 0, odd = false, drewLeave = false;
      let nextMeteor = 6 + rnd() * 10, meteor = null, nextSat = 25 + rnd() * 40, sat = null;
      const frame = (now) => {
        const io0 = io.current, L = io0.leaving, T = L ? now - L : -1;   // ms since the way out began (negative: not yet)
        const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
        // Rotation, braking to a held breath over 0.8 s once the way out begins.
        const brake = T < 0 ? 1 : Math.pow(1 - Math.min(1, T / 800), 3), breath = 0.8 + 0.2 * Math.sin(t * 6.283 / 23);
        if (io0.fx) for (let b = 0; b < 3; b++) theta[b] += RATE[b] * breath * brake * dt;
        const p = T < 1000 ? 0 : camEase((T - 1000) / 7200), S = (io0.target && io0.target.gc) || { x: 960, y: 450 };
        g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, 1920, 1080);
        const c0 = Math.cos(theta[0]), c1 = Math.cos(theta[1]), c2 = Math.cos(theta[2]), s0_ = Math.sin(theta[0]), s1_ = Math.sin(theta[1]), s2_ = Math.sin(theta[2]);
        cnt.fill(0);
        const streak = p > 0 && p < 1;
        g.lineCap = 'round';
        for (let i = 0; i < N; i++) {
          const b = band[i];
          const cb_ = b === 0 ? c0 : b === 1 ? c1 : c2, sb_ = b === 0 ? s0_ : b === 1 ? s1_ : s2_;
          let x = G.x + rc[i] * cb_ + rs[i] * sb_, y = G.y + rs[i] * cb_ - rc[i] * sb_;
          if (p > 0) { const s = 1 + (SC[b] - 1) * p; x = S.x + (x - S.x) * s + OFF[b][0] * p; y = S.y + (y - S.y) * s + OFF[b][1] * p; }
          qx[i] = px[i]; qy[i] = py[i]; px[i] = x; py[i] = y;
          if (x < -8 || x > 1928 || y < -8 || y > 1088) { bk[i] = 255; continue; }
          let a = a0[i] * mask(x, y);
          if (tw[i]) a *= 1 + tw[i] * Math.sin(om[i] * t + ph[i]) - (tw[i] === 0.25 ? 0.25 : 0);
          // On the way out, a moving near or middle star is a short streak (stroked below), not a dot.
          if (streak && b > 0 && drewLeave && (x - qx[i]) * (x - qx[i]) + (y - qy[i]) * (y - qy[i]) > 1.44) { bk[i] = 254; continue; }
          const q = Math.min(5, Math.max(0, (a * 6) | 0)); bk[i] = col[i] * 6 + q; cnt[bk[i]]++;
        }
        // Batched by colour × alpha (18 fills), no per-star state changes.
        let acc = 0; for (let j = 0; j < 18; j++) { const c0 = cnt[j]; cnt[j] = acc; acc += c0; }
        for (let i = 0; i < N; i++) if (bk[i] < 18) order[cnt[bk[i]]++] = i;
        let s0 = 0;
        for (let j = 0; j < 18; j++) {
          const e = cnt[j]; if (e === s0) continue;
          g.globalAlpha = ((j % 6) + 0.5) / 6; g.fillStyle = COLS[(j / 6) | 0]; g.beginPath();
          for (let m = s0; m < e; m++) { const i = order[m], r = rad[i]; g.rect(px[i] - r / 2, py[i] - r / 2, r, r); }
          g.fill(); s0 = e;
        }
        for (let i = 0; i < N; i++) if (band[i] === 2 && bk[i] < 18) { g.globalAlpha = 0.6 * a0[i] * mask(px[i], py[i]); g.drawImage(sprite, px[i] - 8, py[i] - 8); }
        if (streak && drewLeave) for (let b = 1; b < 3; b++) for (let cI = 0; cI < 3; cI++) {
          g.globalAlpha = b === 2 ? 0.9 : 0.6; g.strokeStyle = COLS[cI]; g.lineWidth = b === 2 ? 1.6 : 1; g.beginPath(); let any = false;
          for (let i = 0; i < N; i++) if (bk[i] === 254 && band[i] === b && col[i] === cI) {
            const dx = qx[i] - px[i], dy = qy[i] - py[i], k6 = Math.min(6, 24 / (Math.hypot(dx, dy) || 1));   // six frames' motion, at most 24 px
            g.moveTo(px[i], py[i]); g.lineTo(px[i] + k6 * dx, py[i] + k6 * dy); any = true;
          }
          if (any) g.stroke();
        }
        if (p > 0) drewLeave = true;
        // Rare life (fx, idle only): a satellite crossing slowly, a shooting star.
        if (io0.fx && T < 0) {
          if (!sat && t > nextSat) sat = { x: -10, y: 70 + rnd() * 230, v: 60 + rnd() * 15, a: (4 + rnd() * 8) * Math.PI / 180, glint: rnd() < 0.25 ? 6 + rnd() * 14 : -1, t0: t };
          if (sat) { const u = t - sat.t0; sat.x = -10 + u * sat.v * Math.cos(sat.a); const y = sat.y + u * sat.v * Math.sin(sat.a); const gl = sat.glint > 0 && Math.abs(u - sat.glint) < 0.45;
            g.globalAlpha = gl ? 1 : 0.8; g.fillStyle = '#eaf4ff'; const r = gl ? 2.4 : 1.3; g.beginPath(); g.arc(sat.x, y, r, 0, 6.283); g.fill();
            if (sat.x > 1930) { sat = null; nextSat = t + 70 + rnd() * 40; } }
          if (!meteor && t > nextMeteor) { const a = (195 + rnd() * 10) * Math.PI / 180; meteor = { x: 300 + rnd() * 700, y: 30 + rnd() * 130, dx: Math.cos(a), dy: -Math.sin(a), t0: t }; }
          if (meteor) { const u = t - meteor.t0, hx = meteor.x + meteor.dx * 900 * u, hy = meteor.y + meteor.dy * 900 * u, len = Math.min(180, 900 * u), fade = 1 - u / 0.55;
            if (fade <= 0) { meteor = null; nextMeteor = t + 14 + rnd() * 12; }
            else { const gr = g.createLinearGradient(hx, hy, hx - meteor.dx * len, hy - meteor.dy * len); gr.addColorStop(0, 'rgba(240,248,255,.95)'); gr.addColorStop(1, 'rgba(240,248,255,0)');
              g.globalAlpha = fade; g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - meteor.dx * len, hy - meteor.dy * len); g.stroke(); } }
        }
        g.globalAlpha = 1;
      };
      const loop = (now) => {
        const io0 = io.current, L = io0.leaving, T = L ? now - L : -1;
        if (T > 6400) { raf = 0; return; }   // faded out by then
        if (!io0.fx) { frame(now); raf = 0; return; }   // fx off: one still picture (the way out moves the canvas itself)
        odd = !odd;
        if (T >= 0 || odd) frame(now);       // 30 fps idle, 60 on the way out
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      io.current.kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
      return () => cancelAnimationFrame(raf);
    }, []);
    useEffect(() => { if (io.current.kick && fx) io.current.kick(); }, [leaving, fx]);
    return h('canvas', { ref, style: { position: 'absolute', inset: 0, width: '100%', height: '100%' } });
  };

  const fmtWlClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmtWlUTC = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtWlDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const WL_TITLE = ['THE SPACE', 'PROGRAM OFFICE'];
  const abs = (x, y, w, hh, extra) => Object.assign({ position: 'absolute', left: x, top: y, width: w, height: hh }, extra);
  const circle = (cx, cy, d, extra) => abs(cx - d / 2, cy - d / 2, d, d, Object.assign({ borderRadius: '50%' }, extra));

  // how the words (and a flat disc in the emblem's place) leave: drift left and fade
  const WL_OUT = [{ opacity: 1, transform: 'none' }, { offset: 0.65, opacity: 0, transform: 'translateX(-104px)' }, { opacity: 0, transform: 'translateX(-160px)' }];
  const WL_OUT_EASE = 'cubic-bezier(.45,0,.3,1)';

  /** props: guest, fx, preview, leaving (performance.now() of the way out, maybe still ahead; 0 = not leaving), woke and
   *  embShown (the wall's steps), mode ('dissolve' | 'scan' | 'none'), target (wallGeo.landing), attrs ({speed, sway, word},
   *  frozen at mount), onReveal(R, ok, hero element), onHeroGone(). */
  const Welcome = (props) => {
    const { guest, fx, preview, leaving, woke, embShown, mode, target } = props;
    const skyFx = fx && !preview;                          // the remote's preview draws one still sky
    const A = useRef(props.attrs).current;
    const [phase, setPhase] = useState('load');            // 'load' → 'intro' at R (one commit carries every intro and idle animation)
    const [heroOn, setHeroOn] = useState(!preview);
    const [heroOk, setHeroOk] = useState(!preview);
    const r = useRef({}).current;                          // element refs, by name
    const set = (name) => r['_' + name] || (r['_' + name] = (el) => { r[name] = el; });
    const letters = useRef([]).current, twins = useRef([]).current, xs = useRef([]).current;
    const cb = useRef(props); cb.current = props;
    const leaveRef = useRef(0); leaveRef.current = leaving;
    const timers = useRef([]).current;
    const later = (ms, fn) => timers.push(setTimeout(fn, Math.max(0, ms)));
    useEffect(() => () => timers.forEach(clearTimeout), []);

    // ---- reveal: when the hero has loaded and compiled (no white globe, no late wordmark), at least 1.4 s after the dip
    useEffect(() => {
      const t0 = performance.now(), el = r.hero;
      let done = false;
      const reveal = (ok) => {
        if (done) return; done = true;
        r.g0 = cb.current.guest;                             // the name the intro brings in (a later one comes in at once)
        window.__emblemEpoch = performance.now() - 600;      // t(R) = 0.6: every emblem phase is a fixed offset from R
        letters.forEach((s, i) => { xs[i] = s ? 128 + s.offsetLeft + s.offsetWidth / 2 : 600; });
        if (ok && r.hero) r.hero.setAttribute('intro', 'go'); else { setHeroOn(false); setHeroOk(false); }
        setPhase('intro');
        cb.current.onReveal && cb.current.onReveal(performance.now(), ok, r.hero);
        later(3000, () => { if (r.hero && !leaveRef.current) r.hero.setAttribute('events', 'on'); });
      };
      if (!el) { later(1400, () => reveal(false)); return; }
      const onReady = () => later(1400 - (performance.now() - t0), () => reveal(true));
      const onErr = () => { if (!done) reveal(false); else { setHeroOn(false); setHeroOk(false); cb.current.onReveal && cb.current.onReveal(null, false); } };
      el.addEventListener('emblem-ready', onReady); el.addEventListener('emblem-error', onErr);
      if (el.ready) onReady();
      later(6000, () => reveal(typeof el.getTime === 'function'));
      return () => { el.removeEventListener('emblem-ready', onReady); el.removeEventListener('emblem-error', onErr); };
    }, []);

    // a guest's name changed after the reveal comes in at once, whatever it is (even the first one again)
    useEffect(() => { if (r.g0 !== undefined && guest !== r.g0) r.g0 = null; }, [guest]);

    // ---- the way out: every step from one start time, as compositor animations (WAAPI) on the outer wrappers
    useEffect(() => {
      if (!leaving) return;
      const t0 = leaving, anims = [];
      const at = (T) => T - (performance.now() - t0);
      // (fill 'both' holds a layer at its first keyframe until its step: 'forwards' for one whose first keyframe is not how it rests)
      const run = (el, kf, T, dur, easing, origin, fill) => { if (!el) return; if (origin) el.style.transformOrigin = origin; anims.push(el.animate(kf, { delay: at(T), duration: dur, easing: easing || 'linear', fill: fill || 'both' })); };
      ['rigX', 'rigY', 'rigS', 'eyebrowO', 'line1O', 'line2O'].forEach((n) => r[n] && (r[n].style.willChange = 'transform'));
      later(at(0), () => { if (r.hero) r.hero.setAttribute('events', 'off'); });
      // the breath held, then the light gathers and the sun sets behind the limb
      run(r.sunO, [{ transform: 'none', opacity: 1, easing: 'cubic-bezier(.5,0,.75,0)' }, { offset: 0.42, transform: 'scale(1.5)', opacity: 1, easing: 'cubic-bezier(.45,0,.55,1)' }, { transform: 'translate(22px,22px) scale(.6)', opacity: 0 }], 0, 2400);
      run(r.streakO, [{ transform: 'scaleX(1)', opacity: 1 }, { offset: 0.5, transform: 'scaleX(1.5)', opacity: 1 }, { transform: 'scaleX(2.6)', opacity: 0 }], 0, 2000);
      run(r.auraO, [{ transform: 'none', opacity: 1 }, { offset: 0.122, transform: 'scale(1.06)', opacity: 1 }, { offset: 0.3, transform: 'none', opacity: 1 }, { offset: 0.793, transform: 'none', opacity: 1 }, { transform: 'none', opacity: 0 }], 0, 8200, 'ease-in-out');
      run(r.flare, [{ opacity: 0 }, { offset: 0.4, opacity: 0.7 }, { opacity: 0 }], 200, 2000);
      if (fx) twins.forEach((tw, i) => run(tw, [{ opacity: 0 }, { offset: 0.3, opacity: 0.9 }, { opacity: 0 }], 200 + (1080 - (xs[i] || 600)) / 1.5, 450));
      // the clock says so, then everything around the words leaves
      run(r.clockA, [{ opacity: 1 }, { opacity: 0 }], 0, 250);
      run(r.clockB, [{ opacity: 0 }, { opacity: 1 }], 250, 350);
      run(r.caption, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-40px)' }], 500, 700, 'ease-in');
      [['eyebrowO', 600], ['line1O', 750], ['glowO', 825], ['line2O', 900], ['guestO', 1100], ['heO', 1200]].forEach(([n, T]) => run(r[n], WL_OUT, T, 2400, WL_OUT_EASE));
      run(r.ruleO, [{ transform: 'none', opacity: 1 }, { transform: 'scaleX(0)', opacity: 0 }], 1000, 900, 'cubic-bezier(.55,0,.85,.35)', 'left center');
      if (r.rigFloat) { const cur = getComputedStyle(r.rigFloat).transform; r.rigFloat.style.animation = 'none'; r.rigFloat.style.transform = cur === 'none' ? '' : cur; run(r.rigFloat, [{ transform: cur === 'none' ? 'none' : cur }, { transform: 'none' }], 1000, 1200, 'ease-in-out'); }
      if (!skyFx) run(r.skyO, [{ transform: 'none' }, { transform: 'translateX(-120px)' }], 1000, 7200, 'cubic-bezier(.42,0,.18,1)');   // a still sky moves as one
      // English: the name that just left the screen lands in the logo (if the emblem has the English name: see wordFits)
      later(at(1600), () => { if (r.hero && EN() && A.word === tr('מנהלת החלל', 'SPACE PROGRAM OFFICE')) r.hero.setAttribute('wordmark', 'up'); });
      run(r.clockO, [{ opacity: 1 }, { opacity: 0 }], 2400, 600);
      run(r.veilO, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-80px)', opacity: 0 }], 2400, 2200, 'cubic-bezier(.45,0,.55,1)');
      run(r.skyFade, [{ opacity: 1 }, { opacity: 0 }], 3400, 3000, 'ease-in-out');
      run(r.limbO, [{ opacity: 1 }, { opacity: 0 }], 6500, 1700, 'ease-in-out');
      // docking: two rings clamp the Earth in its seat, a soft arrival bloom (never a white-out), a ripple
      const clamp = [{ transform: 'scale(1.3)', opacity: 0 }, { offset: 0.55, transform: 'scale(1.02)', opacity: 0.85 }, { offset: 0.72, transform: 'none', opacity: 0.85 }, { transform: 'none', opacity: 0 }];
      run(r.clampA, clamp, 7400, 900, 'cubic-bezier(.2,.8,.3,1)');
      run(r.clampB, clamp, 7500, 900, 'cubic-bezier(.2,.8,.3,1)');
      run(r.bloom, [{ opacity: 0, transform: 'scale(.5)' }, { offset: 0.35, opacity: 0.42, transform: 'scale(.82)' }, { opacity: 0, transform: 'none' }], 8300, 1200, 'cubic-bezier(.2,.8,.3,1)');
      run(r.ripple, [{ opacity: 0.4, transform: 'scale(.69)' }, { opacity: 0, transform: 'none' }], 8400, 1200, 'cubic-bezier(.2,.8,.3,1)', undefined, 'forwards');
      return () => anims.forEach((a) => { try { a.cancel(); } catch (e) {} });
    }, [leaving]);
    // the camera move: three axes, three curves, so the path bends; it lands exactly on the wall's emblem (the wall
    // measures its slot once it is laid out under the welcome, before the move starts: a new target starts it over)
    const tgKey = target ? [target.tx, target.ty, target.s].join() : '';
    useEffect(() => {
      if (!leaving) return;
      const tg = target || GEO.landing(GEO.SLOT_DATA), anims = [];
      const run = (el, kf, T, dur, easing) => { if (el) anims.push(el.animate(kf, { delay: T - (performance.now() - leaving), duration: dur, easing, fill: 'both' })); };
      run(r.rigX, [{ transform: 'none' }, { transform: `translateX(${tg.tx}px)` }], 1000, 7200, 'cubic-bezier(.42,0,.18,1)');
      run(r.rigS, [{ transform: 'none' }, { transform: `scale(${tg.s})` }], 1400, 6600, 'cubic-bezier(.5,0,.2,1)');
      run(r.rigY, [{ transform: 'none' }, { transform: `translateY(${tg.ty}px)` }], 1600, 6400, 'cubic-bezier(.55,0,.2,1)');
      return () => anims.forEach((a) => { try { a.cancel(); } catch (e) {} });
    }, [leaving, tgKey]);
    // the flat disc (no hero) leaves with the words; one that came up after the way out began (the hero failed) too
    useEffect(() => {
      if (!leaving || heroOk || !r.discO || r.discO._out) return;
      r.discO._out = r.discO.animate(WL_OUT, { delay: 1000 - (performance.now() - leaving), duration: 2400, easing: WL_OUT_EASE, fill: 'both' });
    }, [leaving, heroOk]);
    // the welcome's deep space dissolves only once the wall is awake underneath
    useEffect(() => {
      if (!leaving || !woke || !r.base) return;
      const T = Math.max(3000, performance.now() - leaving);
      const a = r.base.animate([{ opacity: 1 }, { opacity: 0 }], { delay: T - (performance.now() - leaving), duration: 3600, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' });
      return () => a.cancel();
    }, [leaving, woke]);
    // the hand-off, once the wall's own emblem is showing (identical) underneath: only the top layer goes
    useEffect(() => {
      if (!leaving || !embShown) return;
      const T = performance.now() - leaving, anims = [];
      const go = (el, kf, start, dur, easing, fill) => { if (el) anims.push(el.animate(kf, { delay: start - T, duration: dur, easing, fill: fill || 'both' })); };
      let end;
      if (mode === 'scan') {
        const s = Math.max(9200, T + 100), d = 'cubic-bezier(.65,0,.35,1)';
        go(r.clipOuter, [{ transform: 'none' }, { transform: `translateY(${HB.h}px)` }], s, 1400, d);
        go(r.clipInner, [{ transform: 'none' }, { transform: `translateY(${-HB.h}px)` }], s, 1400, d);
        go(r.scanLine, [{ transform: 'none', opacity: 1 }, { offset: 0.9, opacity: 1 }, { transform: `translateY(${HB.h}px)`, opacity: 0 }], s, 1400, d, 'forwards');
        end = s + 1400;
      } else if (mode === 'dissolve') { const s = Math.max(8800, T + 100); go(r.heroFade, [{ opacity: 1 }, { opacity: 0 }], s, 1200, 'cubic-bezier(.45,0,.55,1)'); end = s + 1200; }
      if (end) {
        later(end + 200 - T, () => { if (r.hero) r.hero.setAttribute('paused', ''); });
        later(end + 400 - T, () => { setHeroOn(false); cb.current.onHeroGone && cb.current.onHeroGone(); });
      }
      return () => anims.forEach((a) => { try { a.cancel(); } catch (e) {} });
    }, [leaving, embShown]);
    // the HUD clock, written straight into the page once a second (no re-render of the scene)
    useEffect(() => {
      const tick = () => { if (r.clockText) { const d = new Date(clock()); r.clockText.textContent = fmtWlClock.format(d) + ' ISRAEL · ' + fmtWlUTC.format(d) + ' UTC'; } };
      tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
    }, []);

    const on = phase === 'intro';
    // intro animation (applied at R, delays from R) on an -I wrapper; until then hidden
    const intro = (name, ms, delay, easing, extra) => (on ? Object.assign({ animation: `${name} ${ms}ms ${easing || 'cubic-bezier(.16,1,.3,1)'} ${delay}ms both` }, extra) : Object.assign({ opacity: 0 }, extra));
    // idle loop on the innermost element: fx only (or always, for the opacity-only breaths)
    const idle = (anim, always) => (on && (fx || always) ? { animation: anim } : {});
    const L = !!leaving, EN0 = EN();
    let li = 0;
    const word = (text, line) => Array.from(text).map((ch) => {
      const i = li++, d = 2600 + i * 30;
      return h('span', { key: i, ref: (el) => { letters[i] = el; }, style: Object.assign({ position: 'relative', display: 'inline-block', whiteSpace: 'pre' }, intro('wlLetterIn', 1200, d, 'cubic-bezier(.2,.7,.2,1)')) },
        ch,
        fx && ch !== ' ' ? h('span', { ref: (el) => { twins[i] = el; }, 'aria-hidden': true, style: Object.assign({ position: 'absolute', inset: 0, color: '#fff', textShadow: '0 0 18px rgba(200,235,255,.9), 0 0 4px #fff', opacity: 0, pointerEvents: 'none' },
          on ? { animation: `wlGlint 18s linear ${(7.3 + (1080 - (xs[i] || 600)) / 900 - 18).toFixed(3)}s infinite, wlGlintOnce .5s ease-out ${d + 700}ms backwards` } : {}) }, ch) : null);
    });
    const tg = target || GEO.landing(GEO.SLOT_DATA), gc = tg.gc;
    const guestSize = !guest ? 40 : guest.length > 44 ? 30 : guest.length > 30 ? 34 : 40;
    // The emblem's name: up in Hebrew; in English down, until the title flies into it. The name is fixed when the scene
    // starts, so after a language switch it stays down (and the wall's own emblem brings the right one at the hand-off).
    const wordFits = A.word === tr('מנהלת החלל', 'SPACE PROGRAM OFFICE');
    const heroEl = heroOn ? h('space-emblem-v2', { ref: set('hero'), globe: 'real', speed: A.speed, sway: A.sway, word: A.word, clock: 'page', events: 'off', intro: 'hold', wordmark: !EN0 && wordFits ? 'up' : 'down', maxpr: '1.25', style: { display: 'block', width: '100%', height: '100%' } }) : null;
    const showDisc = !heroOk;

    return h('div', { style: { position: 'absolute', inset: 0, zIndex: 50, overflow: 'hidden', direction: 'ltr', pointerEvents: 'none', fontFamily: 'Heebo, sans-serif', color: '#e6f1ff', animation: 'ovIn .7s cubic-bezier(.4,0,.2,1) both' } },
      // L0 base: deep space, painted once
      h('div', { key: 'base', ref: set('base'), style: { position: 'absolute', inset: 0, background: `url(${dither()}) 0 0/128px 128px repeat, radial-gradient(ellipse 1500px 1050px at 1376px 500px, rgba(26,62,138,.40) 0%, rgba(14,34,84,.20) 38%, transparent 72%), radial-gradient(circle 620px at 1150px 250px, rgba(255,226,186,.07), transparent 70%), radial-gradient(ellipse 1100px 700px at 300px 880px, rgba(40,70,150,.12), transparent 70%), radial-gradient(ellipse 125% 105% at 62% 48%, transparent 58%, rgba(0,0,0,.55) 100%), #02050f` } }),
      // L1 nebula veil
      h('div', { key: 'veil', ref: set('veilO'), style: abs(-220, -180, 1500, 1000) },
        h('div', { style: Object.assign({ position: 'absolute', inset: 0 }, on ? { animation: 'wlIn 2400ms ease both' } : { opacity: 0 }) },
          h('div', { style: Object.assign({ position: 'absolute', inset: 0, background: 'radial-gradient(closest-side at 42% 46%, rgba(70,110,220,.16), rgba(70,110,220,.05) 55%, transparent), radial-gradient(closest-side at 74% 70%, rgba(150,120,240,.07), transparent)' }, fx && !preview ? { animation: 'wlVeil 70s ease-in-out infinite alternate', willChange: 'transform' } : {}) }))),
      // L2 sky
      h('div', { key: 'sky', ref: set('skyFade'), style: { position: 'absolute', inset: 0 } },
        h('div', { ref: set('skyO'), style: { position: 'absolute', inset: 0, animation: 'wlIn 2000ms ease 500ms both' } }, h(Sky, { fx: skyFx, leaving, target: tg, preview }))),
      // L3 the hero rig: moved only by transforms on rigX / rigY / rigS (origin at the globe centre)
      h('div', { key: 'rig', style: abs(G.x - GB.x, G.y - GB.y, HB.w, HB.h) },
        h('div', { ref: set('rigX'), style: { position: 'absolute', inset: 0 } },
          h('div', { ref: set('rigY'), style: { position: 'absolute', inset: 0 } },
            h('div', { ref: set('rigS'), style: { position: 'absolute', inset: 0, transformOrigin: `${GB.x}px ${GB.y}px` } },
              h('div', { style: Object.assign({ position: 'absolute', inset: 0, transformOrigin: `${GB.x}px ${GB.y}px` }, intro('wlRigIn', 2800, 0)) },
                h('div', { ref: set('rigFloat'), style: Object.assign({ position: 'absolute', inset: 0 }, idle('wlFloat 14s ease-in-out infinite alternate')) },
                  // aura: the wall glow's own gradient at ×1.2, so it lands on it
                  h('div', { ref: set('auraO'), style: circle(GB.x, GB.y + 30.2, 1176) },
                    h('div', { style: Object.assign({ position: 'absolute', inset: 0 }, intro('wlIn', 2000, 0, 'ease')) },
                      h('div', { style: Object.assign({ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,160,240,.20) 0%, rgba(70,120,210,.08) 32%, transparent 66%)' }, idle('breathe 9s ease-in-out -7.1s infinite', true)) }))),
                  // the atmosphere's limb (the emblem's own additive glow cannot show over its transparent canvas)
                  h('div', { ref: set('limbO'), style: circle(GB.x, GB.y, 760) },
                    h('div', { style: Object.assign({ position: 'absolute', inset: 0 }, intro('wlIn', 1600, 0, 'ease')) },
                      h('div', { style: Object.assign({ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle closest-side, transparent 75%, rgba(120,185,255,.40) 78.5%, rgba(70,140,255,.14) 85%, transparent)' }, idle('wlLimb 9s ease-in-out -7.4s infinite', true)) }))),
                  // first light at the 10:30 limb, where the emblem's key light comes from
                  h('div', { ref: set('sunO'), style: Object.assign(circle(308.3, 212.3, 220), { transformOrigin: '50% 50%' }) },
                    h('div', { style: Object.assign({ position: 'absolute', inset: 0 }, intro('wlIn', 1200, 500, 'ease')) },
                      h('div', { style: Object.assign({ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle closest-side, rgba(255,244,222,.85) 0%, rgba(255,214,160,.30) 35%, transparent)' }, idle('wlBreathO 9s ease-in-out -7.7s infinite', true)) })),
                    h('div', { style: Object.assign(circle(110, 110, 28), intro('wlScaleIn', 600, 500, 'cubic-bezier(.2,.9,.3,1)')) },
                      h('div', { style: Object.assign({ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle closest-side, #fff 0 30%, #fff6e4 45%, rgba(255,220,160,.5) 70%, transparent)' }, idle('wlBreathSun 9s ease-in-out -7.7s infinite', true)) }))),
                  // the realistic emblem (never moved in the page: only its wrappers change)
                  h('div', { ref: set('heroFade'), style: Object.assign({ position: 'absolute', inset: 0 }, intro('wlIn', 1200, 0, 'cubic-bezier(.25,.1,.25,1)')) },
                    h('div', { ref: set('clipOuter'), style: { position: 'absolute', inset: 0, overflow: 'hidden' } },
                      h('div', { ref: set('clipInner'), style: { position: 'absolute', inset: 0 } }, heroEl)),
                    h('div', { ref: set('scanLine'), style: { position: 'absolute', left: 0, top: -48, width: HB.w, height: 50, opacity: 0 } },
                      h('div', { style: { position: 'absolute', left: 0, right: 0, top: 0, height: 48, background: 'linear-gradient(to top, rgba(159,220,255,.22), transparent)' } }),
                      h('div', { style: { position: 'absolute', left: 0, right: 0, top: 48, height: 2, background: '#bfe8ff' } }))),
                  // the anamorphic streak through the sun, in front of the emblem
                  h('div', { ref: set('streakO'), style: Object.assign(abs(308.3 - 380, 212.3 - 8, 760, 16), { transformOrigin: '50% 50%' }) },
                    h('div', { style: Object.assign({ position: 'absolute', inset: 0, transformOrigin: '50% 50%' }, intro('wlDrawX', 1300, 700)) },
                      h('div', { style: Object.assign({ position: 'absolute', inset: 0 }, fx ? idle('wlStreak 9s ease-in-out -7.7s infinite') : { opacity: 0.85 }) },
                        h('div', { style: { position: 'absolute', left: 120, top: 0, width: 520, height: 16, background: 'radial-gradient(ellipse closest-side, rgba(160,210,255,.18), transparent)' } }),
                        h('div', { style: { position: 'absolute', left: 0, top: 7, width: 760, height: 2, background: 'linear-gradient(90deg, transparent, rgba(140,200,255,.30) 32%, rgba(235,246,255,.9) 50%, rgba(140,200,255,.30) 68%, transparent)' } })))),
                  L ? h('div', { ref: set('flare'), style: Object.assign(circle(308.3, 212.3, 520), { opacity: 0, background: 'radial-gradient(circle closest-side, rgba(255,250,240,.9) 0, rgba(200,230,255,.35) 30%, transparent 70%)' }) }) : null,
                  // no hero (it failed, or the remote's preview): the flat logo disc in its place
                  showDisc ? h('div', { ref: set('discO'), style: circle(GB.x, GB.y, 300) },
                    h('div', { style: Object.assign({ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fff, #dfeaf7 60%, #a9c3e2)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 60px rgba(111,214,234,.45)' }, intro('wlIn', 1200, 0, 'ease')) },
                      h('img', { src: '/assets/logo-mark.png', alt: '', style: { width: '80%', height: '80%', objectFit: 'contain' } }))) : null)))))),
      // L4 the title, left
      h('div', { key: 'title', dir: 'ltr', style: { position: 'absolute', left: 128, top: 356, width: 820, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' } },
        h('div', { ref: set('eyebrowO'), style: { display: 'flex', alignItems: 'center', gap: 20, height: 34 } },
          h('span', { style: Object.assign({ width: 64, height: 1.5, background: 'linear-gradient(90deg, rgba(159,220,255,0), #9fdcff)', transformOrigin: 'left center' }, intro('wlDrawX', 900, 2200)) }),
          h('span', { style: { fontFamily: MONO, fontSize: 26, fontWeight: 500, letterSpacing: '.46em', color: '#9fdcff', whiteSpace: 'pre' } },
            Array.from('WELCOME TO').map((ch, i) => h('span', { key: i, style: Object.assign({ display: 'inline-block', whiteSpace: 'pre' }, intro('wlEyebrowIn', 800, 2400 + i * 30)) }, ch)))),
        h('div', { style: { position: 'relative', marginTop: 18, fontFamily: LEX, fontSize: 84, fontWeight: 500, lineHeight: '92px', letterSpacing: '.005em', color: '#f3f8ff', textShadow: '0 2px 24px rgba(0,0,0,.55)', whiteSpace: 'nowrap' } },
          h('div', { ref: set('glowO'), 'aria-hidden': true, style: { position: 'absolute', inset: 0 } },
            h('div', { style: Object.assign({ position: 'absolute', inset: 0 }, intro('wlIn', 1200, 2400, 'ease')) },
              h('div', { style: Object.assign({ position: 'absolute', inset: 0, color: 'transparent', textShadow: '0 0 26px rgba(111,190,255,.8), 0 0 70px rgba(60,130,255,.45)' }, fx ? idle('wlTitleGlow 9s ease-in-out -6.5s infinite') : { opacity: 0.25 }) },
                h('div', null, WL_TITLE[0]), h('div', null, WL_TITLE[1])))),
          h('div', { ref: set('line1O'), style: { position: 'relative' } }, word(WL_TITLE[0], 0)),
          h('div', { ref: set('line2O'), style: { position: 'relative' } }, word(WL_TITLE[1], 1))),
        h('div', { ref: set('ruleO'), style: { marginTop: 28, width: 440, height: 2 } },
          h('div', { style: Object.assign({ width: '100%', height: '100%', background: 'linear-gradient(90deg, rgba(212,242,92,.9), rgba(212,242,92,.35) 55%, transparent)', transformOrigin: 'left center' }, intro('wlDrawX', 1400, 3800)) })),
        guest ? h('div', { key: 'g:' + guest, ref: set('guestO'), style: { marginTop: 22, maxWidth: 820 } },
          h('div', { style: on && guest !== r.g0 ? intro('wlRiseIn', 700, 0) : intro('wlRiseIn', 1200, 4100) },
            h('div', { dir: 'auto', style: Object.assign({ fontFamily: "'Lexend', Heebo, sans-serif", fontSize: guestSize, fontWeight: 400, lineHeight: 1.25, letterSpacing: '.03em', color: '#d4f25c', textShadow: '0 0 24px rgba(212,242,92,.30)', unicodeBidi: 'plaintext', textAlign: 'left' }, fx ? idle('wlGuest 9s ease-in-out -6.5s infinite') : {}) }, guest))) : null,
        EN0 ? null : h('div', { ref: set('heO'), style: { marginTop: guest ? 12 : 22 } },
          h('div', { dir: 'rtl', style: Object.assign({ fontFamily: 'Heebo', fontSize: 30, fontWeight: 300, lineHeight: '40px', color: '#b3c8e6', letterSpacing: '.04em', textAlign: 'left' }, intro('wlRiseIn', 1200, 4400)) }, 'ברוכים הבאים למנהלת החלל'))),
      // L5 HUD: a clock top right, a caption bottom left
      h('div', { key: 'clock', ref: set('clockO'), style: { position: 'absolute', right: 128, top: 56 } },
        h('div', { style: Object.assign({ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, fontFamily: MONO, fontSize: 15, letterSpacing: '.24em', whiteSpace: 'nowrap' }, intro('wlIn', 1600, 4800, 'ease')) },
          h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: '#d4f25c', boxShadow: '0 0 10px #d4f25c', animation: L ? 'caret .5s steps(1) infinite' : 'breathe 3s ease-in-out infinite' } }),
          h('span', { ref: set('clockA'), style: { color: 'rgba(143,184,220,.62)' } }, h('span', { ref: set('clockText') })),
          h('span', { ref: set('clockB'), style: { position: 'absolute', left: 22, color: '#d4f25c', opacity: 0 } }, 'ENTERING'))),
      h('div', { key: 'cap', ref: set('caption'), style: { position: 'absolute', left: 128, bottom: 64 } },
        h('div', { style: Object.assign({ fontFamily: MONO, fontSize: 15, letterSpacing: '.32em', color: 'rgba(143,184,220,.6)', whiteSpace: 'nowrap' }, intro('wlIn', 1600, 4800, 'ease')) },
          'STATE OF ISRAEL · ' + fmtWlDate.format(new Date(clock())).replace(',', '').toUpperCase())),
      // L6 the docking, in stage coordinates around the wall's globe centre (only on the way out)
      L ? h(React.Fragment, { key: 'dock' },
        h('div', { ref: set('clampA'), style: circle(gc.x, gc.y, 700, { opacity: 0, border: '1.5px solid rgba(200,235,255,.85)', boxShadow: '0 0 0 6px rgba(200,235,255,.12)' }) }),
        h('div', { ref: set('clampB'), style: circle(gc.x, gc.y, 560, { opacity: 0, border: '1.5px solid rgba(200,235,255,.85)', boxShadow: '0 0 0 6px rgba(200,235,255,.12)' }) }),
        h('div', { ref: set('ripple'), style: circle(gc.x, gc.y, 1015, { opacity: 0, border: '1px solid rgba(200,235,255,.5)' }) }),
        h('div', { ref: set('bloom'), style: circle(gc.x, gc.y, 1400, { opacity: 0, background: 'radial-gradient(circle closest-side, rgba(235,248,255,.55) 0, rgba(159,220,255,.25) 22%, rgba(60,130,255,.08) 48%, transparent 72%)' }) })) : null);
  };

  // ---------- small toast (e.g. "שוגר") ----------
  const Toast = ({ title, line }) => h('div', { style: { position: 'absolute', top: 104, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 16, padding: '14px 26px', borderRadius: 999, background: 'rgba(10,20,40,.92)', border: '1px solid rgba(233,184,114,.6)', boxShadow: '0 20px 50px rgba(0,0,0,.5), 0 0 30px rgba(233,184,114,.2)', animation: 'toastIn .7s cubic-bezier(.2,1.3,.4,1) both', direction: EN() ? 'ltr' : 'rtl', fontFamily: 'Heebo', color: '#e6f1ff', whiteSpace: 'nowrap' } },
    h('span', { style: { width: 12, height: 12, borderRadius: '50%', background: '#e9b872', boxShadow: '0 0 14px #e9b872', animation: 'breathe 1s ease-in-out infinite' } }),
    h('span', { style: { fontSize: 22, fontWeight: 700, color: '#e9b872' } }, title), h('span', { style: { fontSize: 20 } }, line));

  // ---------- a picture on the whole wall (the remote's agent: attached, or from the internet after approval) ----------
  // Kept light: the picture once, contained on black, a caption on a plain gradient; no blur or moving layers.
  const ImageMoment = ({ url, caption }) => shell([
    h('div', { key: 'bg', style: { position: 'absolute', inset: 0, background: '#02050c' } }),
    h('img', { key: 'img', src: url, alt: caption || '', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', animation: 'ovIn 1.2s ease both' } }),
    caption ? h('div', { key: 'cap', style: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: '120px 120px 70px', background: 'linear-gradient(0deg, rgba(2,5,12,.92), rgba(2,5,12,0))', fontSize: 52, fontWeight: 700, lineHeight: 1.2, textAlign: 'center', textWrap: 'balance', animation: 'rise .9s ease .4s both' } }, caption) : null
  ]);

  // ---------- a live stream (a launch's webcast) on the whole wall: YouTube, muted, until the remote ends it ----------
  // In the remote's preview a card stands in for the player, so a phone never loads the video.
  const LiveStream = ({ videoId, title, preview }) => {
    const src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1&mute=1&controls=0&rel=0&playsinline=1&modestbranding=1&iv_load_policy=3';
    const tag = h('div', { key: 'tag', style: { position: 'absolute', top: 36, [EN() ? 'left' : 'right']: 40, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px', borderRadius: 999, background: 'rgba(6,12,26,.78)', border: '1px solid rgba(255,120,110,.6)', fontSize: 26, fontWeight: 700, whiteSpace: 'nowrap', maxWidth: 1200, overflow: 'hidden', textOverflow: 'ellipsis' } },
      h('span', { style: { width: 14, height: 14, borderRadius: '50%', background: '#ff5a4f', boxShadow: '0 0 14px #ff5a4f', animation: 'breathe 1.4s ease-in-out infinite' } }), tr('שידור חי', 'LIVE') + (title ? ' · ' + title : ''));
    if (preview) return shell([
      h('div', { key: 'bg', style: { position: 'absolute', inset: 0, background: '#02050c url(https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg) center/cover no-repeat', opacity: .55 } }),
      h('div', { key: 'c', style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, fontWeight: 700 } }, tr('השידור מוצג בצג', 'Streaming on the wall')), tag]);
    return shell([
      h('div', { key: 'bg', style: { position: 'absolute', inset: 0, background: '#000' } }),
      h('iframe', { key: 'v', src, title: title || 'Live', allow: 'autoplay; encrypted-media; picture-in-picture', referrerPolicy: 'strict-origin-when-cross-origin', style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 } }),
      tag]);
  };

  return { Celebration, LaunchMode, NoonShow, EventTakeover, Welcome, Toast, ImageMoment, LiveStream };
};
