// Space Wall v4 — the lobby display. A direct port of the Claude Design "Space Wall v4" template:
// the same 1920×1080 stage, layout, styles and motion, rendered with React (vendored UMD, no build).
// Content comes from /api/feed (weekly newsletter + database). Until it answers the wall shows a calm "connecting"
// state, never invented content: the bundled sample (data/feed.json) appears only with ?sample=1, or lends a ?demo= its
// moment when there is no real one. Full-screen moments (launch mode, personal celebration, 12:00 show, important
// event) live in overlays.js, the 3D emblem in emblem-v2.js. The remote control (app/remote) drives design, brightness,
// the urgent banner and full-screen moments through /api/live, polled every few seconds; URL options override the
// stored design. /api/live also gives the server's clock, which times everything here, and the deployment, so the
// wall reloads itself after a deploy (and nightly at 04:00) and runs for weeks unattended.
(() => {
  const h = React.createElement;
  const { useState, useEffect } = React;

  // ---- config (URL query) ----------------------------------------------------------------------
  const q = new URLSearchParams(location.search);
  const bool = (k, d) => q.has(k) ? !/^(0|false|no|off)$/i.test(q.get(k)) : d;
  const num = (k, d) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  // The display key: the URL's, kept for visits without one (an installed app opens "/" with no query).
  function displayKey() {
    const k = q.get('key') || '';
    try { if (k) localStorage.setItem('wall:key', k); else return localStorage.getItem('wall:key') || ''; } catch (e) { /* no storage: the URL's only */ }
    return k;
  }
  const CFG = {
    feed: q.get('feed') || '/api/feed',
    key: displayKey(),
    refresh: Math.max(10, num('refresh', 60)),
    demo: q.get('demo') || 'off',                 // off | launch | greeting | noon | welcome
    sample: bool('sample', false),                 // show the bundled sample feed instead of /api/feed (design demos)
    noonShow: bool('noon', true),
    showQr: bool('qr', true),
    featureSeconds: Math.min(30, Math.max(6, num('feature', 12))),
    listSeconds: Math.min(10, Math.max(2, num('list', 4))),
    ambientFx: bool('fx', true),
    globeSpeed: Math.min(240, Math.max(20, num('globe', 90))),
    globeStyle: q.get('globeStyle') === 'real' ? 'real' : 'holo',
    cameraSway: bool('sway', true),
    staleAfterMin: num('stale', 180),
    live: q.get('live') || '/api/live',
    livePoll: Math.max(3, num('livePoll', 5)),
    preview: bool('preview', false),               // embedded in the remote: muted, no keyboard
    lang: q.get('lang') === 'en' ? 'en' : 'he',    // en: the whole wall in English (the remote's switch, for delegations)
    // From the remote's agent (design): a style layer, a headline in the header, hidden panels, news items. ?css=0 skips the layer.
    css: '', headline: '', headlineEn: '', hide: [], news: [],
    noCss: q.has('css') && /^(0|false|no|off)$/i.test(q.get('css')),
  };
  // Stored design (from the remote) → CFG, except where the URL sets the option explicitly.
  const DESIGN_KEYS = { noon: 'noonShow', qr: 'showQr', feature: 'featureSeconds', list: 'listSeconds', fx: 'ambientFx', globe: 'globeSpeed', globeStyle: 'globeStyle', sway: 'cameraSway', lang: 'lang' };
  function applyDesign(d) {
    let changed = false;
    for (const k in DESIGN_KEYS) {
      if (q.has(k) || d[k] === undefined) continue;
      if (CFG[DESIGN_KEYS[k]] !== d[k]) { CFG[DESIGN_KEYS[k]] = d[k]; changed = true; }
    }
    for (const k of ['headline', 'headlineEn']) { const v = typeof d[k] === 'string' ? d[k] : ''; if (CFG[k] !== v) { CFG[k] = v; changed = true; } }
    for (const k of ['hide', 'news']) { const v = Array.isArray(d[k]) ? d[k] : []; if (JSON.stringify(CFG[k]) !== JSON.stringify(v)) { CFG[k] = v; changed = true; } }
    styleLayer(typeof d.css === 'string' ? d.css : '');
    window.wallLang = CFG.lang;                    // overlays.js reads it
    return changed;
  }
  /** The agent's CSS (checked on the server: nothing loaded from outside) in a <style> after the wall's own. The wall's
   *  elements carry data-w="…" names for it; their styles are inline, so its rules use !important. */
  function styleLayer(css) {
    if (CFG.noCss) css = '';
    if (css === CFG.css) return;
    CFG.css = css;
    let el = document.getElementById('wall-style');
    if (!el) { el = document.createElement('style'); el.id = 'wall-style'; document.head.appendChild(el); }
    el.textContent = css;
  }
  window.wallLang = CFG.lang;
  // English (CFG.lang 'en'): the wall's own words here; what changes comes translated from /api/feed?lang=en.
  const EN = () => CFG.lang === 'en';
  const tr = (he, en) => (EN() ? en : he);

  // ---- time, fetches, reloads --------------------------------------------------------------------
  // The server's clock (from /api/live's `at`): a kiosk whose own clock drifts still opens and closes moments on time.
  let skew = 0;
  const serverNow = () => Date.now() + skew;
  window.wallNow = serverNow;                       // overlays.js counts down with it
  const timeout = (ms) => { if (AbortSignal.timeout) return AbortSignal.timeout(ms); const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  // A reload happens only when the page itself answers (never strand the lobby on the browser's offline page) and at
  // most once per `gap` across reloads (sessionStorage), so a page that breaks on load cannot loop.
  const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  async function reloadPage(gap) {
    if (Date.now() - (Number(store.get('wall:reloadAt')) || 0) < gap) return;
    try { if (!(await fetch(location.href, { cache: 'no-store', signal: timeout(10e3) })).ok) return; } catch (e) { return; }
    store.set('wall:reloadAt', String(Date.now()));
    location.reload();
  }
  // Launch Library statuses for a launch that has flown; a Go launch counts as flown after its time only while the data
  // is recent, since the launches come from a daily cron (the feed refreshes them near a launch).
  const FLOWN = { Success: 1, 'In Flight': 1, Failure: 1, 'Partial Failure': 1 };
  const goNow = (l, now) => l.code === 'Go' && now - Date.parse(l.checked) < 6 * 3600e3;

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
  const fmtDateHe = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' });
  const fmtDateEn = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' });
  const fmtWhen = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  // Shared panel look (the glass cards).
  const PANEL = { position: 'relative', overflow: 'hidden', borderRadius: 26, background: 'linear-gradient(180deg,rgba(40,62,104,.42) 0%,rgba(12,22,44,.6) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07),0 24px 60px rgba(0,0,0,.35)', transition: 'border-color 1s ease' };
  const PILL = { borderRadius: 999, background: 'rgba(14,26,50,.7)', border: '1px solid rgba(150,190,240,.14)' };
  const MUTED = '#8b9dbd';
  // The welcome screen's way out (overlays.js Welcome): the wall wakes under the logo's white disk, then the screen fades off.
  const WELCOME_REVEAL_MS = 2000, WELCOME_LEAVE_MS = 3400;

  class Wall extends React.Component {
    constructor(p) { super(p); this.state = { scale: 1, now: serverNow(), data: null, ov: null, toast: null, live: null, feedErr: 0, covered: false }; }

    // ---- lifecycle ----------------------------------------------------------------------------
    componentDidMount() {
      this.t0 = Date.now();
      this.fit = () => { const s = Math.min(innerWidth / 1920, innerHeight / 1080); if (s > 0) this.setState({ scale: s }); };
      this.fit(); addEventListener('resize', this.fit); this.fitRetry = setTimeout(this.fit, 800);
      this.tick = setInterval(() => { this.setState({ now: serverNow() }); try { this.schedule(); } catch (e) { console.warn('schedule failed', e); } }, 1000);
      this.onKey = (e) => { if (CFG.preview) return; const k = e.key.toLowerCase(), ov = this.state.ov;
        if (k === 'l') this.demo('launch'); else if (k === 'g') this.demo('greeting'); else if (k === 'n') this.demo('noon'); else if (k === 'w') this.demo('welcome');
        else if ((k === 'enter' || k === ' ') && ov && ov.kind === 'welcome' && ov.demo) this.leaveWelcome();   // a demo's "enter"; a real one is the remote's
        else if (k === 'escape') this.setState({ ov: null }); };
      addEventListener('keydown', this.onKey);
      this.load();
      this.loadLive(); this.livePoll = setInterval(() => this.loadLive(), CFG.livePoll * 1000);
    }
    componentWillUnmount() { removeEventListener('keydown', this.onKey); clearInterval(this.tick); clearTimeout(this.poll); clearInterval(this.livePoll); clearTimeout(this.fitRetry); clearTimeout(this.coverT); clearTimeout(this.revealT); removeEventListener('resize', this.fit); }
    /** A full-screen moment covers the wall once it has faded in (`covered`); until it ends the wall under it rests (render). */
    componentDidUpdate(_, prev) {
      if (!this.state.ov === !prev.ov) return;
      clearTimeout(this.coverT);
      if (this.state.ov) this.coverT = setTimeout(() => this.setState({ covered: true }), 1200);
      else if (this.state.covered) this.setState({ covered: false });
    }

    // ---- live state from the remote -------------------------------------------------------------
    get liveOk() { return Date.now() - (this._liveOkAt || 0) < 30e3; }   // one missed poll is not an outage
    async loadLive() {
      if (this._liveBusy) return;
      this._liveBusy = true;
      try {
        const t0 = Date.now(), L = JSON.parse(await this.fetchText(CFG.live, 8e3)), t1 = Date.now(), at = Date.parse(L.at);
        if (at) {
          // A late answer must not undo a newer one (e.g. close a moment); a server clock set back by minutes is not late.
          if (at < (this._liveAt || 0) && this._liveAt - at < 120e3) return;
          this._liveAt = at;
          const off = at - (t0 + t1) / 2;                 // server clock minus ours, give or take half the round trip
          if (Math.abs(off - skew) > 1000) skew = off;
        }
        this._liveOkAt = Date.now();
        // A new deployment counts once it has answered twice in a row; '' (unknown) never does.
        if (L.build && !this._build) this._build = L.build;
        this._newBuild = L.build && L.build !== this._build ? (this._newBuild || 0) + 1 : 0;
        const lang = CFG.lang;
        if (L.design && applyDesign(L.design)) { this.resetCaches(); this._amb = this._emb = this._sh1 = this._sh2 = this._sh3 = null; this._ovK = null; }
        if (CFG.lang !== lang) { this._lastBody = null; clearTimeout(this.poll); this.poll = setTimeout(() => this.load(), 0); }
        this.setState({ live: L, now: serverNow() }, () => this.syncTakeover());
      } catch (e) { /* liveOk lapses by itself */ } finally { this._liveBusy = false; }
    }
    /** A full-screen moment from the remote (or an important event / the 12:00 show, decided by the server). */
    syncTakeover() {
      const L = this.state.live, tk = L && L.takeover, ov = this.state.ov, now = serverNow();
      // Forget what was shown once the server reports none, so the remote's undo of "back to normal" brings it back.
      if (!tk) { this._tkSeen = null; if (ov && ov.live) { if (ov.kind === 'welcome') this.leaveWelcome(); else this.setState({ ov: null }); } return; }
      if (tk.id === this._tkSeen) return;                // shown already, maybe ended here first: not again
      this._tkSeen = tk.id;
      const until = Date.parse(tk.until) || now + 60e3;
      if (until <= now) return;
      if (tk.kind === 'noon') this.setState({ ov: { kind: 'noon', id: tk.id, live: true, until } });
      else if (tk.kind === 'celebrate' && tk.person) this.setState({ ov: { kind: 'celebrate', id: tk.id, live: true, person: tk.person, until } });
      else if (tk.kind === 'event') this.setState({ ov: { kind: 'event', id: tk.id, live: true, event: tk, until } });
      else if (tk.kind === 'welcome') this.setState({ ov: { kind: 'welcome', id: tk.id, live: true, guest: tk.guest || '', until } });
      else if (tk.kind === 'image' && tk.url) this.setState({ ov: { kind: 'image', id: tk.id, live: true, url: tk.url, caption: tk.caption || '', captionEn: tk.captionEn || '', until } });
      else if (tk.kind === 'stream' && tk.videoId) this.setState({ ov: { kind: 'stream', id: tk.id, live: true, videoId: tk.videoId, title: tk.title || '', until } });
    }
    /** "Enter" on the welcome screen: its way out (overlays.js Welcome), then, under the logo's white disk, the wall
     *  wakes and makes its entrance (render: `entering`) while the welcome screen fades off it. */
    leaveWelcome() {
      const ov = this.state.ov;
      if (!ov || ov.kind !== 'welcome' || ov.leaving) return;
      this.setState({ ov: Object.assign({}, ov, { leaving: Date.now(), until: serverNow() + WELCOME_LEAVE_MS }) });
      clearTimeout(this.revealT);
      this.revealT = setTimeout(() => this.setState({ enterAt: Date.now() }), WELCOME_REVEAL_MS);
    }

    async fetchText(url, ms) {
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(url + sep + 't=' + Date.now() + (CFG.key ? '&key=' + encodeURIComponent(CFG.key) : '') + (EN() ? '&lang=en' : ''), { cache: 'no-store', signal: timeout(ms) });
      if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
      return res.text();
    }
    /** The feed, every `refresh` seconds. Until the first answer: retry within seconds and show nothing invented. */
    async load() {
      if (this._loading) return;
      this._loading = true;
      let wait = CFG.refresh;
      const lang = CFG.lang;
      try {
        const body = await this.fetchText(CFG.sample ? '/data/feed.json' : CFG.feed, 20e3);
        // The language changed while this was on its way: ask again in the new one.
        if (lang !== CFG.lang) { wait = 0; return; }
        // English with some text still being translated (it shows in Hebrew meanwhile): look again soon.
        if (EN() && /"missing":[1-9]/.test(body)) wait = Math.min(wait, 15);
        if (body !== this._lastBody) {
          const data = JSON.parse(body);
          if (!Array.isArray(data.news) || !Array.isArray(data.people)) throw new Error('feed is not in the v4 shape');
          for (const k of ['featured', 'ticker', 'launches', 'directorate']) if (!Array.isArray(data[k])) data[k] = [];
          data.issue = data.issue || {}; data.catColor = data.catColor || {}; data.catImage = data.catImage || {};
          this._lastBody = body;
          this.resetCaches();
          this.setState({ data });
        }
        this._feedOkAt = Date.now(); this._fails = 0;
        if (this.state.feedErr) this.setState({ feedErr: 0 });
      } catch (e) {
        console.warn('feed load failed', e);
        // Without data yet: 5 s, doubling up to the poll interval. With data: keep it (it is real) and the usual pace.
        if (!this.state.data) { this._fails = (this._fails || 0) + 1; wait = Math.min(CFG.refresh, 5 * 2 ** (this._fails - 1)); this.setState({ feedErr: e.status || -1 }); }
      } finally {
        this._loading = false;
        clearTimeout(this.poll); this.poll = setTimeout(() => this.load(), wait * 1000);
        if (CFG.demo !== 'off' && !this._demoDone) { this._demoDone = true; this.setState({}, () => this.demo(CFG.demo)); }
      }
    }
    resetCaches() { this._feat = this._list = this._tick = this._spot = this._trk = this._typ = null; this._featK = this._listS = this._spotI = undefined; }
    async sample() { return this._sample || (this._sample = JSON.parse(await this.fetchText('/data/feed.json', 20e3))); }

    // ---- moments --------------------------------------------------------------------------------
    /** The feed, with the news items added from the remote first (featured, in the newsletter panel). */
    get D() {
      const d = this.state.data, extra = CFG.news;
      if (!d || !extra.length) return d;
      if (this._mSrc === d && this._mNews === extra && this._mLang === CFG.lang) return this._mD;
      const NEW = tr('חדש', 'New'), dm = (iso) => { const t = new Date(iso); return isNaN(t) ? '' : String(t.getDate()).padStart(2, '0') + '.' + String(t.getMonth() + 1).padStart(2, '0'); };
      const items = extra.map((n) => ({ cat: n.cat || NEW, il: false, date: dm(n.added), src: n.src || '', url: n.url || '', image: n.image || '',
        title: (EN() && n.titleEn) || n.title, dek: (EN() && n.dekEn) || n.dek || '' }));
      const catColor = Object.assign({}, d.catColor);
      items.forEach((n) => { if (!catColor[n.cat]) catColor[n.cat] = '#d4f25c'; });
      this._mSrc = d; this._mNews = extra; this._mLang = CFG.lang;
      return (this._mD = Object.assign({}, d, { news: [...items, ...d.news], featured: [...items.map((_, i) => i), ...d.featured.map((i) => i + items.length)], catColor }));
    }
    ilParts(now) { const o = {}; fmtParts.formatToParts(new Date(now)).forEach((p) => (o[p.type] = p.value)); return { day: o.year + o.month + o.day, iso: o.year + '-' + o.month + '-' + o.day, h: +o.hour, m: +o.minute, s: +o.second }; }
    /** People greeted full-screen today: from the day of their moment to two days after it, never mourning. */
    celebratable(today) { const D = this.D; return D ? D.people.filter((p) => p.celebrate !== false && p.on && p.on <= today && today <= addDays(p.on, 2)) : []; }
    /** A moment on request (?demo=, keys L/G/N): real content when there is some, else the sample's; it is a demo. */
    async demo(kind) {
      if (kind === 'welcome') { const t = serverNow(); return this.setState({ ov: { kind: 'welcome', id: t, demo: true, guest: q.get('guest') || '', until: t + 3600e3 } }); }
      if (kind === 'noon') { const t = serverNow(); return this.setState({ ov: { kind: 'noon', id: t, demo: true, until: t + 15 * 60e3 } }); }
      if (kind !== 'launch' && kind !== 'greeting') return;
      const pick = (S) => (kind === 'launch' ? S.launches : S.people.filter((p) => p.celebrate !== false)) || [];
      let list = this.D ? pick(this.D) : [];
      if (!list.length) { try { list = pick(await this.sample()); } catch (e) { return; } }
      const t = serverNow();
      if (!list.length) return;
      if (kind === 'launch') this.setState({ ov: { kind: 'launch', id: t, demo: true, launch: Object.assign({}, list[Math.min(2, list.length - 1)], { at: new Date(t + 15000).toISOString() }), until: t + 27000 } });
      else this.setState({ ov: { kind: 'celebrate', id: t, demo: true, person: list[(this._demoP = ((this._demoP ?? -1) + 1)) % list.length], until: t + 14000 } });
    }
    schedule() {
      const D = this.D, now = serverNow();
      let ov = this.state.ov;
      if (ov && now > ov.until) { if (ov.kind === 'launch' && !ov.demo) this.setState({ toast: { title: tr('שוגר', 'Liftoff'), line: ov.launch.mission + ' · ' + ov.launch.vehicle, until: now + 45000 } }); ov = null; this.setState({ ov: null }); }
      if (this.state.toast && now > this.state.toast.until) this.setState({ toast: null });
      const T = this.ilParts(now);
      this.maybeReload(T, ov);
      if (ov && (ov.kind === 'noon' || ov.live)) return;
      // The 12:00 show is decided by the server (it can be skipped or stopped from the remote); locally only as a fallback.
      if (!this.liveOk && CFG.noonShow && T.h === 12 && T.m === 0 && T.s < 5 && this._noonDay !== T.day) { this._noonDay = T.day; this.setState({ ov: { kind: 'noon', id: now, until: now + 15 * 60e3 } }); return; }
      if (!D) return;
      // Launch mode only for a launch Launch Library calls Go (and recently): never for TBD/TBC/Hold.
      const L = D.launches.find((l) => { const d = Date.parse(l.at) - now; return d > -12000 && d <= 600e3 && goNow(l, now); });
      if (L) { if (!ov || ov.kind !== 'launch' || ov.launch.at !== L.at) this.setState({ ov: { kind: 'launch', id: L.at, launch: L, until: Date.parse(L.at) + 12000 } }); return; }
      // Held, scrubbed or moved during the countdown (the feed no longer has a Go launch at that time): close, no "שוגר".
      if (ov && ov.kind === 'launch' && !ov.demo && now < ov.until && !D.launches.some((l) => l.at === ov.launch.at && l.code === 'Go')) { ov = null; this.setState({ ov: null }); }
      // A personal celebration every half hour (:00 and :30), cycling through the people whose day it is.
      const slotKey = T.day + T.h + ':' + T.m;
      if (!ov && (T.m === 0 || T.m === 30) && T.s < 5 && this._celebSlot !== slotKey) { this._celebSlot = slotKey; const P = this.celebratable(T.iso); if (P.length) this.setState({ ov: { kind: 'celebrate', id: now, person: P[(T.h * 2 + (T.m ? 1 : 0)) % P.length], until: now + 14000 } }); }
    }
    /** After a deploy (/api/live's `build` changed) or nightly around 04:00, reload: never over a full-screen moment. */
    maybeReload(T, ov) {
      if (ov || (this.state.live && this.state.live.takeover) || Date.now() < (this._reloadTry || 0)) return;
      const nightly = T.h === 4 && T.m < 20 && Date.now() - this.t0 > 3600e3;
      if (!nightly && (this._newBuild || 0) < 2) return;
      this._reloadTry = Date.now() + 60e3;
      reloadPage(nightly ? 3600e3 : 10 * 60e3);
    }
    overlay() {
      const ov = this.state.ov, toast = this.state.toast;
      const k = (ov ? ov.kind + ov.id + (ov.leaving ? 'L' : '') : '') + '|' + (toast ? toast.until : '');
      if (this._ovK === k) return this._ov; this._ovK = k;
      if (!window.makeWallOverlays) return (this._ov = null);
      const O = this._O || (this._O = window.makeWallOverlays(React));
      // Keyed by the moment alone: a toast coming or going must not start it over (the 12:00 video from the top).
      const mk = ov ? ov.kind + ov.id : '';
      let el = null;
      if (ov && ov.kind === 'launch') el = h(O.LaunchMode, { key: mk, launch: ov.launch });
      if (ov && ov.kind === 'celebrate') el = h(O.Celebration, { key: mk, person: ov.person });
      // The remote covers its preview with its own card during the server's 12:00 show, so the preview skips the video.
      if (ov && ov.kind === 'noon') el = h(O.NoonShow, { key: mk, src: CFG.preview && ov.live ? '' : (this.D && this.D.promoVideo) || '/assets/promo.mp4', logo: '/assets/logo-mark.png', muted: CFG.preview, onDone: () => this.setState({ ov: null }) });
      if (ov && ov.kind === 'event') el = h(O.EventTakeover, { key: mk, event: ov.event, until: ov.until });
      if (ov && ov.kind === 'welcome') el = h(O.Welcome, { key: mk, guest: ov.guest, leaving: ov.leaving || 0, fx: CFG.ambientFx });
      if (ov && ov.kind === 'image') el = h(O.ImageMoment, { key: mk, url: ov.url, caption: (EN() && ov.captionEn) || ov.caption });
      // The remote's preview (often a phone) shows a card for a stream instead of loading the video player.
      if (ov && ov.kind === 'stream') el = h(O.LiveStream, { key: mk, videoId: ov.videoId, title: ov.title, preview: CFG.preview });
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
    emblem(rest) {
      if (this._emb && this._embRest === rest) return this._emb;
      this._embRest = rest;
      return (this._emb = h('div', { style: { position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        h('div', { style: { position: 'absolute', width: 980, height: 980, left: '50%', top: '47%', marginLeft: -490, marginTop: -490, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,160,240,.2) 0%, rgba(70,120,210,.08) 32%, rgba(60,90,160,0) 66%)', animation: 'breathe 9s ease-in-out infinite' } }),
        h('space-emblem-v2', { key: CFG.globeStyle + CFG.lang, word: tr('מנהלת החלל', 'SPACE PROGRAM OFFICE'), speed: CFG.globeSpeed, globe: CFG.globeStyle, sway: CFG.cameraSway ? 'on' : 'off', paused: rest ? '' : null, style: { width: '100%', height: '100%', maxWidth: 860, position: 'relative', zIndex: 2, filter: 'drop-shadow(0 30px 40px rgba(0,0,0,.55))' } })));
    }

    // ---- content blocks ---------------------------------------------------------------------------
    featured(D, idx, sec) {
      const k = idx + ':' + sec;
      if (this._feat && this._featK === k) return this._feat;
      this._featK = k;
      const n = D.news[D.featured[idx]] || D.news[0], col = D.catColor[n.cat] || '#9fdcff', total = D.featured.length;
      const img = n.image || D.catImage[n.cat] || Object.values(D.catImage)[0];
      const chip = (t, c, fill) => h('span', { style: { padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500, color: fill ? '#0a1224' : c, background: fill ? c : 'rgba(6,12,26,.6)', border: `1px solid ${c}` } }, t);
      return (this._feat = h('article', { key: idx, 'data-w': 'featured', style: { position: 'relative', zIndex: 1, borderRadius: 22, overflow: 'hidden', background: 'rgba(8,16,34,.55)', border: '1px solid rgba(150,190,240,.16)', flex: 'none', animation: 'rise .8s ease both' } },
        h('div', { style: { height: 150, position: 'relative', overflow: 'hidden' } },
          h('div', { style: { position: 'absolute', inset: 0, backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', animation: `zoomBg ${sec}s linear both` } }),
          h('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,12,26,.15) 0%, rgba(6,12,26,.35) 55%, rgba(8,16,34,.98) 100%)' } }),
          h('div', { style: { position: 'absolute', top: 12, [EN() ? 'left' : 'right']: 12, display: 'flex', gap: 6 } }, chip(n.cat, col), n.il ? chip(tr('ישראל', 'Israel'), '#d4f25c', true) : null),
          h('span', { dir: 'ltr', style: { position: 'absolute', top: 14, [EN() ? 'right' : 'left']: 14, fontFamily: "'Lexend',sans-serif", fontSize: 13, color: '#e6f1ff', letterSpacing: '.08em' } }, String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0'))),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 18px 16px', marginTop: -26, position: 'relative' } },
          h('span', { style: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: MUTED } }, n.date + ' · ' + n.src),
          h('h3', { style: { margin: 0, fontSize: 25, fontWeight: 700, lineHeight: 1.22, textWrap: 'pretty' } }, n.title),
          h('p', { style: { margin: 0, fontSize: 16, color: '#b3c2dc', fontWeight: 300, lineHeight: 1.4, textWrap: 'pretty' } }, n.dek),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 } },
            h('div', { style: { flex: 1, height: 3, borderRadius: 3, background: 'rgba(150,190,240,.14)', overflow: 'hidden' } }, h('div', { style: { height: '100%', background: `linear-gradient(${EN() ? 90 : 270}deg,#d4f25c,#6fd6ea)`, transformOrigin: EN() ? 'left' : 'right', animation: `grow ${sec}s linear both` } })),
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
      return (this._list = h('div', { 'data-w': 'news-list', style: { flex: 1, minHeight: 0, position: 'relative', zIndex: 1, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg,transparent 0,#000 8%,#000 88%,transparent 100%)', maskImage: 'linear-gradient(180deg,transparent 0,#000 8%,#000 88%,transparent 100%)' } },
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
      const item = (e, i) => { const opp = e.kind === 'הזדמנות' || e.kind === 'Opportunity', c = opp ? '#d4f25c' : '#6fd6ea'; return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px', whiteSpace: 'nowrap', fontSize: 16 } },
        h('span', { style: { padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, color: c, border: `1px solid ${c}` } }, e.kind),
        h('span', { style: { fontFamily: "'Lexend',sans-serif", color: '#9fdcff', fontSize: 14 } }, e.date),
        h('span', null, e.name), h('span', { style: { color: 'rgba(150,190,240,.3)', [EN() ? 'marginLeft' : 'marginRight']: 14 } }, '◆')); };
      return (this._tick = h('div', { style: { flex: 1, minWidth: 0, overflow: 'hidden', height: '100%', display: 'flex', alignItems: 'center' } },
        h('div', { style: { display: 'flex', width: 'max-content', animation: `${EN() ? 'scrollXL' : 'scrollX'} ${Math.max(1, D.ticker.length) * 8}s linear infinite` } }, [...D.ticker, ...D.ticker].map(item))));
    }
    launchVals(L, now) {
      let nextFound = false; const p = (n) => String(n).padStart(2, '0');
      return L.map((l) => {
        const at = Date.parse(l.at), d = at - now, gone = d <= 0;
        const when = fmtWhen.format(new Date(at)).replace(',', ' ·');
        const isNext = !gone && !nextFound; if (isNext) nextFound = true;
        const a = Math.abs(d), dd = Math.floor(a / 86400e3), hh = Math.floor(a / 3600e3) % 24, mm = Math.floor(a / 60e3) % 60, ss = Math.floor(a / 1e3) % 60;
        // Past its time a launch reads as launched only on Launch Library's word; otherwise it probably slipped.
        const flew = gone && (FLOWN[l.code] || goNow(l, now));
        const U = EN() ? { d: 'DAYS', h: 'HRS', m: 'MIN', s: 'SEC' } : { d: 'ימים', h: 'שע׳', m: 'דק׳', s: 'שנ׳' };
        const segs = !gone ? [{ v: p(dd), u: U.d }, { v: p(hh), u: U.h }, { v: p(mm), u: U.m }, { v: p(ss), u: U.s }]
          : flew ? [{ v: 'T+', u: '' }, { v: p(Math.min(99, Math.floor(a / 3600e3))), u: U.h }, { v: p(mm), u: U.m }] : [{ v: '--', u: U.h }, { v: '--', u: U.m }];
        const status = !gone ? l.status : !flew ? tr('ממתין לעדכון', 'Awaiting update') : l.code === 'Go' ? tr('שוגר', 'Launched') : l.status;
        const statusColor = gone ? '#6f82a6' : l.code === 'Go' ? '#8fe0b8' : '#e9b872';
        return Object.assign({}, l, { when, segs, status, statusColor, numColor: gone ? '#6f82a6' : isNext ? '#d4f25c' : '#e6f1ff', border: isNext ? 'rgba(212,242,92,.55)' : 'rgba(150,190,240,.14)', shadow: isNext ? '0 0 24px rgba(212,242,92,.16)' : 'none' });
      });
    }
    /** "updated X ago" from the feed's generatedAt; amber when stale, or when the feed itself has stopped answering. */
    updatedAgo(D) {
      const off = !CFG.sample && Date.now() - (this._feedOkAt || Date.now()) > Math.max(5 * 60e3, 3 * CFG.refresh * 1000);
      const noData = tr('אין חיבור לנתונים', 'No data connection');
      const t = Date.parse(D.generatedAt); if (!t) return { text: off ? noData : tr('עודכן —', 'Updated —'), stale: true };
      const min = Math.max(0, Math.round((this.state.now - t) / 6e4));
      const text = EN() ? (min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.floor(min / 60)} h ago` : `${Math.floor(min / 1440)} days ago`)
        : min < 1 ? 'עכשיו' : min < 60 ? `לפני ${min} דק׳` : min < 1440 ? `לפני ${Math.floor(min / 60)} שע׳` : `לפני ${Math.floor(min / 1440)} ימים`;
      return { text: (off ? noData + ' · ' : '') + tr('עודכן ', 'Updated ') + text, stale: off || min > CFG.staleAfterMin };
    }

    // ---- the template -----------------------------------------------------------------------------
    render() {
      const D = this.D, now = this.state.now, t = Date.now() - (this.t0 || Date.now()), nd = new Date(now);
      const hidden = (k) => CFG.hide.includes(k), headline = (EN() && CFG.headlineEn) || CFG.headline;
      // Under a full-screen moment the wall rests: its layers are not drawn and the 3D emblem stops, so a lobby computer
      // gives everything to the moment (the 12:00 video stuttered with the whole wall still animating beneath it).
      const ov = this.state.ov, enterAt = this.state.enterAt || 0;
      const rest = !!ov && this.state.covered && !(ov.leaving && enterAt >= ov.leaving);
      // Right after the welcome screen: the wall's entrance (each part flies in, the emblem lands with a shock ring).
      const entering = Date.now() - enterAt < 4500;
      const en = (name, dur, delay) => (entering ? { animation: `${name} ${dur}s cubic-bezier(.16,1,.3,1) ${delay}s both` } : {});
      const stage = (layers) => h('div', { style: { width: '100vw', height: '100vh', background: '#040914', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontFamily: 'Heebo,system-ui,sans-serif', color: '#e6f1ff' } },
        h('div', { 'data-w': 'stage', dir: EN() ? 'ltr' : 'rtl', lang: CFG.lang, style: { width: 1920, height: 1080, flex: 'none', position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse 1100px 760px at 50% 50%, #0c1d3d 0%, #07122a 45%, #040914 100%)', transform: `scale(${this.state.scale})`, transformOrigin: 'center center', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased', display: 'grid', gridTemplateRows: '88px minmax(0,1fr) ' + (hidden('ticker') ? '0px ' : '50px ') + (hidden('launches') ? '16px' : '118px') } },
          h('div', { key: 'wall', style: { display: rest ? 'none' : 'contents' } }, layers),
          h(React.Fragment, { key: 'ov' }, this.overlay()), this.liveLayers()));
      const ago = D && this.updatedAgo(D);
      const dot = ago && h('span', { style: { width: 9, height: 9, borderRadius: '50%', background: ago.stale ? '#e9b872' : '#8fe0b8', boxShadow: `0 0 10px ${ago.stale ? '#e9b872' : '#8fe0b8'}`, animation: 'breathe 2.4s ease-in-out infinite', display: 'inline-block' } });
      const timeBox = (big, small, extra, smallStyle) => h('div', { 'data-w': 'clock', style: Object.assign({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, borderRadius: 22, background: 'rgba(14,26,50,.7)', border: '1px solid rgba(150,190,240,.14)' }, extra.box) },
        h('span', { style: Object.assign({ fontSize: 26, letterSpacing: '.03em' }, extra.big) }, big), h('span', { style: Object.assign({ fontSize: 12, color: MUTED }, smallStyle) }, small));

      const header = h('header', { key: 'hdr', 'data-w': 'header', style: Object.assign({ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0 36px', position: 'relative', zIndex: 2 }, en('enDown', 1.2, 0.5)) },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
          // The mark alone, its emblem centred in the disc: the file also has the name under the emblem (cut off here),
          // and the emblem sits a little right of the file's middle.
          h('div', { 'data-w': 'logo', style: { position: 'relative', width: 52, height: 52, flex: 'none', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#ffffff 0%,#dfeaf7 60%,#a9c3e2 100%)', boxShadow: '0 0 0 1px rgba(160,200,255,.35),0 0 24px rgba(111,214,234,.35)', overflow: 'hidden' } },
            h('img', { 'data-w': 'logo-img', src: '/assets/logo-mark.png', alt: '', style: { position: 'absolute', left: '50%', top: '50%', width: 54, height: 'auto', marginLeft: -28.4, marginTop: -23.3, clipPath: 'inset(0 0 23% 0)' } })),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } }, h('div', { 'data-w': 'title', style: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em' } }, tr('צג חלל · מנהלת החלל', 'Space Wall · Space Program Office')))),
        headline ? h('div', { 'data-w': 'headline', style: { padding: '8px 28px', borderRadius: 999, background: 'rgba(14,26,50,.7)', border: '1px solid rgba(212,242,92,.35)', fontSize: 26, fontWeight: 700, color: '#e6f1ff', whiteSpace: 'nowrap', maxWidth: 820, overflow: 'hidden', textOverflow: 'ellipsis' } }, headline) : h('div'),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, fontFamily: "'Lexend',sans-serif" } },
          ago ? h('div', { 'data-w': 'updated', style: Object.assign({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', fontFamily: 'Heebo', fontSize: 14, color: MUTED }, PILL) }, dot, h('span', null, ago.text)) : null,
          timeBox(fmtIL.format(nd), (EN() ? fmtDateEn : fmtDateHe).format(nd), { box: { padding: '6px 20px' }, big: { fontWeight: 400 } }, { fontFamily: 'Heebo' }),
          timeBox(fmtUTC.format(nd), 'UTC', { box: { padding: '6px 18px' }, big: { fontWeight: 300, color: '#9fdcff' } }, { letterSpacing: '.12em' })));
      const quiet = (text, extra) => h('span', { style: Object.assign({ fontSize: 15, color: MUTED, lineHeight: 1.4 }, extra) }, text);

      // No feed yet: the emblem, the clock and a calm word. Nothing invented; full-screen moments from the remote still show.
      if (!D) {
        const denied = this.state.feedErr === 401 || this.state.feedErr === 403;
        return stage([h(React.Fragment, { key: 'amb' }, this.ambient()), header,
          h('div', { key: 'e', 'data-w': 'emblem', style: Object.assign({ gridRow: '2 / 4', display: 'flex', minHeight: 0 }, en('enEmblem', 1.8, 0)) }, this.emblem(rest)),
          h('div', { key: 'w', style: { gridRow: '4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, position: 'relative', zIndex: 2 } },
            h('span', { style: { fontSize: 26, fontWeight: 500, color: '#b3c2dc' } }, tr('מתחבר לנתונים…', 'Connecting…')),
            denied ? quiet(tr('הצג לא קיבל גישה לנתונים: בדקו את מפתח התצוגה (key) בכתובת', 'The wall has no access to its data: check the display key (key) in the address')) : null)]);
      }

      const fsec = CFG.featureSeconds, fIdx = D.featured.length ? Math.floor(t / (fsec * 1000)) % D.featured.length : 0;
      const pIdx = D.people.length ? Math.floor(t / 7000) % D.people.length : 0, focusIdx = Math.floor(t / 9000) % 4;
      const hi = (i) => (focusIdx === i ? 'rgba(212,242,92,.45)' : 'rgba(150,190,240,.16)');
      const cur = D.people[pIdx];

      // Events that have ended drop out between feed updates too; "עכשיו" while one runs, "הבא" only for the next to come.
      let nextTagged = false;
      const directorate = D.directorate.filter((d) => !d.end || Date.parse(d.end) > now).map((d, i) => {
        const tag = d.start && Date.parse(d.start) <= now ? tr('עכשיו', 'NOW') : nextTagged ? '' : ((nextTagged = true), tr('הבא', 'NEXT'));
        return h('div', { key: i, style: { display: 'grid', gridTemplateColumns: '62px minmax(0,1fr) auto', alignItems: 'center', gap: 14, padding: '6px 12px', borderRadius: 18, background: tag ? 'rgba(212,242,92,.06)' : 'rgba(8,16,34,.35)', border: `1px solid ${tag ? 'rgba(212,242,92,.3)' : 'rgba(150,190,240,.1)'}` } },
          h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 58, borderRadius: 14, background: 'rgba(8,16,34,.7)', border: '1px solid rgba(150,190,240,.14)' } },
            h('span', { style: { fontFamily: "'Lexend',sans-serif", fontSize: 24, fontWeight: 500, lineHeight: 1 } }, d.day), h('span', { style: { fontSize: 12, color: MUTED } }, d.dow + ' · ' + d.mon)),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } }, h('span', { style: { fontSize: 17, fontWeight: 500, lineHeight: 1.25, textWrap: 'pretty' } }, d.name), h('span', { style: { fontSize: 13, color: MUTED } }, d.place)),
          h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 } }, h('span', { style: { fontFamily: "'Lexend',sans-serif", fontSize: 15, color: '#9fdcff' } }, d.time), h('span', { style: { fontSize: 12, fontWeight: 500, color: '#d4f25c' } }, tag)));
      });

      const peopleGrid = D.people.map((p, i) => { const on = p === cur; return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 14, background: on ? 'rgba(111,214,234,.1)' : 'rgba(8,16,34,.35)', border: `1px solid ${on ? p.color : 'rgba(150,190,240,.1)'}`, transition: 'all .6s ease', minWidth: 0 } },
        h('img', { src: window.wallAvatar(96, p.photo, p.name), alt: '', style: { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flex: 'none', border: `1.5px solid ${p.color}` } }),
        h('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } }, h('span', { style: { fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, p.name), h('span', { style: { fontSize: 12, color: p.color, whiteSpace: 'nowrap' } }, p.type))); });

      const panelHead = (title, meta) => h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        h('span', { style: { fontSize: 20, fontWeight: 700 } }, title), h('span', { style: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: MUTED, letterSpacing: '.08em' } }, meta));

      const showEvents = !hidden('events'), showPeople = !hidden('people'), showNews = !hidden('news');
      const right = !showEvents && !showPeople ? null : h('section', { key: 'r', style: Object.assign({ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }, en(EN() ? 'enFromL' : 'enFromR', 1.3, 0.75)) },
        showEvents ? h('div', { 'data-w': 'events', style: Object.assign({}, PANEL, { border: `1px solid ${hi(2)}`, padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }, showPeople ? {} : { flex: 1, minHeight: 0 }) },
          this.sheen(1, 0), panelHead(tr('אירועים', 'Events'), tr('השבוע', 'THIS WEEK')), directorate.length ? directorate : quiet(tr('אין אירועים השבוע', 'No events this week'))) : null,
        showPeople ? h('div', { 'data-w': 'people', style: Object.assign({}, PANEL, { flex: 1, minHeight: 0, border: `1px solid ${hi(2)}`, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }) },
          this.sheen(2, 4.5),
          panelHead(tr('אנשי המנהלת', 'Our people'), D.people.length ? String(pIdx + 1).padStart(2, '0') + ' / ' + String(D.people.length).padStart(2, '0') : ''),
          D.people.length ? this.spotlight(D, pIdx) : quiet(tr('אין ימי הולדת או רגעים אישיים בימים הקרובים', 'No birthdays or personal moments in the coming days')),
          D.people.length ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, flex: 'none' } }, peopleGrid) : null) : null);

      const center = h('section', { key: 'c', style: { display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, position: 'relative' } },
        h('div', { 'data-w': 'emblem', style: Object.assign({ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }, en('enEmblem', 1.8, 0)) }, this.emblem(rest)),
        entering ? h('div', { key: 'shock', style: { position: 'absolute', left: '50%', top: '47%', width: 600, height: 600, marginLeft: -300, marginTop: -300, borderRadius: '50%', border: '3px solid rgba(190,235,255,.9)', boxShadow: '0 0 60px rgba(111,214,234,.7), inset 0 0 60px rgba(111,214,234,.4)', pointerEvents: 'none', animation: 'enShock 1.6s cubic-bezier(.2,.8,.3,1) .9s both' } }) : null);

      const left = !showNews ? null : h('section', { key: 'l', 'data-w': 'news', style: Object.assign({}, PANEL, { minHeight: 0, border: `1px solid ${hi(1)}`, padding: '18px 18px 0', display: 'flex', flexDirection: 'column', gap: 14 }, en(EN() ? 'enFromR' : 'enFromL', 1.3, 0.75)) },
        this.sheen(3, 9),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } }, h('span', { style: { fontSize: 20, fontWeight: 700 } }, tr('ניוזלטר החלל השבועי', 'Weekly space newsletter')), h('span', { style: { fontSize: 13, color: MUTED } }, [tr('רקיע · הפורום הישראלי לחלל', 'Rakia · The Israeli Space Forum'), D.issue.range].filter(Boolean).join(' · '))),
          CFG.showQr && D.issue.url ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { fontSize: 11, color: MUTED, textAlign: EN() ? 'right' : 'left', lineHeight: 1.3 } }, tr('לגיליון', 'Full'), h('br'), tr('המלא', 'issue')),
            h('img', { src: qrData(D.issue.url), alt: 'QR', style: { width: 52, height: 52, borderRadius: 8, background: '#0b1430', padding: 3, border: '1px solid rgba(230,241,255,.25)' } })) : null),
        D.news.length ? this.featured(D, fIdx, fsec) : quiet(tr('הגיליון השבועי יופיע כאן אחרי שייקלט', 'The weekly issue will appear here once it is imported')),
        D.news.length ? this.newsList(D) : null);

      // A hidden side panel gives its column to the emblem.
      const main = h('main', { key: 'main', style: { display: 'grid', gridTemplateColumns: [right ? '470px' : '', 'minmax(0,1fr)', left ? '470px' : ''].filter(Boolean).join(' '), gap: 26, padding: '14px 36px 16px', minHeight: 0, position: 'relative', zIndex: 2 } }, right, center, left);

      const tickerBar = hidden('ticker') ? h('div', { key: 'tk' }) : h('div', { key: 'tk', 'data-w': 'ticker', style: Object.assign({ display: 'flex', alignItems: 'center', margin: '0 36px', borderRadius: 999, background: 'rgba(10,20,40,.72)', border: '1px solid rgba(150,190,240,.14)', position: 'relative', zIndex: 2, minWidth: 0, overflow: 'hidden' }, en('enUp', 1.2, 1.0)) },
        h('div', { style: { flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', height: '100%', [EN() ? 'borderRight' : 'borderLeft']: '1px solid rgba(150,190,240,.14)', fontSize: 15, fontWeight: 700 } }, tr('אירועים והזדמנויות', 'Events & opportunities')),
        D.ticker.length ? this.ticker(D) : quiet(tr('אין אירועים או הזדמנויות קרובים', 'No upcoming events or opportunities'), { padding: '0 26px' }));

      const launches = this.launchVals(D.launches, now).slice(0, 4).map((l, i) => h('div', { key: i, 'data-w': 'launch', style: { height: 84, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 14px', borderRadius: 22, background: 'linear-gradient(180deg,rgba(40,62,104,.38),rgba(12,22,44,.6))', border: `1px solid ${l.border}`, boxShadow: l.shadow, minWidth: 0 } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 500, color: l.statusColor, border: `1px solid ${l.statusColor}` } }, l.status),
            h('span', { dir: 'ltr', style: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: MUTED } }, l.when)),
          h('span', { style: { fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, l.mission),
          h('span', { style: { fontSize: 12, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, l.vehicle + ' · ' + l.site)),
        h('div', { dir: 'ltr', style: { display: 'flex', gap: 4, flex: 'none' } }, l.segs.map((s, j) => h('div', { key: j, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 34, padding: '5px 3px', borderRadius: 10, background: 'rgba(6,12,26,.7)', border: '1px solid rgba(150,190,240,.12)' } },
          h('span', { style: { fontFamily: "'Lexend',sans-serif", fontSize: 17, fontWeight: 400, color: l.numColor, lineHeight: 1.1 } }, s.v), h('span', { style: { fontSize: 10, color: '#6f82a6' } }, s.u))))));
      const footer = hidden('launches') ? h('div', { key: 'ft' }) : h('footer', { key: 'ft', 'data-w': 'launches', style: Object.assign({ display: 'grid', gridTemplateColumns: '150px repeat(4,minmax(0,1fr))', alignItems: 'center', gap: 16, padding: '12px 36px 16px', position: 'relative', zIndex: 2 }, en('enUp', 1.2, 1.15)) },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } }, h('span', { style: { fontSize: 18, fontWeight: 700 } }, tr('שיגורים קרובים', 'Upcoming launches')), h('span', { style: { fontSize: 12, color: MUTED } }, tr('שעון ישראל', 'Israel time') + ' · Launch Library')),
        launches.length ? launches : quiet(tr('אין כרגע נתוני שיגורים', 'No launch data right now'), { gridColumn: '2 / -1' }));

      return stage([h(React.Fragment, { key: 'amb' }, this.ambient()), header, main, tickerBar, footer]);
    }
    /** From the remote: the urgent banner on top, and brightness as a dimming layer over everything. */
    liveLayers() {
      const L = this.state.live, b = L ? Math.max(10, Math.min(100, Number(L.brightness) || 100)) : 100;
      return h(React.Fragment, { key: 'live' },
        L && L.urgent ? h('div', { key: 'urgent', style: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 70, padding: '19px 38px', background: '#b3261e', color: '#fff', fontSize: 36, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, boxShadow: '0 10px 40px rgba(0,0,0,.45)' } }, L.urgent) : null,
        b < 100 ? h('div', { key: 'dim', style: { position: 'absolute', inset: 0, zIndex: 80, background: '#000', opacity: (1 - b / 100).toFixed(2), pointerEvents: 'none', transition: 'opacity .6s ease' } }) : null);
    }
  }

  // ---- kiosk: full screen and the cursor ----------------------------------------------------------
  // Full screen needs a user gesture (the corner button, a double-click or F), so it is never asked for on load. It also
  // ends when the page reloads itself (a deploy, 04:00); F11 or a kiosk-mode browser keeps it. The button and the cursor
  // show while the mouse moves and go after three seconds still.
  const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function toggleFullscreen() {
    const d = document, el = d.documentElement, on = fsOn(), fn = on ? d.exitFullscreen || d.webkitExitFullscreen : el.requestFullscreen || el.webkitRequestFullscreen;
    try { const r = fn && fn.call(on ? d : el); if (r && r.catch) r.catch((e) => console.warn('fullscreen refused', e)); } catch (e) { console.warn('fullscreen refused', e); }
  }
  if (!CFG.preview) document.head.appendChild(Object.assign(document.createElement('style'), { textContent: 'html{-webkit-user-select:none;user-select:none}html.idle,html.idle *{cursor:none!important}' }));
  function ScreenControls() {
    const [awake, setAwake] = useState(false), [full, setFull] = useState(fsOn());
    useEffect(() => {
      let idle = 0, last = '';
      const wake = (e) => {
        if (e.type === 'mousemove') { const at = e.screenX + ',' + e.screenY; if (at === last) return; last = at; }   // Chrome repeats a move that did not happen
        setAwake(true); clearTimeout(idle); idle = setTimeout(() => setAwake(false), 3000);
      };
      const sync = () => setFull(fsOn());
      const dbl = (e) => { if (!(e.target.closest && e.target.closest('button'))) toggleFullscreen(); };
      const key = (e) => { if ((e.code === 'KeyF' || e.key === 'f' || e.key === 'F') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) toggleFullscreen(); };
      const on = [['mousemove', wake], ['pointerdown', wake], ['dblclick', dbl], ['keydown', key]], fsEvents = ['fullscreenchange', 'webkitfullscreenchange'];
      on.forEach(([t, f]) => addEventListener(t, f)); fsEvents.forEach((t) => document.addEventListener(t, sync));
      return () => { clearTimeout(idle); on.forEach(([t, f]) => removeEventListener(t, f)); fsEvents.forEach((t) => document.removeEventListener(t, sync)); document.documentElement.classList.remove('idle'); };
    }, []);
    useEffect(() => { document.documentElement.classList.toggle('idle', !awake); }, [awake]);
    const label = full ? tr('יציאה ממסך מלא', 'Exit full screen') : tr('מסך מלא', 'Full screen');
    return h('button', { type: 'button', dir: EN() ? 'ltr' : 'rtl', title: label, onClick: toggleFullscreen, style: { position: 'fixed', left: 24, bottom: 24, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px 10px 16px', borderRadius: 999, background: 'rgba(14,26,50,.88)', border: '1px solid rgba(150,190,240,.3)', boxShadow: '0 10px 30px rgba(0,0,0,.45)', color: '#e6f1ff', fontFamily: 'Heebo,system-ui,sans-serif', fontSize: 16, fontWeight: 500, cursor: 'pointer', opacity: awake ? 1 : 0, pointerEvents: awake ? 'auto' : 'none', transition: 'opacity .5s ease' } },
      h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: '#9fdcff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: full ? 'M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6' : 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6' })),
      label);
  }

  /** A render crash leaves a dark screen and reloads the page: after half a minute, then at most every five minutes. */
  class Guard extends React.Component {
    constructor(p) { super(p); this.state = { crashed: false }; }
    static getDerivedStateFromError() { return { crashed: true }; }
    componentDidCatch(e) { console.error('wall crashed', e); if (!this.retry) this.retry = setInterval(() => reloadPage(5 * 60e3), 30e3); }
    componentWillUnmount() { clearInterval(this.retry); }
    render() {
      return this.state.crashed ? h('div', { style: { position: 'fixed', inset: 0, background: '#040914', color: MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Heebo,system-ui,sans-serif', fontSize: 22 } }, tr('הצג יחזור בעוד רגע', 'Back in a moment')) : this.props.children;
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(Guard, null, h(Wall), CFG.preview ? null : h(ScreenControls)));
})();
