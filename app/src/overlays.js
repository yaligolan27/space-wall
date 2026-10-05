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
    Birthday: 'Happy Birthday!', Farewell: 'All the best ahead!', Welcome: 'Welcome to the Directorate!', Congratulations: 'Congratulations!' };
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
        h('div', { style: { fontSize: 30, color: '#b3c2dc', fontWeight: 300, animation: 'rise .9s ease 1.2s both' } }, [p.line, tr('כל המנהלת מברכת', 'Warm wishes from the whole Directorate')].filter(Boolean).join(' · ')))
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
        h('div', { style: { fontSize: 40, fontWeight: 700, letterSpacing: '.02em' } }, tr('מנהלת החלל · מופע הצהריים', 'Space Directorate · Promo video')),
        h('div', { style: { fontFamily: MONO, fontSize: 20, color: '#8b9dbd', letterSpacing: '.2em' } }, '12:00 · DAILY BROADCAST')) : null,
      src ? h('video', { key: 'v', ref: vid, src, preload: 'auto', playsInline: true, onEnded: () => onDone && onDone(), style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000', visibility: playing ? 'visible' : 'hidden', animation: playing ? 'ovIn 1s ease both' : 'none' } }) : null,
      n === 0 && !playing ? h('div', { key: 'fl', style: { position: 'absolute', inset: 0, background: '#fff', animation: 'flash 1.2s ease-out both', pointerEvents: 'none' } }) : null
    ]);
  };

  // ---------- important directorate event, started from the remote or automatically while it runs ----------
  // `until` is when this screen itself ends (the remote can show an event for less, or after, its own end).
  const EventTakeover = ({ event, until }) => shell([
    h('div', { key: 'bg', style: { position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#0b1d42 0%,#040914 70%)' } }),
    h('div', { key: 'c', style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 27, padding: 134, boxSizing: 'border-box' } },
      h('span', { style: { fontSize: 38, fontWeight: 700, color: '#9fdcff', letterSpacing: '.08em', animation: 'rise .8s ease .2s both' } }, tr('עכשיו במנהלת', 'Now at the Directorate')),
      h('span', { style: { fontSize: 108, fontWeight: 800, lineHeight: 1.1, textWrap: 'balance', animation: 'rise .9s ease .4s both' } }, event.title),
      h('span', { style: { fontSize: 44, color: '#cfe0f7', animation: 'rise .9s ease .6s both' } }, event.start + '–' + event.end + (event.place ? ' · ' + event.place : ''))),
    h('span', { key: 'end', style: { position: 'absolute', bottom: 77, [EN() ? 'left' : 'right']: 134, fontSize: 29, color: '#8b9dbd' } }, tr('יורד לבד ב-', 'Until ') + (until ? fmtHM.format(new Date(until)) : event.end))
  ]);

  // ---------- small toast (e.g. "שוגר") ----------
  const Toast = ({ title, line }) => h('div', { style: { position: 'absolute', top: 104, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 16, padding: '14px 26px', borderRadius: 999, background: 'rgba(10,20,40,.92)', border: '1px solid rgba(233,184,114,.6)', boxShadow: '0 20px 50px rgba(0,0,0,.5), 0 0 30px rgba(233,184,114,.2)', animation: 'toastIn .7s cubic-bezier(.2,1.3,.4,1) both', direction: EN() ? 'ltr' : 'rtl', fontFamily: 'Heebo', color: '#e6f1ff', whiteSpace: 'nowrap' } },
    h('span', { style: { width: 12, height: 12, borderRadius: '50%', background: '#e9b872', boxShadow: '0 0 14px #e9b872', animation: 'breathe 1s ease-in-out infinite' } }),
    h('span', { style: { fontSize: 22, fontWeight: 700, color: '#e9b872' } }, title), h('span', { style: { fontSize: 20 } }, line));

  return { Celebration, LaunchMode, NoonShow, EventTakeover, Toast };
};
