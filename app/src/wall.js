// Space Wall v4 — the lobby display. A direct port of the Claude Design "Space Wall v4" template:
// the same 1920×1080 stage, layout, styles and motion, rendered with React (vendored UMD, no build).
// Content comes from /api/feed (weekly newsletter + database) with the bundled sample as fallback.
// Full-screen moments (launch mode, personal celebration, 12:00 show) live in overlays.js,
// the 3D emblem in emblem-v2.js.
(() => {
  const h = React.createElement;
  const { useState, useEffect } = React;

  // ---- config (URL query) ----------------------------------------------------------------------
  const q = new URLSearchParams(location.search);
  const bool = (k, d) => q.has(k) ? !/^(0|false|no|off)$/i.test(q.get(k)) : d;
  const num = (k, d) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const CFG = {
    feed: q.get('feed') || '/api/feed',
    key: q.get('key') || '',
    refresh: Math.max(10, num('refresh', 60)),
    demo: q.get('demo') || 'off',                 // off | launch | greeting | noon
    noonShow: bool('noon', true),
    showQr: bool('qr', true),
    featureSeconds: Math.min(30, Math.max(6, num('feature', 12))),
    listSeconds: Math.min(10, Math.max(2, num('list', 4))),
    ambientFx: bool('fx', true),
    globeSpeed: Math.min(240, Math.max(20, num('globe', 90))),
    globeStyle: q.get('globeStyle') === 'real' ? 'real' : 'holo',
    cameraSway: bool('sway', true),
    staleAfterMin: num('stale', 180),
  };

  // ---- QR, generated locally (no third-party image service) ------------------------------------
  const qrCache = {};
  function qrData(url) {
    if (!url) return '';
    if (qrCache[url]) return qrCache[url];
    try {
      if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
      const n = qr.getModuleCount(), size = 120, cell = size / n;
      const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
      g.fillStyle = '#0b1430'; g.fillRect(0, 0, size, size); g.fillStyle = '#e6f1ff';
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) {
        const x = Math.round(k * cell), y = Math.round(r * cell);
        g.fillRect(x, y, Math.round((k + 1) * cell) - x, Math.round((r + 1) * cell) - y);
      }
      return (qrCache[url] = c.toDataURL());
    } catch (e) { console.warn('QR failed', e); return ''; }
  }

  const fmtIL = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmtUTC = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDate = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' });
  const fmtWhen = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  // Shared panel look (the glass cards).
  const PANEL = { position: 'relative', overflow: 'hidden', borderRadius: 26, background: 'linear-gradient(180deg,rgba(40,62,104,.42) 0%,rgba(12,22,44,.6) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07),0 24px 60px rgba(0,0,0,.35)', transition: 'border-color 1s ease' };
  const PILL = { borderRadius: 999, background: 'rgba(14,26,50,.7)', border: '1px solid rgba(150,190,240,.14)' };
  const MUTED = '#8b9dbd';

  class Wall extends React.Component {
    constructor(p) { super(p); this.state = { scale: 1, now: Date.now(), data: null, ov: null, toast: null }; }

    // ---- lifecycle ----------------------------------------------------------------------------
    componentDidMount() {
      this.t0 = Date.now();
      this.fit = () => { const s = Math.min(innerWidth / 1920, innerHeight / 1080); if (s > 0) this.setState({ scale: s }); };
      this.fit(); addEventListener('resize', this.fit); this.fitRetry = setTimeout(this.fit, 800);
      this.tick = setInterval(() => { this.setState({ now: Date.now() }); this.schedule(); }, 1000);
      this.onKey = (e) => { const k = e.key.toLowerCase(); if (k === 'l') this.demo('launch'); else if (k === 'g') this.demo('greeting'); else if (k === 'n') this.demo('noon'); else if (k === 'escape') this.setState({ ov: null }); };
      addEventListener('keydown', this.onKey);
      this.load(); this.poll = setInterval(() => this.load(), CFG.refresh * 1000);
    }
    componentWillUnmount() { removeEventListener('keydown', this.onKey); clearInterval(this.tick); clearInterval(this.poll); clearTimeout(this.fitRetry); removeEventListener('resize', this.fit); }

    async fetchText(url) {
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(url + sep + 't=' + Date.now() + (CFG.key ? '&key=' + encodeURIComponent(CFG.key) : ''), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }
    async load() {
      try {
        let body;
        try { body = await this.fetchText(CFG.feed); }
        catch (e) { if (this.state.data) throw e; console.warn('live feed unavailable, using bundled sample', e); body = await this.fetchText('/data/feed.json'); }
        if (body === this._lastBody) return;
        const data = JSON.parse(body);
        if (!Array.isArray(data.news) || !Array.isArray(data.people)) throw new Error('feed is not in the v4 shape');
        this._lastBody = body;
        this.resetCaches();
        this.setState({ data }, () => { if (CFG.demo !== 'off' && !this._demoDone) { this._demoDone = true; this.demo(CFG.demo); } });
      } catch (e) { console.warn('feed load failed', e); }
    }
    resetCaches() { this._feat = this._list = this._tick = this._spot = this._trk = this._typ = null; this._featK = this._listS = this._spotI = undefined; }

    // ---- moments --------------------------------------------------------------------------------
    get D() { return this.state.data; }
    ilParts(now) { const o = {}; fmtParts.formatToParts(new Date(now)).forEach((p) => (o[p.type] = p.value)); return { day: o.year + o.month + o.day, h: +o.hour, m: +o.minute, s: +o.second }; }
    celebratable() { const D = this.D; return D ? D.people.filter((p) => p.celebrate !== false) : []; }
    demo(kind) {
      const D = this.D, now = Date.now(); if (!D) return;
      if (kind === 'launch' && D.launches.length) this.setState({ ov: { kind: 'launch', id: now, launch: Object.assign({}, D.launches[Math.min(2, D.launches.length - 1)], { at: new Date(now + 15000).toISOString() }), until: now + 27000 } });
      if (kind === 'greeting') { const P = this.celebratable(); if (P.length) this.setState({ ov: { kind: 'celebrate', id: now, person: P[(this._demoP = ((this._demoP ?? -1) + 1)) % P.length], until: now + 14000 } }); }
      if (kind === 'noon') this.setState({ ov: { kind: 'noon', id: now, until: now + 15 * 60e3 } });
    }
    schedule() {
      const D = this.D, now = Date.now(); if (!D) return;
      let ov = this.state.ov;
      if (ov && now > ov.until) { if (ov.kind === 'launch') this.setState({ toast: { title: 'שוגר', line: ov.launch.mission + ' · ' + ov.launch.vehicle, until: now + 45000 } }); ov = null; this.setState({ ov: null }); }
      if (this.state.toast && now > this.state.toast.until) this.setState({ toast: null });
      if (ov && ov.kind === 'noon') return;
      const T = this.ilParts(now);
      if (CFG.noonShow && T.h === 12 && T.m === 0 && T.s < 5 && this._noonDay !== T.day) { this._noonDay = T.day; this.setState({ ov: { kind: 'noon', id: now, until: now + 15 * 60e3 } }); return; }
      const L = D.launches.find((l) => { const d = Date.parse(l.at) - now; return d > -12000 && d <= 600e3; });
      if (L) { if (!ov || ov.kind !== 'launch' || ov.launch.at !== L.at) this.setState({ ov: { kind: 'launch', id: L.at, launch: L, until: Date.parse(L.at) + 12000 } }); return; }
      const hourKey = T.day + T.h;
      if (!ov && T.m === 30 && T.s < 5 && this._celebHour !== hourKey) { this._celebHour = hourKey; const P = this.celebratable(); if (P.length) this.setState({ ov: { kind: 'celebrate', id: now, person: P[T.h % P.length], until: now + 14000 } }); }
    }
    overlay() {
      const ov = this.state.ov, toast = this.state.toast;
      const k = (ov ? ov.kind + ov.id : '') + '|' + (toast ? toast.until : '');
      if (this._ovK === k) return this._ov; this._ovK = k;
      if (!window.makeWallOverlays) return (this._ov = null);
      const O = this._O || (this._O = window.makeWallOverlays(React));
      let el = null;
      if (ov && ov.kind === 'launch') el = h(O.LaunchMode, { key: k, launch: ov.launch });
      if (ov && ov.kind === 'celebrate') el = h(O.Celebration, { key: k, person: ov.person });
      if (ov && ov.kind === 'noon') el = h(O.NoonShow, { key: k, src: (this.D && this.D.promoVideo) || '/assets/promo.mp4', logo: '/assets/logo-mark.png', onDone: () => this.setState({ ov: null }) });
      return (this._ov = h(React.Fragment, null, el, toast && !ov ? h(O.Toast, { key: 't', title: toast.title, line: toast.line }) : null));
    }

    // ---- decorative layers (verbatim from the design) --------------------------------------------
    ambient() {
      if (this._amb) return this._amb;
      const fx = CFG.ambientFx, s = [];
      const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
      for (let i = 0; i < 260; i++) { const x = (i * 97.7) % 512, y = (i * 61.3 + (i * i) % 37) % 512, r = 0.4 + ((i * 13) % 7) / 10, a = 0.1 + ((i * 7) % 5) * 0.05; g.fillStyle = `rgba(223,231,245,${a})`; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
      s.push(h('div', { key: 'far', style: { position: 'absolute', inset: 0, backgroundImage: `url(${c.toDataURL()})`, backgroundSize: '512px 512px', opacity: .75, animation: fx ? 'parallaxA 240s linear infinite' : 'none' } }));
      s.push(h('div', { key: 'neb1', style: { position: 'absolute', width: 900, height: 600, left: -200, top: 380, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(60,120,220,.12), rgba(60,120,220,0))', animation: fx ? 'drift 38s ease-in-out infinite' : 'none' } }));
      s.push(h('div', { key: 'neb2', style: { position: 'absolute', width: 800, height: 520, right: -160, top: -120, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(111,214,234,.08), rgba(111,214,234,0))', animation: fx ? 'drift 46s ease-in-out -12s infinite reverse' : 'none' } }));
      const near = [];
      for (let i = 0; i < 80; i++) { const size = i % 7 === 0 ? 2.5 : 1.5; near.push(h('span', { key: i, style: { position: 'absolute', left: ((i * 137.5) % 100) + '%', top: ((i * 71.3) % 100) + '%', width: size, height: size, borderRadius: '50%', background: '#e6f1ff', opacity: .3, boxShadow: i % 7 === 0 ? '0 0 6px rgba(230,241,255,.6)' : 'none', animation: `twinkle ${4 + (i % 5)}s ease-in-out ${(i % 9) * .7}s infinite` } })); }
      s.push(h('div', { key: 'near', style: { position: 'absolute', inset: -80, animation: fx ? 'parallaxB 60s ease-in-out infinite alternate' : 'none' } }, near));
      if (fx) {
        const n = document.createElement('canvas'); n.width = n.height = 256; const ng = n.getContext('2d'), id = ng.createImageData(256, 256);
        for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } ng.putImageData(id, 0, 0);
        s.push(h('div', { key: 'flare', style: { position: 'absolute', left: 560, top: 300, width: 800, height: 3, borderRadius: 3, background: 'linear-gradient(90deg, rgba(111,190,255,0), rgba(160,215,255,.55) 45%, rgba(230,245,255,.8) 50%, rgba(160,215,255,.55) 55%, rgba(111,190,255,0))', filter: 'blur(1.5px)', mixBlendMode: 'screen', animation: 'flare 11s ease-in-out infinite' } }));
        s.push(h('div', { key: 'vig', style: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.45) 100%)' } }));
        s.push(h('div', { key: 'grain', style: { position: 'absolute', inset: '-10%', backgroundImage: `url(${n.toDataURL()})`, opacity: .045, mixBlendMode: 'overlay', animation: 'grain 1.2s steps(5) infinite' } }));
        s.push(h('div', { key: 'scan', style: { position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: 'linear-gradient(90deg, rgba(111,214,234,0), rgba(111,214,234,.28) 30%, rgba(212,242,92,.22) 50%, rgba(111,214,234,.28) 70%, rgba(111,214,234,0))', boxShadow: '0 0 18px rgba(111,214,234,.25)', animation: 'scan 22s linear 4s infinite', opacity: 0 } }));
      }
      return (this._amb = h('div', { style: { position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' } }, s));
    }
    sheen(k, delay) {
      const key = '_sh' + k; if (this[key]) return this[key];
      const fx = CFG.ambientFx, c = 'rgba(159,220,255,.55)';
      const corner = (pos, bw) => h('span', { key: JSON.stringify(pos), style: Object.assign({ position: 'absolute', width: 18, height: 18, borderColor: c, borderStyle: 'solid', borderWidth: bw, pointerEvents: 'none', zIndex: 2 }, pos) });
      return (this[key] = h(React.Fragment, null,
        fx ? h('div', { style: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '45%', pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(170,215,255,.07) 50%, rgba(255,255,255,0))', animation: `sheen 14s ease-in-out ${delay}s infinite`, zIndex: 0 } }) : null,
        h('div', { style: { position: 'absolute', top: 0, left: '12%', right: '12%', height: 1, background: 'linear-gradient(90deg, rgba(159,220,255,0), rgba(200,235,255,.7) 50%, rgba(159,220,255,0))', boxShadow: '0 0 14px rgba(159,220,255,.5)', pointerEvents: 'none', animation: fx ? `breathe 6s ease-in-out ${delay}s infinite` : 'none' } }),
        h('div', { style: { position: 'absolute', inset: 0, borderRadius: 26, background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(120,180,255,.10), rgba(120,180,255,0))', pointerEvents: 'none' } }),
        corner({ top: 10, right: 10, borderRadius: '0 8px 0 0' }, '1.5px 1.5px 0 0'), corner({ top: 10, left: 10, borderRadius: '8px 0 0 0' }, '1.5px 0 0 1.5px'),
        corner({ bottom: 10, right: 10, borderRadius: '0 0 8px 0' }, '0 1.5px 1.5px 0'), corner({ bottom: 10, left: 10, borderRadius: '0 0 0 8px' }, '0 0 1.5px 1.5px')));
    }
    emblem() {
      if (this._emb) return this._emb;
      return (this._emb = h('div', { style: { position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        h('div', { style: { position: 'absolute', width: 980, height: 980, left: '50%', top: '47%', marginLeft: -490, marginTop: -490, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,160,240,.2) 0%, rgba(70,120,210,.08) 32%, rgba(60,90,160,0) 66%)', animation: 'breathe 9s ease-in-out infinite' } }),
        h('space-emblem-v2', { key: CFG.globeStyle, speed: CFG.globeSpeed, globe: CFG.globeStyle, sway: CFG.cameraSway ? 'on' : 'off', style: { width: '100%', height: '100%', maxWidth: 860, position: 'relative', zIndex: 2, filter: 'drop-shadow(0 30px 40px rgba(0,0,0,.55))' } })));
    }

    // ---- content blocks ---------------------------------------------------------------------------
    featured(D, idx, sec) {
      const k = idx + ':' + sec;
      if (this._feat && this._featK === k) return this._feat;
      this._featK = k;
      const n = D.news[D.featured[idx]] || D.news[0], col = D.catColor[n.cat] || '#9fdcff', total = D.featured.length;
      const img = n.image || D.catImage[n.cat] || Object.values(D.catImage)[0];
      const chip = (t, c, fill) => h('span', { style: { padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500, color: fill ? '#0a1224' : c, background: fill ? c : 'rgba(6,12,26,.6)', border: `1px solid ${c}` } }, t);
      return (this._feat = h('article', { key: idx, style: { position: 'relative', zIndex: 1, borderRadius: 22, overflow: 'hidden', background: 'rgba(8,16,34,.55)', border: '1px solid rgba(150,190,240,.16)', flex: 'none', animation: 'rise .8s ease both' } },
        h('div', { style: { height: 150, position: 'relative', overflow: 'hidden' } },
          h('div', { style: { position: 'absolute', inset: 0, backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', animation: `zoomBg ${sec}s linear both` } }),
          h('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,12,26,.15) 0%, rgba(6,12,26,.35) 55%, rgba(8,16,34,.98) 100%)' } }),
          h('div', { style: { position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 } }, chip(n.cat, col), n.il ? chip('ישראל', '#d4f25c', true) : null),
          h('span', { dir: 'ltr', style: { position: 'absolute', top: 14, left: 14, fontFamily: "'Lexend',sans-serif", fontSize: 13, color: '#e6f1ff', letterSpacing: '.08em' } }, String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0'))),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 18px 16px', marginTop: -26, position: 'relative' } },
          h('span', { style: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: MUTED } }, n.date + ' · ' + n.src),
          h('h3', { style: { margin: 0, fontSize: 25, fontWeight: 700, lineHeight: 1.22, textWrap: 'pretty' } }, n.title),
          h('p', { style: { margin: 0, fontSize: 16, color: '#b3c2dc', fontWeight: 300, lineHeight: 1.4, textWrap: 'pretty' } }, n.dek),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 } },
            h('div', { style: { flex: 1, height: 3, borderRadius: 3, background: 'rgba(150,190,240,.14)', overflow: 'hidden' } }, h('div', { style: { height: '100%', background: 'linear-gradient(270deg,#d4f25c,#6fd6ea)', transformOrigin: 'right', animation: `grow ${sec}s linear both` } })),
            CFG.showQr && n.url ? h('img', { src: qrData(n.url), alt: 'QR', style: { width: 50, height: 50, borderRadius: 8, background: '#0b1430', padding: 3, border: '1px solid rgba(230,241,255,.22)' } }) : null))));
    }
    newsList(D) {
      const sec = CFG.listSeconds;
      if (this._list && this._listS === sec) return this._list;
      this._listS = sec;
      const row = (n, i) => h('div', { key: i, style: { display: 'flex', flexDirection: 'column', gap: 5, padding: '12px 4px', borderBottom: '1px solid rgba(150,190,240,.1)' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } },
          h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: D.catColor[n.cat], boxShadow: `0 0 8px ${D.catColor[n.cat]}` } }),
          h('span', { style: { color: D.catColor[n.cat], fontWeight: 500 } }, n.cat),
          h('span', { style: { fontFamily: "'IBM Plex Mono',monospace", color: '#6f82a6' } }, n.date + ' · ' + n.src)),
        h('div', { style: { fontSize: 17, fontWeight: 500, lineHeight: 1.3, textWrap: 'pretty' } }, n.title));
      return (this._list = h('div', { style: { flex: 1, minHeight: 0, position: 'relative', zIndex: 1, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg,transparent 0,#000 8%,#000 88%,transparent 100%)', maskImage: 'linear-gradient(180deg,transparent 0,#000 8%,#000 88%,transparent 100%)' } },
        h('div', { style: { animation: `scrollY ${Math.max(1, D.news.length) * sec}s linear infinite` } }, [...D.news, ...D.news].map(row))));
    }
    spotlight(D, idx) {
      if (this._spot && this._spotI === idx) return this._spot;
      this._spotI = idx; const p = D.people[idx];
      if (!p) return (this._spot = null);
      return (this._spot = h('div', { key: idx, style: { flex: 1, minHeight: 120, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 18, padding: '10px 16px', borderRadius: 22, background: `radial-gradient(ellipse at 85% 50%, ${p.color}22, rgba(8,16,34,.4) 70%)`, border: '1px solid rgba(150,190,240,.14)', animation: 'rise .8s ease both' } },
        h('div', { style: { position: 'relative', width: 100, height: 100, flex: 'none' } },
          h('div', { style: { position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(from 0deg, ${p.color}, rgba(111,214,234,.1) 40%, ${p.color}00 60%, ${p.color})`, animation: 'spin 6s linear infinite' } }),
          h('div', { style: { position: 'absolute', inset: -8, borderRadius: '50%', border: `1px solid ${p.color}`, animation: 'ping 2.8s ease-out infinite' } }),
          h('img', { src: window.wallAvatar(240, p.photo, p.name), alt: p.name, style: { position: 'absolute', inset: 4, width: 92, height: 92, borderRadius: '50%', objectFit: 'cover', border: '3px solid #0a1428' } })),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 } },
          h('span', { style: { alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 999, fontSize: 14, fontWeight: 700, color: '#0a1224', background: p.color } }, p.type),
          h('span', { style: { fontSize: 26, fontWeight: 700, lineHeight: 1.1 } }, p.name),
          h('span', { style: { fontSize: 15, color: '#b3c2dc', lineHeight: 1.35, textWrap: 'pretty' } }, p.line),
          h('span', { style: { fontFamily: "'Lexend',sans-serif", fontSize: 14, color: '#9fdcff' } }, p.date))));
    }
    ticker(D) {
      if (this._tick) return this._tick;
      const item = (e, i) => { const opp = e.kind === 'הזדמנות', c = opp ? '#d4f25c' : '#6fd6ea'; return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px', whiteSpace: 'nowrap', fontSize: 16 } },
        h('span', { style: { padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, color: c, border: `1px solid ${c}` } }, e.kind),
        h('span', { style: { fontFamily: "'Lexend',sans-serif", color: '#9fdcff', fontSize: 14 } }, e.date),
        h('span', null, e.name), h('span', { style: { color: 'rgba(150,190,240,.3)', marginRight: 14 } }, '◆')); };
      return (this._tick = h('div', { style: { flex: 1, minWidth: 0, overflow: 'hidden', height: '100%', display: 'flex', alignItems: 'center' } },
        h('div', { style: { display: 'flex', width: 'max-content', animation: `scrollX ${Math.max(1, D.ticker.length) * 8}s linear infinite` } }, [...D.ticker, ...D.ticker].map(item))));
    }
    launchVals(L, now) {
      let nextFound = false; const p = (n) => String(n).padStart(2, '0');
      return L.map((l) => {
        const at = Date.parse(l.at), d = at - now, gone = d <= 0;
        const when = fmtWhen.format(new Date(at)).replace(',', ' ·');
        const isNext = !gone && !nextFound; if (isNext) nextFound = true;
        const a = Math.abs(d), dd = Math.floor(a / 86400e3), hh = Math.floor(a / 3600e3) % 24, mm = Math.floor(a / 60e3) % 60, ss = Math.floor(a / 1e3) % 60;
        const segs = gone ? [{ v: 'T+', u: '' }, { v: p(Math.min(99, Math.floor(a / 3600e3))), u: 'שע׳' }, { v: p(mm), u: 'דק׳' }] : [{ v: p(dd), u: 'ימים' }, { v: p(hh), u: 'שע׳' }, { v: p(mm), u: 'דק׳' }, { v: p(ss), u: 'שנ׳' }];
        const status = gone ? 'שוגר' : l.status, statusColor = gone ? '#6f82a6' : l.status === 'אושר' ? '#8fe0b8' : '#e9b872';
        return Object.assign({}, l, { when, segs, status, statusColor, numColor: gone ? '#6f82a6' : isNext ? '#d4f25c' : '#e6f1ff', border: isNext ? 'rgba(212,242,92,.55)' : 'rgba(150,190,240,.14)', shadow: isNext ? '0 0 24px rgba(212,242,92,.16)' : 'none' });
      });
    }
    updatedAgo(D) {
      const t = Date.parse(D.generatedAt); if (!t) return { text: '—', stale: true };
      const min = Math.max(0, Math.round((this.state.now - t) / 6e4));
      const text = min < 1 ? 'עכשיו' : min < 60 ? `לפני ${min} דק׳` : min < 1440 ? `לפני ${Math.floor(min / 60)} שע׳` : `לפני ${Math.floor(min / 1440)} ימים`;
      return { text, stale: min > CFG.staleAfterMin };
    }

    // ---- the template -----------------------------------------------------------------------------
    render() {
      const D = this.D, now = this.state.now, t = now - (this.t0 || now), nd = new Date(now);
      const stage = (children) => h('div', { style: { width: '100vw', height: '100vh', background: '#040914', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontFamily: 'Heebo,system-ui,sans-serif', color: '#e6f1ff' } },
        h('div', { dir: 'rtl', style: { width: 1920, height: 1080, flex: 'none', position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse 1100px 760px at 50% 50%, #0c1d3d 0%, #07122a 45%, #040914 100%)', transform: `scale(${this.state.scale})`, transformOrigin: 'center center', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased', display: 'grid', gridTemplateRows: '88px minmax(0,1fr) 50px 118px' } }, children));
      if (!D) return stage([this.ambient(), h('div', { key: 'e', style: { gridRow: '1 / -1', display: 'flex' } }, this.emblem())]);

      const fsec = CFG.featureSeconds, fIdx = D.featured.length ? Math.floor(t / (fsec * 1000)) % D.featured.length : 0;
      const pIdx = D.people.length ? Math.floor(t / 7000) % D.people.length : 0, focusIdx = Math.floor(t / 9000) % 4;
      const hi = (i) => (focusIdx === i ? 'rgba(212,242,92,.45)' : 'rgba(150,190,240,.16)');
      const cur = D.people[pIdx];
      const ago = this.updatedAgo(D);
      const dot = h('span', { style: { width: 9, height: 9, borderRadius: '50%', background: ago.stale ? '#e9b872' : '#8fe0b8', boxShadow: `0 0 10px ${ago.stale ? '#e9b872' : '#8fe0b8'}`, animation: 'breathe 2.4s ease-in-out infinite', display: 'inline-block' } });
      const timeBox = (big, small, extra, smallStyle) => h('div', { style: Object.assign({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, borderRadius: 22, background: 'rgba(14,26,50,.7)', border: '1px solid rgba(150,190,240,.14)' }, extra.box) },
        h('span', { style: Object.assign({ fontSize: 26, letterSpacing: '.03em' }, extra.big) }, big), h('span', { style: Object.assign({ fontSize: 12, color: MUTED }, smallStyle) }, small));

      const header = h('header', { key: 'hdr', style: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0 36px', position: 'relative', zIndex: 2 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
          h('div', { style: { width: 52, height: 52, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#ffffff 0%,#dfeaf7 60%,#a9c3e2 100%)', boxShadow: '0 0 0 1px rgba(160,200,255,.35),0 0 24px rgba(111,214,234,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } },
            h('img', { src: '/assets/logo-mark.png', alt: '', style: { width: 44, height: 44, objectFit: 'contain' } })),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } }, h('div', { style: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em' } }, 'צג חלל · מנהלת החלל'))),
        h('div'),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, fontFamily: "'Lexend',sans-serif" } },
          h('div', { style: Object.assign({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', fontFamily: 'Heebo', fontSize: 14, color: MUTED }, PILL) }, dot, h('span', null, 'עודכן ' + ago.text)),
          timeBox(fmtIL.format(nd), fmtDate.format(nd), { box: { padding: '6px 20px' }, big: { fontWeight: 400 } }, { fontFamily: 'Heebo' }),
          timeBox(fmtUTC.format(nd), 'UTC', { box: { padding: '6px 18px' }, big: { fontWeight: 300, color: '#9fdcff' } }, { letterSpacing: '.12em' })));

      const directorate = D.directorate.map((d, i) => h('div', { key: i, style: { display: 'grid', gridTemplateColumns: '62px minmax(0,1fr) auto', alignItems: 'center', gap: 14, padding: '6px 12px', borderRadius: 18, background: i === 0 ? 'rgba(212,242,92,.06)' : 'rgba(8,16,34,.35)', border: `1px solid ${i === 0 ? 'rgba(212,242,92,.3)' : 'rgba(150,190,240,.1)'}` } },
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 58, borderRadius: 14, background: 'rgba(8,16,34,.7)', border: '1px solid rgba(150,190,240,.14)' } },
          h('span', { style: { fontFamily: "'Lexend',sans-serif", fontSize: 24, fontWeight: 500, lineHeight: 1 } }, d.day), h('span', { style: { fontSize: 12, color: MUTED } }, d.dow + ' · ' + d.mon)),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } }, h('span', { style: { fontSize: 17, fontWeight: 500, lineHeight: 1.25, textWrap: 'pretty' } }, d.name), h('span', { style: { fontSize: 13, color: MUTED } }, d.place)),
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 } }, h('span', { style: { fontFamily: "'Lexend',sans-serif", fontSize: 15, color: '#9fdcff' } }, d.time), h('span', { style: { fontSize: 12, fontWeight: 500, color: '#d4f25c' } }, i === 0 ? 'הבא' : ''))));

      const peopleGrid = D.people.map((p, i) => { const on = p === cur; return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 14, background: on ? 'rgba(111,214,234,.1)' : 'rgba(8,16,34,.35)', border: `1px solid ${on ? p.color : 'rgba(150,190,240,.1)'}`, transition: 'all .6s ease', minWidth: 0 } },
        h('img', { src: window.wallAvatar(96, p.photo, p.name), alt: '', style: { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flex: 'none', border: `1.5px solid ${p.color}` } }),
        h('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } }, h('span', { style: { fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, p.name), h('span', { style: { fontSize: 12, color: p.color, whiteSpace: 'nowrap' } }, p.type))); });

      const panelHead = (title, meta) => h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        h('span', { style: { fontSize: 20, fontWeight: 700 } }, title), h('span', { style: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: MUTED, letterSpacing: '.08em' } }, meta));

      const right = h('section', { key: 'r', style: { display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 } },
        h('div', { style: Object.assign({}, PANEL, { border: `1px solid ${hi(2)}`, padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }) },
          this.sheen(1, 0), panelHead('אירועים במנהלת', 'השבוע'), directorate.length ? directorate : h('span', { style: { fontSize: 15, color: MUTED } }, 'אין אירועים השבוע')),
        h('div', { style: Object.assign({}, PANEL, { flex: 1, minHeight: 0, border: `1px solid ${hi(2)}`, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }) },
          this.sheen(2, 4.5),
          panelHead('אנשים במנהלת', D.people.length ? String(pIdx + 1).padStart(2, '0') + ' / ' + String(D.people.length).padStart(2, '0') : ''),
          this.spotlight(D, pIdx),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, flex: 'none' } }, peopleGrid)));

      const center = h('section', { key: 'c', style: { display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, position: 'relative' } },
        h('div', { style: { flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 } }, this.emblem()));

      const left = h('section', { key: 'l', style: Object.assign({}, PANEL, { minHeight: 0, border: `1px solid ${hi(1)}`, padding: '18px 18px 0', display: 'flex', flexDirection: 'column', gap: 14 }) },
        this.sheen(3, 9),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } }, h('span', { style: { fontSize: 20, fontWeight: 700 } }, 'ניוזלטר החלל השבועי'), h('span', { style: { fontSize: 13, color: MUTED } }, 'רקיע · הפורום הישראלי לחלל · ' + D.issue.range)),
          CFG.showQr && D.issue.url ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { fontSize: 11, color: MUTED, textAlign: 'left', lineHeight: 1.3 } }, 'לגיליון', h('br'), 'המלא'),
            h('img', { src: qrData(D.issue.url), alt: 'QR', style: { width: 52, height: 52, borderRadius: 8, background: '#0b1430', padding: 3, border: '1px solid rgba(230,241,255,.25)' } })) : null),
        D.news.length ? this.featured(D, fIdx, fsec) : null,
        D.news.length ? this.newsList(D) : null);

      const main = h('main', { key: 'main', style: { display: 'grid', gridTemplateColumns: '470px minmax(0,1fr) 470px', gap: 26, padding: '14px 36px 16px', minHeight: 0, position: 'relative', zIndex: 2 } }, right, center, left);

      const tickerBar = h('div', { key: 'tk', style: { display: 'flex', alignItems: 'center', margin: '0 36px', borderRadius: 999, background: 'rgba(10,20,40,.72)', border: '1px solid rgba(150,190,240,.14)', position: 'relative', zIndex: 2, minWidth: 0, overflow: 'hidden' } },
        h('div', { style: { flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', height: '100%', borderLeft: '1px solid rgba(150,190,240,.14)', fontSize: 15, fontWeight: 700 } }, 'אירועים והזדמנויות'),
        this.ticker(D));

      const launches = this.launchVals(D.launches, now).slice(0, 4).map((l, i) => h('div', { key: i, style: { height: 84, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 14px', borderRadius: 22, background: 'linear-gradient(180deg,rgba(40,62,104,.38),rgba(12,22,44,.6))', border: `1px solid ${l.border}`, boxShadow: l.shadow, minWidth: 0 } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 500, color: l.statusColor, border: `1px solid ${l.statusColor}` } }, l.status),
            h('span', { dir: 'ltr', style: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: MUTED } }, l.when)),
          h('span', { style: { fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, l.mission),
          h('span', { style: { fontSize: 12, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, l.vehicle + ' · ' + l.site)),
        h('div', { dir: 'ltr', style: { display: 'flex', gap: 4, flex: 'none' } }, l.segs.map((s, j) => h('div', { key: j, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 34, padding: '5px 3px', borderRadius: 10, background: 'rgba(6,12,26,.7)', border: '1px solid rgba(150,190,240,.12)' } },
          h('span', { style: { fontFamily: "'Lexend',sans-serif", fontSize: 17, fontWeight: 400, color: l.numColor, lineHeight: 1.1 } }, s.v), h('span', { style: { fontSize: 10, color: '#6f82a6' } }, s.u))))));
      const footer = h('footer', { key: 'ft', style: { display: 'grid', gridTemplateColumns: '150px repeat(4,minmax(0,1fr))', alignItems: 'center', gap: 16, padding: '12px 36px 16px', position: 'relative', zIndex: 2 } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } }, h('span', { style: { fontSize: 18, fontWeight: 700 } }, 'שיגורים קרובים'), h('span', { style: { fontSize: 12, color: MUTED } }, 'שעון ישראל · Launch Library')),
        launches);

      return stage([h(React.Fragment, { key: 'amb' }, this.ambient()), header, main, tickerBar, footer, h(React.Fragment, { key: 'ov' }, this.overlay())]);
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(Wall));
})();
