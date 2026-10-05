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
        h('div', { style: { fontSize: 30, color: '#b3c2dc', fontWeight: 300, animation: 'rise .9s ease 1.2s both' } }, [p.line, tr('כל המנהלת מברכת', 'Warm wishes from all of us at the Israel Space Program Office')].filter(Boolean).join(' · ')))
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
        h('div', { style: { fontSize: 40, fontWeight: 700, letterSpacing: '.02em' } }, tr('מנהלת החלל · סרטון תדמית', 'Israel Space Program Office · Promo video')),
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
      h('span', { style: { fontSize: 38, fontWeight: 700, color: '#9fdcff', letterSpacing: '.08em', animation: 'rise .8s ease .2s both' } }, tr('עכשיו במנהלת', 'Happening now')),
      h('span', { style: { fontSize: 108, fontWeight: 800, lineHeight: 1.1, textWrap: 'balance', animation: 'rise .9s ease .4s both' } }, event.title),
      h('span', { style: { fontSize: 44, color: '#cfe0f7', animation: 'rise .9s ease .6s both' } }, event.start + '–' + event.end + (event.place ? ' · ' + event.place : ''))),
    h('span', { key: 'end', style: { position: 'absolute', bottom: 77, [EN() ? 'left' : 'right']: 134, fontSize: 29, color: '#8b9dbd' } }, tr('יורד לבד ב-', 'Until ') + (until ? fmtHM.format(new Date(until)) : event.end))
  ]);

  // ---------- welcome screen for a delegation's visit, until "enter" in the remote ----------
  // Light on purpose (the lobby computer is weak): one 2D canvas of stars, everything else CSS transform/opacity.
  // `leaving` (a timestamp) starts the way out: the stars go to warp, the words fly past, and the logo's white disk
  // grows over the whole screen; the wall then reveals itself under it (wall.js: WELCOME_REVEAL_MS) with its own entrance.
  const Warp = ({ leaving, fx }) => {
    const ref = useRef(null), leaveRef = useRef(leaving);
    leaveRef.current = leaving;
    useEffect(() => {
      const c = ref.current, g = c.getContext('2d'), W = c.width = 1920, H = c.height = 1080, cx = W / 2, cy = H * 0.42, F = 900;
      const N = 520, S = Array.from({ length: N }, () => ({ x: (Math.random() * 2 - 1) * 1.6, y: (Math.random() * 2 - 1) * 1.1, z: Math.random(), c: Math.random() < .14 ? '#bfe6ff' : Math.random() < .08 ? '#f5e6c4' : '#ffffff' }));
      let raf, last = performance.now();
      const draw = (now) => {
        const dt = Math.min(50, now - last) / 16.7; last = now;
        const L = leaveRef.current, lt = L ? (Date.now() - L) / 1000 : 0;
        // idle: a slow drift toward the viewer; leaving: an exponential jump to warp
        const v = (L ? 0.004 + 0.05 * Math.min(1, lt * lt / 1.6) : 0.0011) * (fx || L ? 1 : 0);
        g.fillStyle = L ? 'rgba(2,6,16,.55)' : '#020611';
        g.fillRect(0, 0, W, H);
        for (const s of S) {
          const z0 = s.z; s.z -= v * dt;
          if (s.z <= 0.02) { s.x = (Math.random() * 2 - 1) * 1.6; s.y = (Math.random() * 2 - 1) * 1.1; s.z = 1; continue; }
          const px = cx + (s.x / s.z) * F, py = cy + (s.y / s.z) * F;
          if (px < -50 || px > W + 50 || py < -50 || py > H + 50) { s.z = 1; continue; }
          const a = Math.min(1, (1 - s.z) * 1.7 + 0.12), r = (1 - s.z) * 2.2 + 0.3;
          g.globalAlpha = a;
          if (L && v > 0.008) {
            const qx = cx + (s.x / Math.min(1, z0 + v * 3)) * F, qy = cy + (s.y / Math.min(1, z0 + v * 3)) * F;
            g.strokeStyle = s.c; g.lineWidth = r; g.beginPath(); g.moveTo(qx, qy); g.lineTo(px, py); g.stroke();
          } else { g.fillStyle = s.c; g.fillRect(px - r / 2, py - r / 2, r, r); }
        }
        g.globalAlpha = 1;
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
      return () => cancelAnimationFrame(raf);
    }, []);
    return h('canvas', { ref, style: { position: 'absolute', inset: 0, width: '100%', height: '100%' } });
  };
  const WelcomeClock = () => {
    const now = useNow(1000), d = new Date(now);
    const il = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    const utc = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return h('span', null, il + ' ISRAEL', h('span', { style: { color: '#5d6f8f', margin: '0 14px' } }, '|'), utc + ' UTC');
  };
  const WELCOME_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const Welcome = ({ guest, leaving, fx }) => {
    const L = !!leaving, ease = 'cubic-bezier(.55,0,.85,.35)';
    // (an element's entrance animation would hold its transform: on the way out it is dropped for the transition)
    const away = (delay, extra) => (L ? Object.assign({ opacity: 0, transform: 'scale(1.35)', transition: `opacity .7s ease-in ${delay}s, transform 1s ${ease} ${delay}s` }, extra) : {});
    let n = 0;
    const word = (w) => h('span', { key: w + n, style: { display: 'inline-block', whiteSpace: 'nowrap' } }, Array.from(w).map((ch) => h('span', { key: n, style: { display: 'inline-block', animation: `wlLetter 1s cubic-bezier(.2,.9,.3,1) ${(1.5 + (n++) * 0.045).toFixed(3)}s both` } }, ch)));
    const line = (text) => text.split(' ').reduce((a, w, i) => a.concat(i ? [' ', word(w)] : [word(w)]), []);
    const corner = (pos, bw) => h('span', { key: JSON.stringify(pos), style: Object.assign({ position: 'absolute', width: 46, height: 46, borderColor: 'rgba(159,220,255,.5)', borderStyle: 'solid', borderWidth: bw, animation: 'ovIn 1.2s ease 3.4s both' }, pos) });
    const orbit = (w, hgt, tilt, dur, rev, dot, delay) => h('div', { style: { position: 'absolute', left: '50%', top: '50%', width: w, height: w, marginLeft: -w / 2, marginTop: -w / 2, transform: `rotate(${tilt}deg) scaleY(${hgt})`, animation: `ovIn 1.4s ease ${delay}s both` } },
      h('div', { style: { position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(159,220,255,.28)', boxShadow: '0 0 18px rgba(111,214,234,.12)', animation: fx ? `spin ${dur}s linear infinite${rev ? ' reverse' : ''}` : 'none' } },
        h('span', { style: { position: 'absolute', top: -7, left: '50%', marginLeft: -7, width: 14, height: 14, borderRadius: '50%', background: dot, boxShadow: `0 0 18px ${dot}, 0 0 4px #fff` } })));
    return shell([
      h(Warp, { key: 'stars', leaving, fx }),
      h('div', { key: 'neb', style: { position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 900px 520px at 22% 30%, rgba(70,110,220,.16), transparent 70%), radial-gradient(ellipse 800px 500px at 82% 22%, rgba(111,214,234,.10), transparent 70%), radial-gradient(ellipse 1200px 700px at 50% 40%, rgba(20,50,110,.35), transparent 75%)', transition: 'opacity .8s ease', opacity: L ? 0 : 1 } }),
      // the planet's limb at the bottom, with a sunrise on its edge
      h('div', { key: 'planet', style: Object.assign({ position: 'absolute', left: '50%', top: 975, width: 3400, height: 3400, marginLeft: -1700, borderRadius: '50%', background: 'radial-gradient(circle at 50% 0%, #10264f 0%, #071431 18%, #020611 40%)', boxShadow: '0 -2px 0 rgba(170,225,255,.85), 0 -10px 40px rgba(111,214,234,.55), 0 -40px 140px rgba(60,130,255,.35), inset 0 30px 60px rgba(111,214,234,.18)', animation: 'wlRise 2.6s cubic-bezier(.2,.8,.2,1) .2s both' }, L ? { animation: 'none', transform: 'translateY(420px)', transition: `transform 1.3s ${ease}` } : {}) }),
      h('div', { key: 'sun', style: Object.assign({ position: 'absolute', left: '50%', top: 905, width: 900, height: 150, marginLeft: -450, borderRadius: '50%', background: 'radial-gradient(ellipse at 50% 50%, rgba(255,250,235,.95) 0%, rgba(255,226,170,.55) 10%, rgba(140,200,255,.22) 38%, transparent 70%)', animation: 'wlRise 2.6s cubic-bezier(.2,.8,.2,1) .2s both, wlSun 7s ease-in-out 3s infinite' }, L ? { animation: 'none', opacity: 0, transition: 'opacity .6s ease' } : {}) }),
      // HUD frame
      h('div', { key: 'hud', style: Object.assign({ position: 'absolute', inset: 40, pointerEvents: 'none' }, away(0)) },
        corner({ top: 0, left: 0 }, '2px 0 0 2px'), corner({ top: 0, right: 0 }, '2px 2px 0 0'), corner({ bottom: 0, left: 0 }, '0 0 2px 2px'), corner({ bottom: 0, right: 0 }, '0 2px 2px 0'),
        h('div', { style: { position: 'absolute', top: 18, left: 70, fontFamily: MONO, fontSize: 21, letterSpacing: '.22em', color: '#8fb8dc', animation: 'ovIn 1.2s ease 3.6s both' } }, WELCOME_DATE.format(new Date(clock())).toUpperCase()),
        h('div', { style: { position: 'absolute', top: 18, right: 70, fontFamily: MONO, fontSize: 21, letterSpacing: '.18em', color: '#8fb8dc', animation: 'ovIn 1.2s ease 3.6s both' } }, h(WelcomeClock)),
        h('div', { style: { position: 'absolute', bottom: 18, left: 70, display: 'flex', alignItems: 'center', gap: 12, fontFamily: MONO, fontSize: 17, letterSpacing: '.24em', color: '#6f8fb4', animation: 'ovIn 1.2s ease 3.8s both' } },
          h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: '#d4f25c', boxShadow: '0 0 12px #d4f25c', animation: 'breathe 1.6s ease-in-out infinite' } }), 'ALL SYSTEMS NOMINAL'),
        h('div', { style: { position: 'absolute', bottom: 18, right: 70, fontFamily: MONO, fontSize: 17, letterSpacing: '.24em', color: '#6f8fb4', animation: 'ovIn 1.2s ease 3.8s both' } }, 'STATE OF ISRAEL')),
      // the logo in its orbits; on the way out its white disk fills the screen
      h('div', { key: 'logo', style: { position: 'absolute', left: '50%', top: 275, width: 0, height: 0 } },
        h('div', { style: Object.assign({ position: 'absolute', left: 0, top: 0 }, away(0, { transform: 'scale(.6)' })) },
          orbit(620, 0.3, -16, 22, false, '#d4f25c', 1.1), orbit(540, 0.34, 20, 30, true, '#6fd6ea', 1.3),
          h('div', { style: { position: 'absolute', left: -150, top: -150, width: 300, height: 300, borderRadius: '50%', border: '2px solid rgba(111,214,234,.6)', animation: fx ? 'ping 3.2s ease-out 2s infinite' : 'none', opacity: 0 } }),
          h('div', { style: { position: 'absolute', left: -150, top: -150, width: 300, height: 300, borderRadius: '50%', border: '2px solid rgba(212,242,92,.45)', animation: fx ? 'ping 3.2s ease-out 3.6s infinite' : 'none', opacity: 0 } }),
          h('div', { style: { position: 'absolute', left: -260, top: -260, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(111,214,234,.35) 0%, rgba(60,120,220,.12) 40%, transparent 70%)', animation: 'popIn 1.6s ease .5s both' } })),
        h('div', { style: Object.assign({ position: 'absolute', left: -115, top: -115, width: 230, height: 230, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #e6f0fb 55%, #b5cce8 100%)', boxShadow: '0 0 0 2px rgba(200,230,255,.6), 0 0 60px rgba(111,214,234,.65), 0 0 140px rgba(60,130,255,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'wlLogo 1.6s cubic-bezier(.2,1.3,.4,1) .6s both', willChange: 'transform' },
          L ? { animation: 'none', transform: 'scale(13)', background: 'radial-gradient(circle, #ffffff 0%, #eaf6ff 60%, #cfe6ff 100%)', transition: `transform 1.6s cubic-bezier(.8,0,.9,.3) .35s, background .8s ease` } : {}) },
          h('img', { src: '/assets/logo-mark.png', alt: '', style: { width: '80%', height: '80%', objectFit: 'contain', opacity: L ? 0 : 1, transition: 'opacity .35s ease' } }))),
      // the words
      h('div', { key: 'words', dir: 'ltr', style: Object.assign({ position: 'absolute', left: 0, right: 0, top: 470, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }, away(0.05)) },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 28, fontFamily: MONO, fontSize: 34, fontWeight: 500, letterSpacing: '.62em', color: '#9fdcff', marginRight: '-.62em', animation: 'rise 1s ease 1.1s both' } },
          h('span', { style: { width: 120, height: 2, background: 'linear-gradient(90deg, transparent, #9fdcff)', animation: 'grow 1s ease 1.3s both', transformOrigin: 'right' } }),
          'WELCOME TO',
          h('span', { style: { width: 120, height: 2, marginLeft: '-.62em', background: 'linear-gradient(270deg, transparent, #9fdcff)', animation: 'grow 1s ease 1.3s both', transformOrigin: 'left' } })),
        h('div', { style: { position: 'relative', marginTop: 22, fontFamily: LEX, fontSize: 118, fontWeight: 600, lineHeight: 1.06, letterSpacing: '.01em', color: '#f4f9ff', textShadow: '0 0 40px rgba(111,214,234,.45), 0 4px 30px rgba(0,0,0,.6)' } },
          h('div', null, line('THE ISRAEL SPACE')), h('div', null, line('PROGRAM OFFICE')),
          fx ? h('div', { 'aria-hidden': true, style: { position: 'absolute', inset: 0, color: 'transparent', textShadow: 'none', backgroundImage: 'linear-gradient(100deg, transparent 40%, rgba(255,255,255,.95) 50%, transparent 60%)', backgroundSize: '250% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', animation: 'wlShine 7s ease-in-out 4.5s infinite', pointerEvents: 'none' } },
            h('div', null, 'THE ISRAEL SPACE'), h('div', null, 'PROGRAM OFFICE')) : null),
        h('div', { style: { marginTop: 26, width: 760, height: 2, background: 'linear-gradient(90deg, transparent, rgba(212,242,92,.9), transparent)', animation: 'grow 1.2s ease 3s both' } }),
        guest ? h('div', { dir: 'auto', style: { marginTop: 24, fontFamily: LEX, fontSize: 44, fontWeight: 400, letterSpacing: '.06em', color: '#d4f25c', textShadow: '0 0 24px rgba(212,242,92,.35)', animation: 'rise 1s ease 3.2s both' } }, guest) : null,
        EN() ? null : h('div', { dir: 'rtl', style: { marginTop: guest ? 14 : 24, fontFamily: 'Heebo', fontSize: 34, fontWeight: 300, color: '#b3c8e6', letterSpacing: '.04em', animation: 'rise 1s ease 3.4s both' } }, 'ברוכים הבאים למנהלת החלל'))
    ], Object.assign({ direction: 'ltr', background: '#020611' }, L ? { animation: 'enFade 1.1s ease 2s both' } : {}));
  };

  // ---------- small toast (e.g. "שוגר") ----------
  const Toast = ({ title, line }) => h('div', { style: { position: 'absolute', top: 104, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 16, padding: '14px 26px', borderRadius: 999, background: 'rgba(10,20,40,.92)', border: '1px solid rgba(233,184,114,.6)', boxShadow: '0 20px 50px rgba(0,0,0,.5), 0 0 30px rgba(233,184,114,.2)', animation: 'toastIn .7s cubic-bezier(.2,1.3,.4,1) both', direction: EN() ? 'ltr' : 'rtl', fontFamily: 'Heebo', color: '#e6f1ff', whiteSpace: 'nowrap' } },
    h('span', { style: { width: 12, height: 12, borderRadius: '50%', background: '#e9b872', boxShadow: '0 0 14px #e9b872', animation: 'breathe 1s ease-in-out infinite' } }),
    h('span', { style: { fontSize: 22, fontWeight: 700, color: '#e9b872' } }, title), h('span', { style: { fontSize: 20 } }, line));

  return { Celebration, LaunchMode, NoonShow, EventTakeover, Welcome, Toast };
};
