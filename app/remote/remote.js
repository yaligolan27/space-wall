// שלט צג החלל: the operators' remote control. A port of the Claude Design file "Space Wall Remote v2":
// the same layout, styles and flows, rendered with React (vendored UMD, no build) like the wall itself.
// Data and every change go through /api/remote (lib/remote-ops.ts); the wall picks changes up from /api/live.
// The agent panel hands requests to Claude, which edits the wall through the "צג חלל" connector (api/mcp.ts).
(() => {
  const h = React.createElement;

  // ---- tiny helpers: the design's inline style strings, verbatim ----------------------------------
  const styleCache = {};
  function S(str) {
    if (!str) return undefined;
    if (styleCache[str]) return styleCache[str];
    const o = {};
    str.split(';').forEach((decl) => {
      const i = decl.indexOf(':'); if (i < 0) return;
      const k = decl.slice(0, i).trim(), v = decl.slice(i + 1).trim(); if (!k) return;
      o[k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    });
    return (styleCache[str] = o);
  }
  const el = (tag, style, props, ...kids) => h(tag, Object.assign({ style: typeof style === 'string' ? S(style) : style }, props), ...kids);

  const ICE = '#9fdcff', LIME = '#d4f25c', WARM = '#e9b872', RED = '#ff7a6b', OFF = 'rgba(150,190,240,.2)';
  const PALETTE = ['#9fdcff', '#e9b872', '#d4f25c', '#c9a7ff', '#7fe0c4', '#f4b6c8'];
  const DOWS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const mmss = (sec) => pad(Math.floor(sec / 60)) + ':' + pad(Math.floor(sec % 60));
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const mdOf = (d) => pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dm = (s) => { const d = parse(s); return d.getDate() + '.' + (d.getMonth() + 1); };
  const toMin = (t) => { const [hh, mm] = (t || '0:0').split(':').map(Number); return hh * 60 + (mm || 0); };
  const initials = (n) => String(n || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  const hash = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0; return Math.abs(x); };

  const DESIGN0 = { noon: true, qr: true, feature: 12, list: 4, fx: true, globe: 90, globeStyle: 'holo', sway: true };
  const DEMO_OPTS = [['off', 'כבוי'], ['greeting', 'ברכה'], ['noon', 'מופע צהריים'], ['launch', 'שיגור']];
  const SPEC = [
    { title: 'הדגמה', controls: [{ key: 'demo', label: 'הדגמת רגע (בתצוגה המקדימה בלבד)', kind: 'select', options: DEMO_OPTS }] },
    { title: 'רגעים', controls: [{ key: 'noon', label: 'מופע צהריים אוטומטי ב-12:00', kind: 'toggle' }] },
    { title: 'תוכן', controls: [{ key: 'qr', label: 'קודי QR לכתבות', kind: 'toggle' }] },
    { title: 'תנועה', controls: [
      { key: 'feature', label: 'זמן לכתבה מרכזית', kind: 'slider', min: 6, max: 30, unit: 's' },
      { key: 'list', label: 'זמן לכל ידיעה ברשימה', kind: 'slider', min: 2, max: 10, unit: 's' },
      { key: 'fx', label: 'אפקטי רקע', kind: 'toggle' }] },
    { title: 'לוגו', controls: [
      { key: 'globe', label: 'זמן לסיבוב גלובוס', kind: 'slider', min: 20, max: 240, unit: 's' },
      { key: 'globeStyle', label: 'סגנון הגלובוס', kind: 'seg', options: [['holo', 'הולוגרפי'], ['real', 'ריאליסטי']] },
      { key: 'sway', label: 'תנועת מצלמה', kind: 'toggle' }] },
  ];
  const LABEL = Object.fromEntries(SPEC.flatMap((s) => s.controls).map((c) => [c.key, c.label]));
  const TYPE_CHIPS = ['חתונה', 'לידה', 'העלאה בדרגה', 'סיום תואר', 'שחרור', 'קליטה', 'אבל'];
  const SUGGESTIONS = ['מה מוצג עכשיו בצג?', 'לעומר לוי נולד בן, תציג ברכה', 'תעביר את התדריך של היום לשעה 16:00', 'תהפוך את הגלובוס לריאליסטי'];
  const CLAUDE_NEW = 'https://claude.ai/new';
  const CONNECTOR = 'צג חלל';

  function tpl(type) {
    const t = type || '';
    if (/אבל|צער|נפטר|נפטרה|מות/.test(t)) return { quiet: true, color: '#8b9dbd', head: 'משתתפים בצער' };
    if (/הולדת/.test(t)) return { color: WARM, head: 'יום הולדת שמח' };
    if (/חתונ|נישוא|אירוס/.test(t)) return { color: '#f4b6c8', head: 'מזל טוב לרגל החתונה' };
    if (/לידה|נולד/.test(t)) return { color: ICE, head: 'מזל טוב על הלידה' };
    if (/דרג|העלא/.test(t)) return { color: LIME, head: 'מזל טוב על הדרגה החדשה' };
    if (/שחרור|פרישה|פרידה/.test(t)) return { color: '#c9a7ff', head: 'תודה ובהצלחה בהמשך' };
    if (/קליטה|הצטרפ|חדש/.test(t)) return { color: '#7fe0c4', head: 'ברוכים הבאים' };
    return { color: '#c9a7ff', head: t ? 'מזל טוב · ' + t : 'מזל טוב' };
  }
  const dn = (p) => (p.rank ? p.rank + ' ' : '') + p.name;
  const pline = (p) => [p.role, p.unit].filter(Boolean).join(' · ');
  const colorFor = (p) => PALETTE[hash(p.id) % PALETTE.length];
  const imgEl = (src, style) => h('img', { src, alt: '', style });
  const COVER = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };

  const readAsDataURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  async function shrinkImage(file, max = 1024) {
    const img = await loadImg(await readAsDataURL(file));
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }
  let xlsxLoading = null;
  const loadXlsx = () => window.XLSX ? Promise.resolve() : (xlsxLoading = xlsxLoading || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  }));
  async function readSheet(file) {
    const n = file.name.toLowerCase();
    if (/\.(csv|txt|json|md)$/.test(n)) { const t = await file.text(); return { text: t, rows: t.split('\n').filter((l) => l.trim()).length }; }
    await loadXlsx();
    const wb = window.XLSX.read(await file.arrayBuffer(), { cellDates: true, dateNF: 'dd.mm.yyyy' });
    let text = '', rows = 0;
    wb.SheetNames.slice(0, 3).forEach((sn) => {
      const csv = window.XLSX.utils.sheet_to_csv(wb.Sheets[sn], { blankrows: false });
      rows += csv.split('\n').filter((l) => l.trim()).length;
      text += '# גיליון: ' + sn + '\n' + csv + '\n';
    });
    return { text, rows };
  }

  // ---- access: the private link /remote/?t=<REMOTE_TOKEN>, kept in this browser --------------------
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  (() => {
    const u = new URL(location.href), t = u.searchParams.get('t');
    if (t) { store.set('sw-remote-token', t); u.searchParams.delete('t'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
  })();

  async function api(method, body) {
    const res = await fetch('/api/remote', {
      method, cache: 'no-store',
      headers: Object.assign({ 'x-remote-token': store.get('sw-remote-token'), 'x-remote-who': encodeURIComponent(store.get('sw-remote-who')) }, body ? { 'content-type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) { const e = new Error('unauthorized'); e.auth = true; throw e; }
    if (!res.ok) throw new Error(j.error || 'הפעולה נכשלה');
    return j;
  }

  // ---- the remote ----------------------------------------------------------------------------------
  class Remote extends React.Component {
    constructor(p) {
      super(p);
      const who = store.get('sw-remote-who');
      this.state = {
        now: new Date(), vw: window.innerWidth, pw: 0,
        data: null, loadErr: '', auth: !!store.get('sw-remote-token'), who, whoDraft: '', tokenDraft: '',
        design: null, brightness: null,   // optimistic local values while a slider is being dragged
        demo: 'off',
        tab: 'today', studio: false, sheet: null, toast: null, nlBusy: false, photoBusy: false, busyAct: false,
        wallSrc: '',
        chatOpen: false, chatInput: '', attach: [], dragging: false,
        messages: [{ id: 1, role: 'bot', text: 'שלום' + (who ? ' ' + who : '') + '! כתבו כאן מה לשנות בצג, ואפתח את Claude עם הבקשה. Claude מחובר לצג דרך המחבר "' + CONNECTOR + '" ויכול להוסיף, לערוך ולמחוק כל דבר. אפשר לצרף אקסל ו-CSV; תמונות מצרפים שוב בחלון של Claude.', actions: [] }],
      };
      this.fileRef = React.createRef(); this.photoRef = React.createRef(); this.scrollRef = React.createRef(); this.previewRef = React.createRef();
      this.timers = {};
    }

    componentDidMount() {
      this.iv = setInterval(() => this.tick(), 1000);
      this.onR = () => this.setState({ vw: window.innerWidth });
      window.addEventListener('resize', this.onR);
      this.onVis = () => { if (!document.hidden) this.refresh(); };
      document.addEventListener('visibilitychange', this.onVis);
      if (this.state.auth) this.refresh();
      this.poll = setInterval(() => { if (!document.hidden && this.state.auth) this.refresh(); }, 15000);
      this.observe();
    }
    componentWillUnmount() {
      clearInterval(this.iv); clearInterval(this.poll); window.removeEventListener('resize', this.onR); document.removeEventListener('visibilitychange', this.onVis);
      if (this.ro) this.ro.disconnect(); clearTimeout(this.tt); clearTimeout(this.srcT); Object.values(this.timers).forEach((t) => clearTimeout(t.t));
    }
    observe() {
      const elx = this.previewRef.current;
      if (!elx || elx === this._obsEl) return;
      this._obsEl = elx;
      if (!this.ro) this.ro = new ResizeObserver((en) => { const w = Math.round(en[0].contentRect.width); if (w !== this.state.pw) this.setState({ pw: w }); });
      this.ro.disconnect(); this.ro.observe(elx);
    }
    componentDidUpdate() {
      this.observe();
      const src = this.buildSrc();
      if (src && src !== this._src) { this._src = src; clearTimeout(this.srcT); if (src !== this.state.wallSrc) this.srcT = setTimeout(() => this.setState({ wallSrc: src }), this.state.wallSrc ? 700 : 0); }
      const sig = this.state.messages.length + '|' + this.state.chatOpen;
      if (sig !== this._sig) { this._sig = sig; const e = this.scrollRef.current; if (e) e.scrollTop = e.scrollHeight; }
    }
    tick() {
      const n = new Date(), tk = this.state.data && this.state.data.takeover;
      this.setState({ now: n });
      if (tk && Date.parse(tk.until) <= n.getTime() && this._expId !== tk.id) { this._expId = tk.id; this.refresh(); }
    }

    // ---- server ----------------------------------------------------------------------------------
    async refresh() {
      try { const data = await api('GET'); this.setState({ data, loadErr: '' }); }
      catch (e) { if (e.auth) this.setState({ auth: false, data: null }); else this.setState({ loadErr: e.message || 'אין חיבור' }); }
    }
    /** Run an action; toast its label with an undo button. */
    async run(action, args, label, opts = {}) {
      this.setState({ busyAct: true });
      try {
        const j = await api('POST', Object.assign({ action }, args || {}));
        const top = j.state.history[0];
        this.setState({ data: j.state, loadErr: '' });
        if (!opts.quiet && label) this.toast(label, top && top.canRestore ? top.id : null);
        return j.result;
      } catch (e) {
        if (e.auth) this.setState({ auth: false, data: null });
        this.toast(e.message || 'הפעולה נכשלה');
        throw e;
      } finally { this.setState({ busyAct: false }); }
    }
    /** Sliders: show the value at once, send it when the hand stops. */
    burst(key, fn) { const t = this.timers[key] || (this.timers[key] = {}); clearTimeout(t.t); t.t = setTimeout(() => { delete this.timers[key]; fn(); }, 900); }
    toast(text, undoId) { clearTimeout(this.tt); this.setState({ toast: { text, undoId } }); this.tt = setTimeout(() => this.setState({ toast: null }), 4500); }
    async restore(id) {
      const r = await this.run('restore', { id }, null, { quiet: true }).catch(() => null);
      if (r) this.toast('בוטל: ' + r.label);
    }

    // ---- derived -----------------------------------------------------------------------------------
    get D() { return this.state.data; }
    design() { const D = this.D; return Object.assign({}, DESIGN0, D ? D.state.design : {}, this.state.design || {}); }
    buildSrc() {
      const D = this.D; if (!D) return '';
      const d = this.design();
      const q = new URLSearchParams({ noon: d.noon ? '1' : '0', qr: d.qr ? '1' : '0', feature: String(d.feature), list: String(d.list), fx: d.fx ? '1' : '0', globe: String(d.globe), globeStyle: d.globeStyle, sway: d.sway ? '1' : '0', preview: '1' });
      if (this.state.studio && this.state.demo !== 'off') q.set('demo', this.state.demo);
      if (D.config && D.config.displayKey) q.set('key', D.config.displayKey);
      return '/?' + q.toString();
    }
    P(id) { return this.D ? this.D.people.find((p) => p.id === id) : null; }
    avatar(p, src) {
      const photo = src || (p && p.photo) || null;
      return { bg: p ? colorFor(p) : 'rgba(150,190,240,.25)', ini: p ? initials(p.name) : '?', photoEl: photo ? imgEl(photo, COVER) : null };
    }
    celebs() {
      const D = this.D; if (!D) return [];
      const ti = iso(this.state.now), md0 = mdOf(this.state.now);
      const b = D.people.filter((p) => p.bday === md0).map((p) => ({ key: 'b' + p.id, person: p, type: 'יום הולדת', note: '', photoSrc: null, tpl: tpl('יום הולדת') }));
      const bdayToday = new Set(b.map((x) => x.person.id));
      const l = D.life.filter((x) => ti >= x.showFrom && ti <= x.showUntil && !(x.kind === 'birthday' && bdayToday.has(x.personId)))
        .map((x) => ({ key: x.id, lifeId: x.id, person: this.P(x.personId), type: x.type, note: x.note, photoSrc: x.photo === 'upload' ? x.photoSrc : null, noPhoto: x.photo === 'none', tpl: x.kind === 'bereavement' ? tpl('אבל') : tpl(x.type) }))
        .filter((x) => x.person);
      return [...b, ...l];
    }
    takeover() { const tk = this.D && this.D.takeover; return tk && Date.parse(tk.until) > this.state.now.getTime() ? tk : null; }
    tkTitle(tk) {
      if (!tk) return '';
      if (tk.kind === 'noon') return 'מופע הצהריים';
      if (tk.kind === 'event') return tk.title;
      return tpl(tk.type || (tk.person && tk.person.type)).head + (tk.person ? ' · ' + tk.person.name : '');
    }

    // ---- actions -----------------------------------------------------------------------------------
    openSheet(kind, f = {}, mode = 'add') { this.setState({ sheet: { kind, mode, f } }); }
    closeSheet() { this.setState({ sheet: null }); }
    setFV(obj) { this.setState((s) => (s.sheet ? { sheet: Object.assign({}, s.sheet, { f: Object.assign({}, s.sheet.f, obj) }) } : null)); }
    fv(k) { return (e) => this.setFV({ [k]: e.target.value }); }
    openLife(l) {
      const ti = iso(this.state.now);
      if (l) this.openSheet('life', Object.assign({}, l, { q: '' }), 'edit');
      else this.openSheet('life', { personId: '', q: '', type: '', date: ti, showFrom: ti, photo: 'crm', photoSrc: null, note: '' });
    }
    openEvent(e) {
      if (e) this.openSheet('event', Object.assign({}, e), 'edit');
      else this.openSheet('event', { title: '', date: iso(this.state.now), start: '10:00', end: '11:00', place: '', big: false });
    }
    showNoon() { this.run('noon', {}, 'הופעל מופע הצהריים').catch(() => {}); }
    showCeleb(x) { this.run('celebrate', { personId: x.person.id, lifeId: x.lifeId }, 'ברכה על כל המסך: ' + dn(x.person)).catch(() => {}); }
    showEvent(e) { this.run('showEvent', { eventId: e.id }, 'על כל המסך: ' + e.title).catch(() => {}); }
    endTk() { this.run('endTakeover', {}, 'חזרה לתצוגה רגילה').catch(() => {}); }
    async saveLife(showNow) {
      const sh = this.state.sheet, f = sh.f, per = this.P(f.personId);
      if (!per) return this.toast('בחרו את האדם');
      if (!(f.type || '').trim()) return this.toast('כתבו מה קרה');
      if (f.photo === 'upload' && !f.photoSrc) return this.toast('בחרו תמונה, או "מה-CRM"');
      const edit = sh.mode === 'edit';
      try {
        await this.run('saveLife', { id: edit ? f.id : undefined, personId: per.id, type: f.type.trim(), date: f.date, showFrom: f.showFrom || f.date, photo: f.photo, photoSrc: f.photo === 'upload' ? f.photoSrc : null, note: (f.note || '').trim(), showNow: !!showNow },
          (edit ? 'עודכן: ' : 'נוסף: ') + f.type.trim() + ' · ' + dn(per));
        this.closeSheet();
      } catch (e) { /* toasted */ }
    }
    async saveEvent() {
      const sh = this.state.sheet, f = sh.f;
      if (!(f.title || '').trim()) return this.toast('כתבו שם לאירוע');
      if (toMin(f.end) <= toMin(f.start)) return this.toast('שעת הסיום צריכה להיות אחרי שעת ההתחלה');
      const edit = sh.mode === 'edit';
      try {
        await this.run('saveEvent', { id: edit ? f.id : undefined, title: f.title.trim(), date: f.date, start: f.start, end: f.end, place: (f.place || '').trim(), big: !!f.big },
          (edit ? 'עודכן אירוע: ' : 'נוסף אירוע מנהלת: ') + f.title.trim());
        this.closeSheet();
      } catch (e) { /* toasted */ }
    }
    delLife(l) { const p = this.P(l.personId); this.run('deleteLife', { id: l.id }, 'נמחק: ' + l.type + (p ? ' · ' + dn(p) : '')).catch(() => {}); }
    delEvent(e) { return this.run('deleteEvent', { id: e.id }, 'נמחק אירוע: ' + e.title).catch(() => {}); }
    async importNl() {
      const url = ((this.state.sheet.f.url) || '').trim();
      if (!/^https?:\/\/\S+\.\S+/.test(url)) return this.toast('הדביקו קישור מלא, שמתחיל ב-https://');
      // Links to the newsletter site import here. For any other link, open the Claude tab now, inside the click,
      // so the browser doesn't block it; close it if the import worked here after all.
      const tab = /^https?:\/\/rakia-weekly\.vercel\.app(\/|$)/.test(url) ? null : window.open('about:blank', '_blank');
      this.setState({ nlBusy: true });
      try {
        const r = await this.run('newsletter', { url }, 'יובא גיליון הניוזלטר');
        if (r && r.handoff) {
          const prompt = 'דרך המחבר "' + CONNECTOR + '": ייבא/י לצג את גיליון הניוזלטר השבועי מהקישור הזה, עם import_newsletter_issue:\n' + url;
          if (tab) tab.location.href = CLAUDE_NEW + '?q=' + encodeURIComponent(prompt);
          this.toast('פתחתי את Claude עם הקישור. הייבוא יסתיים שם, והצג יתעדכן תוך דקה.');
        } else if (tab) tab.close();
        this.closeSheet();
      } catch (e) { if (tab) tab.close(); }
      finally { this.setState({ nlBusy: false }); }
    }
    setDesign(k, v, label) {
      this.setState((s) => ({ design: Object.assign({}, s.design || {}, { [k]: v }) }));
      this.run('design', { patch: { [k]: v }, label: LABEL[k] + ': ' + label }, LABEL[k] + ': ' + label).catch(() => {}).finally(() => this.setState({ design: null }));
    }
    slideDesign(k, v, unit) {
      this.setState((s) => ({ design: Object.assign({}, s.design || {}, { [k]: v }) }));
      this.burst('d' + k, () => this.run('design', { patch: { [k]: v }, label: LABEL[k] + ': ' + v + unit }, null, { quiet: true }).catch(() => {}).finally(() => this.setState({ design: null })));
    }

    // ---- agent panel → Claude ----------------------------------------------------------------------
    async addFiles(list) {
      for (const f of Array.from(list || [])) {
        try {
          if (f.type.startsWith('image/')) {
            const src = await shrinkImage(f, 512);
            this.setState((s) => ({ attach: [...s.attach, { id: 'a' + Date.now() + Math.random(), name: f.name, kind: 'image', src, info: 'תמונה · לצרף שוב ב-Claude' }] }));
          } else if (/\.(xlsx|xls|csv|txt|json|md)$/i.test(f.name)) {
            const { text, rows } = await readSheet(f);
            this.setState((s) => ({ attach: [...s.attach, { id: 'a' + Date.now() + Math.random(), name: f.name, kind: 'sheet', text, rows, info: rows + ' שורות' }] }));
          } else this.toast('סוג קובץ לא נתמך: ' + f.name);
        } catch (e) { this.toast('לא הצלחתי לקרוא את ' + f.name); }
      }
    }
    sendChat(override) {
      const s = this.state, text = (override != null ? override : s.chatInput).trim(), att = s.attach;
      if (!text && !att.length) return;
      let prompt = 'דרך המחבר "' + CONNECTOR + '" (התחל/י ב-wall_overview): ' + (text || 'עבד/י את הקבצים המצורפים ועדכן/י את הצג בהתאם.');
      const actions = ['נפתח ב-Claude עם המחבר "' + CONNECTOR + '"'];
      att.forEach((a) => {
        if (a.kind === 'sheet') { prompt += '\n\n[קובץ מצורף: ' + a.name + ' — ' + a.rows + ' שורות]\n' + a.text.slice(0, 15000); actions.push('הקובץ ' + a.name + ' צורף לבקשה כטקסט'); }
        if (a.kind === 'image') { prompt += '\n[תמונה: ' + a.name + ' — מצורפת בנפרד]'; actions.push('צרפו את התמונה ' + a.name + ' בחלון של Claude'); }
      });
      let url = CLAUDE_NEW + '?q=' + encodeURIComponent(prompt), copied = false;
      if (url.length > 7500) {   // too long for a link: copy it and open an empty chat
        try { navigator.clipboard.writeText(prompt); copied = true; } catch (e) { /* no clipboard */ }
        url = CLAUDE_NEW;
        actions.push(copied ? 'הבקשה ארוכה, אז העתקתי אותה: הדביקו בחלון של Claude' : 'הבקשה ארוכה מדי לקישור: קצרו אותה או צרפו את הקובץ ב-Claude');
      }
      const win = window.open(url, '_blank', 'noopener');
      const userMsg = { id: Date.now(), role: 'user', text, files: att.map((a) => ({ name: a.name, kind: a.kind, src: a.src, info: a.info })) };
      const reply = win === null && !copied
        ? { id: Date.now() + 1, role: 'bot', err: true, text: 'הדפדפן חסם את החלון. אפשרו חלונות קופצים לאתר הזה ונסו שוב.', actions: [] }
        : { id: Date.now() + 1, role: 'bot', text: 'פתחתי את Claude עם הבקשה. כשהשינוי יישמר שם, הוא יופיע כאן ובצג תוך דקה.', actions };
      this.setState({ messages: [...s.messages, userMsg, reply], chatInput: '', attach: [] });
    }

    // ---- view values (as in the design) ------------------------------------------------------------
    renderVals() {
      const s = this.state, D = this.D, now = s.now, ti = iso(now), nm = now.getHours() * 60 + now.getMinutes();
      const wide = s.vw >= 1180, narrow = !wide, small = s.vw < 700, two = s.vw >= 900;
      const sw = (on) => ({ j: on ? 'flex-end' : 'flex-start', tbg: on ? ICE : OFF });
      const seg = (on) => ({ bg: on ? ICE : 'transparent', fg: on ? '#040914' : '#e6f1ff' });
      const design = this.design(), noonToday = D ? D.state.noonToday : true;
      const brightness = s.brightness != null ? s.brightness : D ? D.state.brightness : 100;
      const urgent = D ? D.state.urgent : '';
      const all = this.celebs(), cel = all.filter((x) => !x.tpl.quiet), quiet = all.filter((x) => x.tpl.quiet);
      const celRow = (x) => ({ key: x.key, name: dn(x.person), type: x.type, color: x.tpl.color, av: this.avatar(x.person, x.noPhoto ? null : x.photoSrc),
        show: () => this.showCeleb(x), showClose: () => { this.showCeleb(x); this.closeSheet(); } });
      const tk = this.takeover(), tkK = tk ? tk.kind : '';
      const tkP = tk && tk.personId ? this.P(tk.personId) : null, tkT = tk && tk.kind === 'celebrate' ? tpl(tk.type || tk.person.type) : null;
      const remain = tk ? Math.max(0, (Date.parse(tk.until) - now.getTime()) / 1000) : 0;
      const t0 = tk ? (tk.kind === 'noon' ? Date.parse(tk.until) - 150e3 : Date.parse(tk.until) - 60e3) : 0;
      const sh = s.sheet, f = sh ? sh.f : {}, kind = sh ? sh.kind : '';
      const events = D ? D.events : [], life = D ? D.life : [], people = D ? D.people : [], history = D ? D.history : [];

      const todayEvents = events.filter((e) => e.date === ti).sort((a, b) => toMin(a.start) - toMin(b.start));
      const rows = todayEvents.map((e) => {
        const past = toMin(e.end) <= nm, live = tk && tk.eventId === e.id;
        return { key: e.id, m: toMin(e.start), time: e.start + '–' + e.end, title: e.title, op: past ? 0.45 : 1,
          sub: [e.place, past ? 'הסתיים' : (toMin(e.start) <= nm ? 'מתקיים עכשיו' : ''), e.big && !past ? 'יעלה לבד על כל המסך' : ''].filter(Boolean).join(' · '),
          hasBtn: !past, btn: live ? 'מוצג עכשיו' : 'על כל המסך', action: () => (live ? null : this.showEvent(e)), hasToggle: false };
      });
      const noonPast = nm >= 735, noonOn = design.noon && noonToday;
      rows.push(Object.assign({ key: 'noon', m: 720, time: '12:00', title: 'מופע הצהריים · סרטון התדמית', op: noonPast ? 0.45 : 1,
        sub: !design.noon ? 'כבוי בהגדרות העיצוב' : noonPast ? 'הסתיים להיום' : (noonToday ? 'יעלה לבד' : 'דילוג היום'),
        hasBtn: false, hasToggle: design.noon && !noonPast }, sw(noonOn), {
        toggle: () => this.run('noonToday', { on: !noonToday }, noonToday ? 'דילוג על מופע הצהריים היום' : 'מופע הצהריים יעלה היום').catch(() => {}) }));
      rows.sort((a, b) => a.m - b.m);

      const lim = iso(addDays(now, 21)), soon = [];
      events.filter((e) => e.date >= ti && e.date <= lim).forEach((e) => soon.push({ key: e.id, date: e.date, title: e.title, sub: e.start + '–' + e.end + (e.place ? ' · ' + e.place : '') + (e.big ? ' · חשוב' : ''), tag: 'אירוע מנהלת', tagColor: ICE, editable: true, edit: () => this.openEvent(e), del: () => this.delEvent(e) }));
      life.filter((l) => l.showUntil >= ti).forEach((l) => { const pp = this.P(l.personId); if (!pp) return; const tp = l.kind === 'bereavement' ? tpl('אבל') : tpl(l.type);
        soon.push({ key: l.id, date: l.date, title: dn(pp), sub: (l.note ? l.note + ' · ' : '') + (l.showFrom > ti ? 'יוצג החל מ-' + dm(l.showFrom) : (tp.quiet ? 'מוצג בשקט' : 'מוצג עכשיו')), tag: l.type, tagColor: tp.color, editable: true, edit: () => this.openLife(l), del: () => this.delLife(l) }); });
      people.forEach((pp) => { if (!pp.bday) return; let d = new Date(now.getFullYear(), +pp.bday.slice(0, 2) - 1, +pp.bday.slice(3)); if (iso(d) < ti) d = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
        if (iso(d) <= iso(addDays(now, 14))) soon.push({ key: 'b' + pp.id, date: iso(d), title: dn(pp), sub: 'אוטומטי מרשימת האנשים', tag: 'יום הולדת', tagColor: WARM, editable: false }); });
      soon.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const soonRows = soon.map((r) => { const d = parse(r.date); return Object.assign({}, r, { day: d.getDate(), dow: r.date === ti ? 'היום' : DOWS[d.getDay()] }); });

      const nextEv = todayEvents.find((e) => toMin(e.end) > nm);
      const nl = D && D.newsletter;
      const actGroups = [
        { title: 'להציג עכשיו על כל המסך', items: [
          { label: tkK === 'noon' ? 'עצירת המופע' : 'מופע הצהריים', sub: tkK === 'noon' ? 'מוצג עכשיו' : 'סרטון התדמית · עולה לבד ב-12:00', dot: LIME, bg: 'rgba(212,242,92,.09)', border: 'rgba(212,242,92,.4)', go: () => (tkK === 'noon' ? this.endTk() : this.showNoon()) },
          { label: 'ברכה', sub: cel.length ? 'היום: ' + dn(cel[0].person) + (cel.length > 1 ? ' ועוד ' + (cel.length - 1) : '') : 'אין ברכות היום', dot: WARM, bg: 'rgba(233,184,114,.09)', border: 'rgba(233,184,114,.4)', go: () => this.openSheet('celebrate') },
          { label: 'אירוע חשוב', sub: nextEv ? nextEv.title : 'בחירה מלוח האירועים', dot: ICE, bg: 'rgba(159,220,255,.09)', border: 'rgba(159,220,255,.4)', go: () => this.openSheet('eventShow') }] },
        { title: 'להוסיף לצג', items: [
          { label: 'שמחה או אירוע אישי', sub: 'חתונה, לידה, דרגה או כל דבר אחר', dot: '#f4b6c8', bg: 'rgba(14,28,58,.55)', border: 'rgba(150,190,240,.16)', go: () => this.openLife() },
          { label: 'אירוע מנהלת', sub: 'נכנס ללוח האירועים בצג', dot: ICE, bg: 'rgba(14,28,58,.55)', border: 'rgba(150,190,240,.16)', go: () => this.openEvent() },
          { label: 'ניוזלטר השבוע', sub: nl && nl.range ? 'בצג: ' + nl.range : 'עדיין לא יובא גיליון', dot: LIME, bg: 'rgba(14,28,58,.55)', border: 'rgba(150,190,240,.16)', go: () => this.openSheet('newsletter', { url: '' }) }] },
        { title: 'עוד', items: [
          { label: 'הודעה דחופה', sub: urgent ? 'משודרת עכשיו' : 'פס אדום בראש הצג', dot: RED, bg: 'rgba(14,28,58,.55)', border: urgent ? 'rgba(255,122,107,.5)' : 'rgba(150,190,240,.16)', go: () => this.openSheet('urgent', { text: '' }) },
          { label: 'עיצוב הצג', sub: 'גלובוס ' + (design.globeStyle === 'real' ? 'ריאליסטי' : 'הולוגרפי') + ' · אפקטים ' + (design.fx ? 'פעילים' : 'כבויים'), dot: '#c9a7ff', bg: 'rgba(14,28,58,.55)', border: 'rgba(150,190,240,.16)', go: () => this.setState({ studio: true, sheet: null }) }] },
      ];

      const lfP = this.P(f.personId), lfT = tpl(f.type), q = (f.q || '').trim();
      const lfSrc = f.photo === 'upload' ? f.photoSrc : null;
      const lfAvBase = lfP ? this.avatar(lfP, lfSrc) : { bg: 'rgba(150,190,240,.25)', ini: '?', photoEl: lfSrc ? imgEl(lfSrc, COVER) : null };
      const lfAv = f.photo === 'none' ? Object.assign({}, lfAvBase, { photoEl: null }) : lfAvBase;
      const lfW = f.date ? { from: f.showFrom || f.date, until: iso(addDays(parse(f.date), 10)) } : null;

      const evShowList = events.filter((e) => e.date > ti || (e.date === ti && toMin(e.end) > nm)).sort((a, b) => ((a.date + a.start) < (b.date + b.start) ? -1 : 1)).slice(0, 6);
      const last = history.find((x) => x.canRestore);
      const ago = (at) => { const d = new Date(at); return iso(d) === ti ? hhmm(d) : iso(d) === iso(addDays(now, -1)) ? 'אתמול' : d.getDate() + '.' + (d.getMonth() + 1); };
      const nlAt = (at) => { const d = new Date(at); return iso(d) === ti ? 'היום ב-' + hhmm(d) : iso(d) === iso(addDays(now, -1)) ? 'אתמול' : 'ב-' + d.getDate() + '.' + (d.getMonth() + 1); };

      return {
        rootCols: wide ? 'minmax(0,1fr) 400px' : 'minmax(0,1fr)',
        mainPad: wide ? '20px 24px 40px' : small ? '14px 12px 96px' : '18px 18px 96px',
        mainCols: s.studio ? (two ? 'minmax(0,1fr) minmax(300px,360px)' : 'minmax(0,1fr)') : (two ? 'minmax(0,1.1fr) minmax(0,1fr)' : 'minmax(0,1fr)'),
        statusLine: hhmm(now) + (s.loadErr ? ' · אין חיבור לצג, מנסה שוב' : D ? ' · מחובר לצג · שינויים עולים תוך דקה' : ' · מתחבר…'),
        statusDot: s.loadErr ? RED : LIME,
        opIni: (s.who || '?')[0], canUndo: !!last, lastLabel: last ? 'ביטול: ' + last.text : '', undoLast: () => last && this.restore(last.id),
        openHistory: () => this.openSheet('history'),

        tkOn: !!tk, tkTitle: this.tkTitle(tk), tkRemain: tk ? 'נותרו ' + mmss(remain) : '', endTk: () => this.endTk(),
        tkNoon: tkK === 'noon', tkCeleb: tkK === 'celebrate', tkEvent: tkK === 'event',
        tkPct: tk ? Math.max(0, Math.min(100, (now.getTime() - t0) / (Date.parse(tk.until) - t0) * 100)).toFixed(1) + '%' : '0%',
        tkAv: tkK === 'celebrate' ? { bg: tkP ? colorFor(tkP) : OFF, ini: initials(tkP ? tkP.name : tk.person.name), photoEl: tk.person.photo ? imgEl(tk.person.photo, COVER) : null } : { bg: OFF, ini: '', photoEl: null },
        tkColor: tkT ? tkT.color : ICE, tkHead: tkT ? tkT.head : '', tkName: tkK === 'celebrate' ? tk.person.name : '', tkLine: tkP ? pline(tkP) : '',
        tkMsg: tkK === 'celebrate' ? (tk.note || 'מאחלים המון אושר והצלחה — ממשפחת מנהלת החלל') : '',
        tkEvTitle: tkK === 'event' ? tk.title : '', tkEvMeta: tkK === 'event' ? tk.start + '–' + tk.end + (tk.place ? ' · ' + tk.place : '') : '',
        tkEvEnd: tkK === 'event' ? 'יורד לבד ב-' + hhmm(new Date(tk.until)) : '',
        urgentOn: !!urgent, urgentText: urgent, clearUr: () => this.run('urgent', { text: '' }, 'הוסרה ההודעה הדחופה').catch(() => {}),
        clearUrClose: () => { this.run('urgent', { text: '' }, 'הוסרה ההודעה הדחופה').catch(() => {}); this.closeSheet(); },

        nowLabel: tk ? this.tkTitle(tk) : (s.studio ? 'תצוגה מקדימה חיה' : 'תצוגה רגילה'),
        wallHref: '/' + (D && D.config && D.config.displayKey ? '?key=' + encodeURIComponent(D.config.displayKey) : ''), wallSrc: s.wallSrc, livePreview: !!s.wallSrc,
        previewTransform: 'scale(' + ((s.pw || 560) / 1920).toFixed(4) + ')',
        previewFilter: 'brightness(' + (brightness / 100).toFixed(2) + ')',
        brightness, setBrightness: (e) => { const v = +e.target.value; this.setState({ brightness: v }); this.burst('br', () => this.run('brightness', { value: v }, null, { quiet: true }).catch(() => {}).finally(() => this.setState({ brightness: null }))); },

        showToday: !s.studio,
        tabs: [['today', 'היום'], ['soon', 'אירועים קרובים']].map(([id, label]) => Object.assign({ id, label }, seg(s.tab === id), { pick: () => this.setState({ tab: id }) })),
        tabToday: s.tab === 'today', tabSoon: s.tab === 'soon',
        celebs: cel.map(celRow), hasCelebs: cel.length > 0, noCelebs: cel.length === 0,
        hasQuiet: quiet.length > 0, quietNames: quiet.map((x) => dn(x.person)).join(', '),
        todayRows: rows, soonRows, sheetUrl: D && D.config ? D.config.sheetUrl : '',

        showActions: !s.studio, actGroups, studio: s.studio,
        closeStudio: () => this.setState({ studio: false, demo: 'off' }),
        resetDesign: () => this.run('resetDesign', {}, 'העיצוב אופס לברירת המחדל').catch(() => {}),
        designSections: SPEC.map((sec) => ({ title: sec.title, controls: sec.controls.map((c) => {
          const v = c.key === 'demo' ? s.demo : design[c.key];
          return Object.assign({ key: c.key, label: c.label, kind: c.kind }, sw(!!v), { value: v, min: c.min, max: c.max, display: v + (c.unit || ''),
            toggle: () => this.setDesign(c.key, !v, !v ? 'פעיל' : 'כבוי'),
            set: (e) => { const nv = e.target.value;
              if (c.kind === 'slider') this.slideDesign(c.key, +nv, c.unit);
              else if (c.key === 'demo') this.setState({ demo: nv }); },
            options: (c.options || []).map(([ov, ol]) => Object.assign({ v: ov, label: ol }, seg(v === ov), { pick: () => v !== ov && this.setDesign(c.key, ov, ol) })) });
        }) })),

        narrow, showBottomBar: narrow && !s.chatOpen,
        agentPos: wide ? 'sticky' : 'fixed', agentSide: wide ? 'auto' : '0', agentH: wide ? '100vh' : 'auto', agentZ: wide ? '1' : '45',
        agentDisplay: wide || s.chatOpen ? 'flex' : 'none',
        openChat: () => this.setState({ chatOpen: true }), closeChat: () => this.setState({ chatOpen: false }),
        attachFromBar: () => { this.setState({ chatOpen: true }); if (this.fileRef.current) this.fileRef.current.click(); },
        pickFiles: () => this.fileRef.current && this.fileRef.current.click(),
        onChatFiles: (e) => { this.addFiles(e.target.files); e.target.value = ''; },
        msgs: s.messages.map((m) => Object.assign({}, m, { isUser: m.role === 'user', isBot: m.role === 'bot', hasText: !!m.text, color: m.err ? '#ffb4a8' : '#e6f1ff',
          hasActions: !!(m.actions && m.actions.length),
          files: (m.files || []).map((fl) => Object.assign({}, fl, { isImg: fl.kind === 'image', isDoc: fl.kind !== 'image', el: fl.src ? imgEl(fl.src, { display: 'block', maxWidth: 180, maxHeight: 120, borderRadius: 10, border: '1px solid rgba(150,190,240,.2)' }) : null })) })),
        showSuggest: s.messages.length <= 1,
        suggestions: SUGGESTIONS.map((label) => ({ label, send: () => this.sendChat(label) })),
        hasAttach: s.attach.length > 0,
        attachList: s.attach.map((a) => Object.assign({}, a, { isImg: a.kind === 'image', el: a.src ? imgEl(a.src, { width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }) : null, remove: () => this.setState((st) => ({ attach: st.attach.filter((x) => x.id !== a.id) })) })),
        chatInput: s.chatInput, setChatInput: (e) => this.setState({ chatInput: e.target.value }),
        chatKey: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendChat(); } },
        sendChat: () => this.sendChat(), sendBg: LIME,
        dragging: s.dragging,
        onDragOver: (e) => { e.preventDefault(); if (!s.dragging) this.setState({ dragging: true }); },
        onDragLeave: (e) => { if (e.currentTarget.contains(e.relatedTarget)) return; this.setState({ dragging: false }); },
        onDrop: (e) => { e.preventDefault(); this.setState({ dragging: false }); this.addFiles(e.dataTransfer.files); },

        sheetOn: !!sh, closeSheet: () => this.closeSheet(), sheetBackdrop: (e) => { if (e.target === e.currentTarget) this.closeSheet(); },
        sheetAlign: small ? 'flex-end' : 'center', sheetPad: small ? '0' : '24px', sheetRadius: small ? '20px 20px 0 0' : '20px', sheetMaxH: small ? '92vh' : '88vh',
        sheetTitle: { celebrate: 'ברכה על כל המסך', eventShow: 'אירוע חשוב על כל המסך', life: sh && sh.mode === 'edit' ? 'עריכת שמחה / אירוע אישי' : 'שמחה או אירוע אישי', event: sh && sh.mode === 'edit' ? 'עריכת אירוע מנהלת' : 'אירוע מנהלת חדש', newsletter: 'ניוזלטר השבוע', urgent: 'הודעה דחופה', history: 'היסטוריית שינויים' }[kind] || '',
        shCeleb: kind === 'celebrate', shEvShow: kind === 'eventShow', shLife: kind === 'life', shEvent: kind === 'event', shNl: kind === 'newsletter', shUrgent: kind === 'urgent', shHistory: kind === 'history',
        openLifeNew: () => this.openLife(), openEventNew: () => this.openEvent(),
        showEvents: evShowList.map((e) => { const live = tk && tk.eventId === e.id; const d = parse(e.date);
          return { key: e.id, title: e.title, when: (e.date === ti ? 'היום' : 'יום ' + DOWS[d.getDay()] + ' ' + dm(e.date)) + ' · ' + e.start + '–' + e.end + (e.place ? ' · ' + e.place : ''), btn: live ? 'מוצג עכשיו' : 'הצגה עכשיו', show: () => { if (!live) this.showEvent(e); this.closeSheet(); } }; }),
        noShowEvents: evShowList.length === 0,

        lfHasPerson: !!lfP, lfNoPerson: !lfP, lfName: lfP ? dn(lfP) : '', lfLine: lfP ? pline(lfP) : '', lfPersonAv: lfP ? this.avatar(lfP) : null,
        lfClearPerson: () => this.setFV({ personId: '' }),
        lfQ: f.q || '', setLfQ: this.fv('q'),
        lfMatches: people.filter((pp) => !q || [pp.name, pp.rank, pp.role, pp.unit].join(' ').includes(q)).slice(0, 6).map((pp) => ({ key: pp.id, name: dn(pp), line: pline(pp), av: this.avatar(pp), pick: () => this.setFV({ personId: pp.id, q: '' }) })),
        lfType: f.type || '', setLfType: this.fv('type'),
        typeChips: TYPE_CHIPS.map((t) => ({ label: t, border: f.type === t ? LIME : 'rgba(150,190,240,.22)', pick: () => this.setFV({ type: t }) })),
        lfDate: f.date || '', setLfDate: (e) => { const v = e.target.value; this.setFV(sh && sh.mode !== 'edit' && f.showFrom === f.date ? { date: v, showFrom: v < ti ? ti : v } : { date: v }); },
        lfShowFrom: f.showFrom || '', setLfShowFrom: this.fv('showFrom'),
        lfPhotoOpts: [['crm', 'מה-CRM'], ['upload', 'העלאה'], ['none', 'בלי תמונה']].map(([v, label]) => Object.assign({ v, label }, seg(f.photo === v), { pick: () => { this.setFV({ photo: v }); if (v === 'upload' && !f.photoSrc && this.photoRef.current) this.photoRef.current.click(); } })),
        lfIsUpload: f.photo === 'upload', lfIsCrm: f.photo === 'crm', lfHasSrc: !!f.photoSrc,
        lfThumbEl: f.photoSrc ? imgEl(f.photoSrc, { width: '100%', height: '100%', objectFit: 'cover' }) : null,
        lfPhotoBtn: s.photoBusy ? 'מעלה…' : f.photoSrc ? 'החלפת תמונה' : 'בחירת תמונה',
        pickPhoto: () => !s.photoBusy && this.photoRef.current && this.photoRef.current.click(),
        onPhotoFile: async (e) => {
          const fl = e.target.files[0]; e.target.value = ''; if (!fl) return;
          this.setState({ photoBusy: true });
          try { const dataUrl = await shrinkImage(fl); const r = await api('POST', { action: 'photo', dataUrl }); this.setFV({ photo: 'upload', photoSrc: r.result.url }); }
          catch (er) { this.toast(er.message && er.message !== 'unauthorized' ? er.message : 'לא הצלחתי להעלות את התמונה'); }
          finally { this.setState({ photoBusy: false }); }
        },
        lfNote: f.note || '', setLfNote: this.fv('note'),
        lfAv, lfShowAv: f.photo !== 'none', lfColor: lfT.color, lfHead: lfT.head, lfAvFilter: lfT.quiet ? 'grayscale(1)' : 'none',
        lfPName: lfP ? dn(lfP) : 'שם', lfPLine: lfP ? pline(lfP) : 'תפקיד · ענף', lfNameColor: lfT.quiet ? '#cfd8e6' : '#e6f1ff',
        lfPMsg: f.note || (lfT.quiet ? 'משפחת מנהלת החלל משתתפת בצערך' : 'מאחלים המון אושר והצלחה — ממשפחת מנהלת החלל'),
        lfPrevBg: lfT.quiet ? '#0b1120' : 'radial-gradient(circle at 50% 40%, #1b2f5c 0%, #040914 75%)',
        lfQuiet: !!lfT.quiet, lfNotQuiet: !lfT.quiet,
        lfWindow: lfW ? 'מוצג בפאנל האנשים מ-' + dm(lfW.from) + ' עד ' + dm(lfW.until) + ', ועולה על כל המסך כל חצי שעה' : '',
        lfSaveLabel: sh && sh.mode === 'edit' ? 'שמירת שינויים' : 'שמירה',
        saveLife: () => this.saveLife(false), saveLifeShow: () => this.saveLife(true),

        evTitle: f.title || '', setEvTitle: this.fv('title'), evDate: f.date || '', setEvDate: this.fv('date'),
        evStart: f.start || '', setEvStart: this.fv('start'), evEnd: f.end || '', setEvEnd: this.fv('end'),
        evPlace: f.place || '', setEvPlace: this.fv('place'),
        evBigJ: f.big ? 'flex-end' : 'flex-start', evBigBg: f.big ? ICE : OFF, toggleEvBig: () => this.setFV({ big: !f.big }),
        evIsEdit: sh && sh.mode === 'edit', evSaveLabel: sh && sh.mode === 'edit' ? 'שמירת שינויים' : 'שמירה',
        saveEvent: () => this.saveEvent(), deleteEvent: () => { const e = events.find((x) => x.id === f.id); if (e) this.delEvent(e); this.closeSheet(); },

        nlHas: !!(nl && nl.range), nlRange: nl ? nl.range : '', nlCount: nl ? nl.count : 0, nlAt: nl ? nlAt(nl.at) : '', nlUrl: nl ? nl.url : '',
        nlInput: f.url || '', setNlInput: this.fv('url'), importNl: () => !s.nlBusy && this.importNl(), nlBtn: s.nlBusy ? 'מייבא…' : 'ייבוא לצג',

        urInput: f.text || '', setUrInput: this.fv('text'),
        sendUr: () => { const t = (f.text || '').trim(); if (!t) return this.toast('כתבו את ההודעה'); this.run('urgent', { text: t }, 'שודרה הודעה דחופה').catch(() => {}); this.closeSheet(); },

        histRows: history.map((x) => ({ key: x.id, t: ago(x.at), who: x.who, text: x.text, canRestore: x.canRestore, restore: () => { this.restore(x.id); this.closeSheet(); } })),

        hasToast: !!s.toast, toastText: s.toast ? s.toast.text : '', toastUndo: !!(s.toast && s.toast.undoId),
        toastUndoFn: () => { if (s.toast && s.toast.undoId) { const id = s.toast.undoId; this.setState({ toast: null }); this.restore(id); } },
        toastBottom: narrow && !s.chatOpen ? '84px' : '24px',
      };
    }

    // ---- first run: the private link and the operator's name -----------------------------------------
    renderGate() {
      const s = this.state, needToken = !s.auth;
      const input = (value, onChange, placeholder, extra) => el('input', 'min-height:48px;box-sizing:border-box;width:100%;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:16px', Object.assign({ value, onChange, placeholder }, extra));
      const submit = () => {
        if (needToken) { const t = s.tokenDraft.trim(); if (!t) return; store.set('sw-remote-token', t); this.setState({ auth: true, tokenDraft: '' }, () => this.refresh()); }
        const w = s.whoDraft.trim();
        if (!s.who && w) { store.set('sw-remote-who', w); this.setState((st) => ({ who: w, messages: st.messages.map((m, i) => (i === 0 ? Object.assign({}, m, { text: m.text.replace(/^שלום!?/, 'שלום ' + w + '!') }) : m)) })); }
      };
      return el('div', 'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:radial-gradient(1200px 600px at 60% -10%, #0c1c3a 0%, #040914 60%)', { dir: 'rtl' },
        el('form', 'width:100%;max-width:420px;background:#0a1530;border:1px solid rgba(150,190,240,.2);border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:22px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box', { onSubmit: (e) => { e.preventDefault(); submit(); } },
          el('div', 'display:flex;align-items:center;gap:12px',
            el('img', 'width:42px;height:42px;border-radius:50%;background:#e6f1ff;object-fit:contain;padding:3px;box-sizing:border-box;flex:none', { src: '/assets/logo-mark.png', alt: '' }),
            el('h1', 'margin:0;font-size:20px;font-weight:800', null, 'שלט צג החלל')),
          needToken ? el('span', 'font-size:14px;color:#8b9dbd;text-wrap:pretty', null, 'פתחו את השלט מהקישור הפרטי שקיבלתם, או הדביקו כאן את קוד הגישה.') : null,
          needToken ? input(s.tokenDraft, (e) => this.setState({ tokenDraft: e.target.value }), 'קוד גישה', { dir: 'ltr', autoComplete: 'off' }) : null,
          !s.who ? el('span', 'font-size:14px;color:#8b9dbd', null, 'איך לקרוא לך? השם מופיע בהיסטוריית השינויים.') : null,
          !s.who ? input(s.whoDraft, (e) => this.setState({ whoDraft: e.target.value }), 'השם שלך', { maxLength: 40 }) : null,
          el('button', 'min-height:48px;border-radius:12px;border:none;background:#d4f25c;color:#0b1400;font-size:16px;font-weight:700;cursor:pointer', { type: 'submit' }, 'כניסה')));
    }

    // ---- the template ---------------------------------------------------------------------------------
    render() {
      const s = this.state;
      if (!s.auth || !s.who) return this.renderGate();
      const v = this.renderVals();
      const toggleBtn = (on, j, bg, onClick, label) => el('button', `flex:none;width:46px;height:26px;border-radius:13px;border:none;padding:3px;display:flex;justify-content:${j};background:${bg};cursor:pointer`, { onClick, 'aria-label': label }, el('span', 'width:20px;height:20px;border-radius:50%;background:#040914'));
      const avatarDiv = (size, font, av, extra) => el('div', `position:relative;flex:none;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;background:${av.bg};color:#040914;display:flex;align-items:center;justify-content:center;font-size:${font}px;font-weight:800${extra || ''}`, null, av.ini, av.photoEl);
      const field = 'min-height:44px;box-sizing:border-box;width:100%;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px';
      const dateField = 'min-height:44px;box-sizing:border-box;padding:0 10px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px;color-scheme:dark';
      const segWrap = (cols, kids) => el('div', `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:4px;padding:4px;border-radius:12px;background:rgba(4,9,20,.6);border:1px solid rgba(150,190,240,.1)`, null, kids);
      const section = (style, ...kids) => el('section', 'border-radius:20px;border:1px solid rgba(150,190,240,.14);background:rgba(14,28,58,.55);' + style, null, ...kids);

      // ---- header + banners
      const header = el('header', 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap', null,
        el('div', 'display:flex;align-items:center;gap:12px;min-width:0', null,
          el('img', 'width:42px;height:42px;border-radius:50%;background:#e6f1ff;object-fit:contain;padding:3px;box-sizing:border-box;flex:none', { src: '/assets/logo-mark.png', alt: '' }),
          el('div', 'display:flex;flex-direction:column;gap:1px;min-width:0', null,
            el('h1', 'margin:0;font-size:20px;font-weight:800', null, 'שלט צג החלל'),
            el('span', 'font-size:13px;color:#8b9dbd;display:flex;align-items:center;gap:6px', null, el('span', `width:7px;height:7px;border-radius:50%;background:${v.statusDot}`), v.statusLine))),
        el('div', 'display:flex;align-items:center;gap:8px', null,
          v.canUndo ? el('button', 'min-height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#e6f1ff;font-size:14px;cursor:pointer;white-space:nowrap', { onClick: v.undoLast, title: v.lastLabel }, '↶ ביטול') : null,
          el('button', 'min-height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#e6f1ff;font-size:14px;cursor:pointer;white-space:nowrap', { onClick: v.openHistory }, 'היסטוריה'),
          el('div', 'width:36px;height:36px;border-radius:50%;background:#e9b872;color:#040914;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex:none', { title: 'מחובר/ת: ' + s.who }, v.opIni)));
      const tkBanner = v.tkOn ? el('div', 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 12px 10px 16px;border-radius:14px;background:rgba(212,242,92,.08);border:1px solid rgba(212,242,92,.45)', null,
        el('div', 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0', null,
          el('span', 'width:9px;height:9px;border-radius:50%;background:#d4f25c;flex:none'),
          el('span', 'font-size:15px;font-weight:600', null, 'על כל המסך: ' + v.tkTitle),
          el('span', "font-family:'IBM Plex Mono',monospace;font-size:13px;color:#8b9dbd", null, v.tkRemain)),
        el('button', 'flex:none;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid rgba(212,242,92,.6);background:transparent;color:#d4f25c;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap', { onClick: v.endTk }, 'חזרה לתצוגה רגילה')) : null;
      const urBanner = v.urgentOn ? el('div', 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 12px 10px 16px;border-radius:14px;background:#3a0f14;border:1px solid #ff7a6b', null,
        el('div', 'display:flex;align-items:center;gap:10px;min-width:0', null, el('span', 'width:9px;height:9px;border-radius:50%;background:#ff7a6b;flex:none'), el('span', 'font-size:15px;font-weight:600', null, 'הודעה דחופה משודרת: ' + v.urgentText)),
        el('button', 'flex:none;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid #ff7a6b;background:transparent;color:#ffd6d0;font-size:14px;cursor:pointer;white-space:nowrap', { onClick: v.clearUr }, 'הסרה')) : null;

      // ---- now on the wall
      const preview = section('padding:14px;display:flex;flex-direction:column;gap:12px',
        el('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px', null,
          el('div', 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap', null, el('h2', 'margin:0;font-size:16px;font-weight:700', null, 'עכשיו בצג'), el('span', 'font-size:13px;color:#8b9dbd', null, v.nowLabel)),
          el('a', 'font-size:13px;white-space:nowrap', { href: v.wallHref, target: '_blank', rel: 'noopener' }, 'פתיחת הצג ↗')),
        el('div', 'position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;border:1px solid rgba(150,190,240,.14);container-type:inline-size;direction:ltr', { ref: this.previewRef },
          el('div', { position: 'absolute', inset: 0, filter: v.previewFilter }, null,
            el('img', 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover', { src: '/remote/wall.webp', alt: 'צג החלל' }),
            v.livePreview ? el('iframe', { position: 'absolute', top: 0, left: 0, width: 1920, height: 1080, border: 0, transform: v.previewTransform, transformOrigin: '0 0', pointerEvents: 'none' }, { src: v.wallSrc, title: 'צג החלל — תצוגה חיה', tabIndex: -1 }) : null,
            v.tkNoon ? el('div', 'position:absolute;inset:0;direction:rtl;background:#010307;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1cqw', null,
              el('span', "font-family:'IBM Plex Mono',monospace;font-size:2cqw;color:#d4f25c;letter-spacing:.12em", null, '12:00'),
              el('span', 'font-size:5.4cqw;font-weight:800', null, 'מופע הצהריים'),
              el('span', 'font-size:1.7cqw;color:#8b9dbd', null, 'סרטון התדמית · מנהלת החלל'),
              el('div', 'position:absolute;left:6cqw;right:6cqw;bottom:5cqw;height:.45cqw;border-radius:1cqw;background:rgba(150,190,240,.2);overflow:hidden', null, el('div', { height: '100%', width: v.tkPct, background: '#d4f25c' }))) : null,
            v.tkCeleb ? el('div', 'position:absolute;inset:0;direction:rtl;background:radial-gradient(circle at 50% 40%, #1b2f5c 0%, #040914 72%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8cqw;text-align:center;padding:4cqw;box-sizing:border-box', null,
              el('div', `position:relative;width:12cqw;height:12cqw;border-radius:50%;overflow:hidden;background:${v.tkAv.bg};color:#040914;display:flex;align-items:center;justify-content:center;font-size:4.2cqw;font-weight:800;box-shadow:0 0 0 .5cqw ${v.tkColor}`, null, v.tkAv.ini, v.tkAv.photoEl),
              el('span', `margin-top:1cqw;font-size:2.2cqw;font-weight:700;letter-spacing:.06em;color:${v.tkColor}`, null, v.tkHead),
              el('span', 'font-size:5.6cqw;font-weight:800;line-height:1.05', null, v.tkName),
              el('span', 'font-size:1.8cqw;color:#8b9dbd', null, v.tkLine),
              el('span', 'margin-top:.8cqw;font-size:2.3cqw;max-width:62cqw;text-wrap:balance', null, v.tkMsg)) : null,
            v.tkEvent ? el('div', 'position:absolute;inset:0;direction:rtl;background:linear-gradient(160deg,#0b1d42 0%,#040914 70%);display:flex;flex-direction:column;justify-content:center;gap:1.4cqw;padding:7cqw;box-sizing:border-box', null,
              el('span', 'font-size:2cqw;font-weight:700;color:#9fdcff;letter-spacing:.08em', null, 'עכשיו במנהלת'),
              el('span', 'font-size:5.6cqw;font-weight:800;line-height:1.1;text-wrap:balance', null, v.tkEvTitle),
              el('span', 'font-size:2.3cqw;color:#cfe0f7', null, v.tkEvMeta),
              el('span', 'position:absolute;bottom:4cqw;right:7cqw;font-size:1.5cqw;color:#8b9dbd', null, v.tkEvEnd)) : null,
            v.urgentOn ? el('div', 'position:absolute;top:0;left:0;right:0;direction:rtl;padding:1cqw 2cqw;background:#b3261e;color:#fff;font-size:1.9cqw;font-weight:700;text-align:center', null, v.urgentText) : null)),
        el('div', 'display:flex;align-items:center;gap:12px', null,
          el('span', 'font-size:14px;color:#8b9dbd;flex:none', null, 'בהירות'),
          el('input', 'flex:1;min-width:0;height:28px', { type: 'range', min: 10, max: 100, value: v.brightness, onChange: v.setBrightness, 'aria-label': 'בהירות' }),
          el('span', "font-family:'IBM Plex Mono',monospace;font-size:14px;width:44px;text-align:left;flex:none", null, v.brightness + '%')));

      // ---- today / upcoming
      const todayPanel = v.showToday ? section('padding:14px 16px;display:flex;flex-direction:column;gap:14px',
        segWrap(2, v.tabs.map((t) => el('button', `min-height:40px;border-radius:9px;border:none;background:${t.bg};color:${t.fg};font-size:15px;font-weight:700;cursor:pointer`, { key: t.id, onClick: t.pick }, t.label))),
        v.tabToday ? h(React.Fragment, null,
          el('div', 'display:flex;flex-direction:column;gap:10px', null,
            el('div', 'display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap', null,
              el('span', 'font-size:15px;font-weight:700', null, 'ברכות היום'),
              el('span', 'font-size:12px;color:#8b9dbd', null, 'עולות לבד על כל המסך כל :00 ו-:30 · לחיצה מציגה עכשיו')),
            v.hasCelebs ? el('div', 'display:flex;flex-wrap:wrap;gap:8px', null, v.celebs.map((c) =>
              el('button', 'display:flex;align-items:center;gap:8px;padding:5px 5px 5px 14px;border-radius:999px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.5);color:#e6f1ff;cursor:pointer;text-align:right', { key: c.key, onClick: c.show },
                avatarDiv(34, 13, c.av),
                el('div', 'display:flex;flex-direction:column;gap:0', null, el('span', 'font-size:14px;font-weight:600', null, c.name), el('span', `font-size:12px;color:${c.color}`, null, c.type))))) : null,
            v.noCelebs ? el('span', 'font-size:14px;color:#8b9dbd', null, 'אין ברכות היום') : null,
            v.hasQuiet ? el('span', 'font-size:13px;color:#8b9dbd', null, 'מוצג בשקט בפאנל האנשים: ' + v.quietNames) : null),
          el('div', 'display:flex;flex-direction:column', null,
            el('span', 'font-size:15px;font-weight:700;padding-bottom:6px', null, 'לוח הזמנים היום'),
            v.todayRows.map((r) => el('div', `display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(150,190,240,.08);opacity:${r.op}`, { key: r.key },
              el('span', "flex:none;width:96px;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#cfe0f7;direction:ltr;text-align:right", null, r.time),
              el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px', null, el('span', 'font-size:15px;font-weight:600;text-wrap:pretty', null, r.title), el('span', 'font-size:12px;color:#8b9dbd', null, r.sub)),
              r.hasBtn ? el('button', 'flex:none;min-height:36px;padding:0 12px;border-radius:10px;border:1px solid rgba(159,220,255,.4);background:transparent;color:#9fdcff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap', { onClick: r.action }, r.btn) : null,
              r.hasToggle ? toggleBtn(true, r.j, r.tbg, r.toggle, r.title) : null)))) : null,
        v.tabSoon ? el('div', 'display:flex;flex-direction:column', null,
          v.soonRows.length ? null : el('span', 'font-size:14px;color:#8b9dbd;padding:10px 0', null, 'אין אירועים בשלושת השבועות הקרובים'),
          v.soonRows.map((r) => el('div', 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(150,190,240,.08)', { key: r.key },
            el('div', 'flex:none;width:44px;height:44px;border-radius:10px;background:rgba(4,9,20,.6);border:1px solid rgba(150,190,240,.14);display:flex;flex-direction:column;align-items:center;justify-content:center', null,
              el('span', 'font-size:16px;font-weight:800;line-height:1', null, r.day), el('span', 'font-size:11px;color:#8b9dbd', null, r.dow)),
            el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px', null,
              el('span', 'font-size:15px;font-weight:600;text-wrap:pretty', null, r.title),
              el('div', 'display:flex;align-items:center;gap:8px;flex-wrap:wrap', null,
                el('span', `font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid ${r.tagColor};color:${r.tagColor}`, null, r.tag),
                el('span', 'font-size:12px;color:#8b9dbd', null, r.sub))),
            r.editable ? el('div', 'flex:none;display:flex;gap:6px', null,
              el('button', 'min-height:36px;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#e6f1ff;font-size:13px;cursor:pointer', { onClick: r.edit }, 'עריכה'),
              el('button', 'width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,122,107,.35);background:transparent;color:#ff7a6b;font-size:14px;cursor:pointer', { onClick: r.del, 'aria-label': 'מחיקה' }, '✕')) : null)),
          el('span', 'padding-top:12px;font-size:12px;color:#8b9dbd', null, 'ימי ההולדת והתמונות מגיעים מרשימת אנשי המנהלת. לשינוי פרטים של אדם, כתבו לסוכן.',
            v.sheetUrl ? h(React.Fragment, null, ' ', el('a', null, { href: v.sheetUrl, target: '_blank', rel: 'noopener' }, 'פתיחת הגיליון ↗')) : null)) : null) : null;

      // ---- actions / studio
      const actions = v.showActions ? v.actGroups.map((g) => el('div', 'display:flex;flex-direction:column;gap:8px', { key: g.title },
        el('span', 'font-size:13px;font-weight:600;color:#8b9dbd', null, g.title),
        el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px', null, g.items.map((a) =>
          el('button', `min-height:100px;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px;border-radius:16px;border:1px solid ${a.border};background:${a.bg};color:#e6f1ff;text-align:right;cursor:pointer;box-sizing:border-box`, { key: a.label, onClick: a.go, disabled: !this.D },
            el('span', `width:10px;height:10px;border-radius:50%;background:${a.dot}`),
            el('div', 'display:flex;flex-direction:column;gap:3px;align-items:flex-start', null,
              el('span', 'font-size:16px;font-weight:700', null, a.label),
              el('span', 'font-size:12.5px;color:#9fb1cf;line-height:1.35;text-wrap:pretty', null, a.sub))))))) : null;
      const studio = v.studio ? section('padding:16px;display:flex;flex-direction:column;gap:4px',
        el('div', 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding-bottom:8px', null,
          el('div', 'display:flex;flex-direction:column;gap:2px', null, el('h2', 'margin:0;font-size:19px;font-weight:800', null, 'עיצוב הצג'), el('span', 'font-size:13px;color:#8b9dbd', null, 'כל שינוי עולה לצג מיד, ואפשר לבטל')),
          el('div', 'display:flex;gap:6px;flex:none', null,
            el('button', 'min-height:38px;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.25);background:transparent;color:#e6f1ff;font-size:14px;cursor:pointer', { onClick: v.resetDesign }, 'איפוס'),
            el('button', 'min-height:38px;padding:0 16px;border-radius:10px;border:none;background:#d4f25c;color:#0b1400;font-size:14px;font-weight:700;cursor:pointer', { onClick: v.closeStudio }, 'סיום'))),
        v.designSections.map((sec) => el('div', 'display:flex;flex-direction:column;gap:12px;padding:12px 0;border-top:1px solid rgba(150,190,240,.1)', { key: sec.title },
          el('span', 'font-size:14px;font-weight:700;color:#9fdcff', null, sec.title),
          sec.controls.map((c) => el('div', 'display:flex;flex-direction:column;gap:8px', { key: c.key },
            el('div', 'display:flex;align-items:center;justify-content:space-between;gap:12px', null,
              el('div', 'display:flex;flex-direction:column;gap:1px;min-width:0', null, el('span', 'font-size:15px', null, c.label), el('span', "font-size:11px;color:#5d6f8f;font-family:'IBM Plex Mono',monospace", null, c.key)),
              c.kind === 'toggle' ? toggleBtn(true, c.j, c.tbg, c.toggle, c.label) : null,
              c.kind === 'slider' ? el('span', "font-family:'IBM Plex Mono',monospace;font-size:14px;flex:none", null, c.display) : null),
            c.kind === 'slider' ? el('input', 'width:100%;height:28px', { type: 'range', min: c.min, max: c.max, value: c.value, onChange: c.set, 'aria-label': c.label }) : null,
            c.kind === 'select' ? el('select', 'min-height:44px;padding:0 10px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px', { value: c.value, onChange: c.set },
              c.options.map((o) => el('option', null, { key: o.v, value: o.v }, o.label))) : null,
            c.kind === 'seg' ? segWrap(2, c.options.map((o) => el('button', `min-height:40px;border-radius:9px;border:none;background:${o.bg};color:${o.fg};font-size:15px;font-weight:600;cursor:pointer`, { key: o.v, onClick: o.pick }, o.label))) : null))))) : null;

      // ---- agent panel
      const agent = el('aside', { position: v.agentPos, top: 0, left: v.agentSide, right: v.agentSide, bottom: v.agentSide, height: v.agentH, zIndex: v.agentZ, display: v.agentDisplay, flexDirection: 'column', background: '#081127', borderRight: '1px solid rgba(150,190,240,.14)', boxSizing: 'border-box' },
        { onDragOver: v.onDragOver, onDragLeave: v.onDragLeave, onDrop: v.onDrop },
        el('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid rgba(150,190,240,.12)', null,
          el('div', 'display:flex;flex-direction:column;gap:2px', null,
            el('span', 'font-size:17px;font-weight:800', null, 'סוכן הצג'),
            el('span', 'font-size:12px;color:#8b9dbd', null, 'כתבו מה לשנות, כל דבר בצג · נפתח ב-Claude עם המחבר "' + CONNECTOR + '"')),
          v.narrow ? el('button', 'width:40px;height:40px;border-radius:10px;border:none;background:rgba(150,190,240,.08);color:#8b9dbd;font-size:16px;cursor:pointer', { onClick: v.closeChat, 'aria-label': 'סגירה' }, '✕') : null),
        el('div', 'flex:1;min-height:0;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:14px', { ref: this.scrollRef },
          v.msgs.map((m) => el('div', 'display:flex;flex-direction:column;gap:6px', { key: m.id },
            m.isUser ? el('div', 'align-self:flex-end;max-width:88%;display:flex;flex-direction:column;gap:6px;align-items:flex-end', null,
              m.files.map((fl, i) => el('div', null, { key: i },
                fl.isImg ? fl.el : null,
                fl.isDoc ? el('div', 'display:flex;flex-direction:column;gap:1px;padding:8px 12px;border-radius:10px;background:rgba(212,242,92,.08);border:1px solid rgba(212,242,92,.3)', null, el('span', 'font-size:13px;font-weight:600;direction:ltr', null, fl.name), el('span', 'font-size:11px;color:#8b9dbd', null, fl.info)) : null)),
              m.hasText ? el('div', 'padding:10px 14px;border-radius:14px;background:rgba(159,220,255,.14);font-size:15px;line-height:1.5;white-space:pre-wrap;text-wrap:pretty', null, m.text) : null) : null,
            m.isBot ? el('div', 'display:flex;flex-direction:column;gap:8px;max-width:95%', null,
              el('div', `font-size:15px;line-height:1.55;white-space:pre-wrap;text-wrap:pretty;color:${m.color}`, null, m.text),
              m.hasActions ? el('div', 'display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:12px;background:rgba(4,9,20,.6);border:1px solid rgba(150,190,240,.12)', null,
                m.actions.map((a, i) => el('div', 'display:flex;align-items:baseline;gap:8px;font-size:13px;color:#b9c8e2', { key: i }, el('span', 'flex:none;width:6px;height:6px;border-radius:50%;background:#d4f25c;transform:translateY(-1px)'), el('span', null, null, a)))) : null) : null)),
          v.showSuggest ? el('div', 'display:flex;flex-wrap:wrap;gap:6px', null, v.suggestions.map((sg) =>
            el('button', 'min-height:34px;padding:6px 12px;line-height:1.35;border-radius:999px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#cfe0f7;font-size:13px;cursor:pointer;text-align:right', { key: sg.label, onClick: sg.send }, sg.label))) : null),
        v.hasAttach ? el('div', 'display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px 0', null, v.attachList.map((at) =>
          el('div', 'display:flex;align-items:center;gap:8px;padding:4px 4px 4px 10px;border-radius:10px;background:rgba(159,220,255,.1);border:1px solid rgba(159,220,255,.25);max-width:100%', { key: at.id },
            at.isImg ? at.el : null,
            el('div', 'display:flex;flex-direction:column;min-width:0', null, el('span', 'font-size:12px;font-weight:600;direction:ltr;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px', null, at.name), el('span', 'font-size:11px;color:#8b9dbd', null, at.info)),
            el('button', 'width:24px;height:24px;border-radius:6px;border:none;background:transparent;color:#8b9dbd;font-size:12px;cursor:pointer', { onClick: at.remove, 'aria-label': 'הסרה' }, '✕')))) : null,
        el('div', 'display:flex;align-items:flex-end;gap:8px;padding:12px 18px 18px', null,
          el('button', 'flex:none;width:44px;height:44px;border-radius:12px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#9fdcff;font-size:22px;line-height:1;cursor:pointer', { onClick: v.pickFiles, 'aria-label': 'צירוף קובץ', title: 'צירוף אקסל, CSV או תמונה' }, '+'),
          el('textarea', 'flex:1;min-width:0;min-height:44px;max-height:140px;overflow:hidden;resize:none;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid rgba(150,190,240,.22);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px;line-height:1.45', { value: v.chatInput, onChange: v.setChatInput, onKeyDown: v.chatKey, rows: 1, placeholder: 'מה לשנות בצג?' }),
          el('button', `flex:none;min-width:64px;height:44px;padding:0 14px;border-radius:12px;border:none;background:${v.sendBg};color:#0b1400;font-size:15px;font-weight:800;cursor:pointer`, { onClick: v.sendChat }, 'שליחה')),
        v.dragging ? el('div', 'position:absolute;inset:8px;border-radius:16px;border:2px dashed #d4f25c;background:rgba(4,9,20,.88);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#d4f25c;pointer-events:none', null, 'שחררו כדי לצרף') : null);

      // ---- sheets
      const sheet = v.sheetOn ? el('div', { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(1,3,10,.7)', display: 'flex', alignItems: v.sheetAlign, justifyContent: 'center', padding: v.sheetPad, boxSizing: 'border-box' }, { dir: 'rtl', onClick: v.sheetBackdrop },
        el('div', { width: '100%', maxWidth: 560, maxHeight: v.sheetMaxH, overflowY: 'auto', background: '#0a1530', border: '1px solid rgba(150,190,240,.2)', borderRadius: v.sheetRadius, boxShadow: '0 24px 70px rgba(0,0,0,.6)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box' }, { role: 'dialog', 'aria-label': v.sheetTitle },
          el('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px', null,
            el('h2', 'margin:0;font-size:19px;font-weight:800', null, v.sheetTitle),
            el('button', 'flex:none;width:40px;height:40px;border-radius:10px;border:none;background:rgba(150,190,240,.08);color:#8b9dbd;font-size:16px;cursor:pointer', { onClick: v.closeSheet, 'aria-label': 'סגירה' }, '✕')),
          v.shCeleb ? h(React.Fragment, null,
            el('span', 'font-size:14px;color:#8b9dbd;text-wrap:pretty', null, 'הברכה עולה על כל המסך לדקה, ואז הצג חוזר לתצוגה הרגילה.'),
            el('div', 'display:flex;flex-direction:column;gap:8px', null, v.celebs.map((c) =>
              el('button', 'display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;border:1px solid rgba(150,190,240,.14);background:rgba(4,9,20,.5);color:#e6f1ff;cursor:pointer;text-align:right', { key: c.key, onClick: c.showClose },
                avatarDiv(46, 16, c.av),
                el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px', null, el('span', 'font-size:16px;font-weight:600', null, c.name), el('span', `font-size:13px;color:${c.color}`, null, c.type)),
                el('span', 'flex:none;font-size:14px;font-weight:700;color:#d4f25c', null, 'הצגה')))),
            v.noCelebs ? el('span', 'font-size:14px;color:#8b9dbd', null, 'אין ברכות פעילות היום.') : null,
            el('button', 'min-height:44px;border-radius:12px;border:1px dashed rgba(159,220,255,.35);background:transparent;color:#9fdcff;font-size:15px;cursor:pointer', { onClick: v.openLifeNew }, '+ אירוע אישי חדש')) : null,
          v.shEvShow ? h(React.Fragment, null,
            el('span', 'font-size:14px;color:#8b9dbd;text-wrap:pretty', null, 'האירוע עולה על כל המסך ויורד לבד כשהוא מסתיים לפי היומן.'),
            el('div', 'display:flex;flex-direction:column;gap:8px', null, v.showEvents.map((e) =>
              el('div', 'display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;border:1px solid rgba(150,190,240,.14);background:rgba(4,9,20,.5)', { key: e.key },
                el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px', null, el('span', 'font-size:16px;font-weight:600;text-wrap:pretty', null, e.title), el('span', 'font-size:13px;color:#8b9dbd', null, e.when)),
                el('button', 'flex:none;min-height:40px;padding:0 14px;border-radius:10px;border:none;background:#9fdcff;color:#040914;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap', { onClick: e.show }, e.btn)))),
            v.noShowEvents ? el('span', 'font-size:14px;color:#8b9dbd', null, 'אין אירועים קרובים ביומן.') : null,
            el('button', 'min-height:44px;border-radius:12px;border:1px dashed rgba(159,220,255,.35);background:transparent;color:#9fdcff;font-size:15px;cursor:pointer', { onClick: v.openEventNew }, '+ אירוע מנהלת חדש')) : null,
          v.shLife ? h(React.Fragment, null,
            el('div', 'display:flex;flex-direction:column;gap:6px', null,
              el('span', 'font-size:13px;color:#8b9dbd', null, 'מי?'),
              v.lfHasPerson ? el('div', 'display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;border:1px solid rgba(212,242,92,.4);background:rgba(212,242,92,.05)', null,
                avatarDiv(44, 15, v.lfPersonAv),
                el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px', null, el('span', 'font-size:16px;font-weight:600', null, v.lfName), el('span', 'font-size:13px;color:#8b9dbd', null, v.lfLine)),
                el('button', 'flex:none;min-height:36px;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#e6f1ff;font-size:13px;cursor:pointer', { onClick: v.lfClearPerson }, 'החלפה')) : null,
              v.lfNoPerson ? h(React.Fragment, null,
                el('input', field, { value: v.lfQ, onChange: v.setLfQ, placeholder: 'חיפוש לפי שם, ענף או תפקיד', autoFocus: true }),
                el('div', 'display:flex;flex-direction:column;gap:4px', null, v.lfMatches.map((m) =>
                  el('button', 'display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:10px;border:none;background:transparent;color:#e6f1ff;cursor:pointer;text-align:right', { key: m.key, onClick: m.pick, className: 'sw-hover' },
                    avatarDiv(34, 12, m.av),
                    el('div', 'display:flex;flex-direction:column;gap:0;min-width:0', null, el('span', 'font-size:15px;font-weight:600', null, m.name), el('span', 'font-size:12px;color:#8b9dbd', null, m.line)))))) : null),
            el('div', 'display:flex;flex-direction:column;gap:8px', null,
              el('span', 'font-size:13px;color:#8b9dbd', null, 'מה קרה?'),
              el('input', field, { value: v.lfType, onChange: v.setLfType, placeholder: 'כתבו בחופשיות, למשל: נולד בן', maxLength: 40 }),
              el('div', 'display:flex;flex-wrap:wrap;gap:6px', null, v.typeChips.map((t) =>
                el('button', `min-height:32px;padding:0 12px;border-radius:999px;border:1px solid ${t.border};background:transparent;color:#cfe0f7;font-size:13px;cursor:pointer`, { key: t.label, onClick: t.pick }, t.label)))),
            el('div', 'display:flex;gap:10px;flex-wrap:wrap', null,
              el('label', 'flex:1;min-width:140px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#8b9dbd', null, 'תאריך האירוע', el('input', dateField, { type: 'date', value: v.lfDate, onChange: v.setLfDate })),
              el('label', 'flex:1;min-width:140px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#8b9dbd', null, 'להתחיל להציג ב-', el('input', dateField, { type: 'date', value: v.lfShowFrom, onChange: v.setLfShowFrom }))),
            el('div', 'display:flex;flex-direction:column;gap:8px', null,
              el('span', 'font-size:13px;color:#8b9dbd', null, 'תמונה'),
              segWrap(3, v.lfPhotoOpts.map((o) => el('button', `min-height:40px;border-radius:9px;border:none;background:${o.bg};color:${o.fg};font-size:14px;font-weight:600;cursor:pointer`, { key: o.v, onClick: o.pick }, o.label))),
              v.lfIsUpload ? el('div', 'display:flex;align-items:center;gap:10px', null,
                v.lfHasSrc ? el('div', 'flex:none;width:56px;height:56px;border-radius:10px;overflow:hidden;position:relative;background:#000', null, v.lfThumbEl) : null,
                el('button', 'min-height:40px;padding:0 14px;border-radius:10px;border:1px dashed rgba(159,220,255,.4);background:transparent;color:#9fdcff;font-size:14px;cursor:pointer', { onClick: v.pickPhoto }, v.lfPhotoBtn)) : null,
              v.lfIsCrm ? el('span', 'font-size:12px;color:#8b9dbd', null, 'תמונת הפרופיל נשלפת מרשימת האנשים. אם אין תמונה, יוצגו ראשי תיבות.') : null),
            el('input', field, { value: v.lfNote, onChange: v.setLfNote, placeholder: 'ברכה אישית (לא חובה)', maxLength: 120 }),
            el('div', 'display:flex;flex-direction:column;gap:6px', null,
              el('span', 'font-size:13px;color:#8b9dbd', null, 'כך זה ייראה בצג'),
              el('div', { position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(150,190,240,.14)', containerType: 'inline-size', background: v.lfPrevBg }, null,
                el('div', 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.4cqw;text-align:center;padding:5cqw;box-sizing:border-box', null,
                  v.lfShowAv ? el('div', `position:relative;width:15cqw;height:15cqw;border-radius:50%;overflow:hidden;background:${v.lfAv.bg};color:#040914;display:flex;align-items:center;justify-content:center;font-size:5cqw;font-weight:800;box-shadow:0 0 0 .7cqw ${v.lfColor};filter:${v.lfAvFilter}`, null, v.lfAv.ini, v.lfAv.photoEl) : null,
                  el('span', `margin-top:1cqw;font-size:3cqw;font-weight:700;letter-spacing:.05em;color:${v.lfColor}`, null, v.lfHead),
                  el('span', `font-size:7cqw;font-weight:800;line-height:1.05;color:${v.lfNameColor}`, null, v.lfPName),
                  el('span', 'font-size:2.6cqw;color:#8b9dbd', null, v.lfPLine),
                  el('span', 'font-size:3.2cqw;max-width:80cqw;text-wrap:balance;color:#cfe0f7', null, v.lfPMsg))),
              v.lfQuiet ? el('span', 'font-size:13px;color:#8b9dbd', null, 'תבנית שקטה: מוצג רק בפאנל האנשים, לא על כל המסך.') : null,
              v.lfNotQuiet ? el('span', 'font-size:13px;color:#8b9dbd', null, v.lfWindow) : null),
            el('div', 'display:flex;gap:8px;flex-wrap:wrap', null,
              el('button', 'flex:1;min-width:140px;min-height:48px;border-radius:12px;border:none;background:#d4f25c;color:#0b1400;font-size:16px;font-weight:700;cursor:pointer', { onClick: v.saveLife, disabled: s.busyAct || s.photoBusy }, v.lfSaveLabel),
              v.lfNotQuiet ? el('button', 'flex:1;min-width:140px;min-height:48px;border-radius:12px;border:1px solid rgba(212,242,92,.5);background:transparent;color:#d4f25c;font-size:16px;font-weight:700;cursor:pointer', { onClick: v.saveLifeShow, disabled: s.busyAct || s.photoBusy }, 'שמירה והצגה עכשיו') : null)) : null,
          v.shEvent ? h(React.Fragment, null,
            el('input', 'min-height:48px;box-sizing:border-box;width:100%;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:16px', { value: v.evTitle, onChange: v.setEvTitle, placeholder: 'שם האירוע, למשל: ביקור משלחת מיפן', maxLength: 80 }),
            el('div', 'display:flex;gap:10px;flex-wrap:wrap', null,
              el('label', 'flex:2;min-width:150px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#8b9dbd', null, 'תאריך', el('input', dateField, { type: 'date', value: v.evDate, onChange: v.setEvDate })),
              el('label', 'flex:1;min-width:100px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#8b9dbd', null, 'מ-', el('input', dateField, { type: 'time', value: v.evStart, onChange: v.setEvStart })),
              el('label', 'flex:1;min-width:100px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#8b9dbd', null, 'עד', el('input', dateField, { type: 'time', value: v.evEnd, onChange: v.setEvEnd }))),
            el('input', field, { value: v.evPlace, onChange: v.setEvPlace, placeholder: 'מקום, למשל: אולם א׳', maxLength: 60 }),
            el('div', 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-radius:14px;background:rgba(4,9,20,.5);border:1px solid rgba(150,190,240,.12)', null,
              el('div', 'display:flex;flex-direction:column;gap:2px', null, el('span', 'font-size:15px;font-weight:600', null, 'אירוע חשוב'), el('span', 'font-size:13px;color:#8b9dbd;text-wrap:pretty', null, 'עולה לבד על כל המסך כשהוא מתחיל, ויורד כשהוא נגמר')),
              toggleBtn(true, v.evBigJ, v.evBigBg, v.toggleEvBig, 'אירוע חשוב')),
            el('div', 'display:flex;gap:8px;flex-wrap:wrap', null,
              el('button', 'flex:1;min-width:140px;min-height:48px;border-radius:12px;border:none;background:#d4f25c;color:#0b1400;font-size:16px;font-weight:700;cursor:pointer', { onClick: v.saveEvent, disabled: s.busyAct }, v.evSaveLabel),
              v.evIsEdit ? el('button', 'min-height:48px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,122,107,.5);background:transparent;color:#ff7a6b;font-size:15px;cursor:pointer', { onClick: v.deleteEvent }, 'מחיקה') : null)) : null,
          v.shNl ? h(React.Fragment, null,
            v.nlHas ? el('div', 'display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:14px;background:rgba(4,9,20,.5);border:1px solid rgba(150,190,240,.12)', null,
              el('span', 'font-size:12px;color:#9fdcff;font-weight:600', null, 'בצג עכשיו'),
              el('span', 'font-size:16px;font-weight:700', null, 'גיליון ' + v.nlRange + ' · ' + v.nlCount + ' כתבות'),
              el('span', 'font-size:13px;color:#8b9dbd', null, 'יובא ' + v.nlAt + ' · ', el('a', null, { href: v.nlUrl, target: '_blank', rel: 'noopener' }, 'לדף הגיליון ↗'))) : null,
            el('div', 'display:flex;flex-direction:column;gap:6px', null,
              el('span', 'font-size:13px;color:#8b9dbd', null, 'קישור לגיליון החדש'),
              el('input', 'min-height:48px;box-sizing:border-box;width:100%;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px;text-align:left', { value: v.nlInput, onChange: v.setNlInput, placeholder: 'https://…', dir: 'ltr', type: 'url' }),
              el('span', 'font-size:12px;color:#8b9dbd', null, 'הכתבות, האירועים וקודי ה-QR נשאבים מהדף. גיליון חדש מיובא גם לבד כל בוקר.')),
            el('button', 'min-height:48px;border-radius:12px;border:none;background:#d4f25c;color:#0b1400;font-size:16px;font-weight:700;cursor:pointer', { onClick: v.importNl }, v.nlBtn)) : null,
          v.shUrgent ? h(React.Fragment, null,
            el('span', 'font-size:14px;color:#8b9dbd', null, 'פס אדום בראש הצג, עד שמסירים אותו.'),
            el('textarea', 'resize:vertical;box-sizing:border-box;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px;line-height:1.5', { value: v.urInput, onChange: v.setUrInput, rows: 3, maxLength: 200, placeholder: 'לדוגמה: תרגיל פינוי ב-11:00, נא להתכנס ברחבה' }),
            el('div', 'display:flex;gap:8px;flex-wrap:wrap', null,
              el('button', 'flex:1;min-width:140px;min-height:48px;border-radius:12px;border:none;background:#ff7a6b;color:#1a0406;font-size:16px;font-weight:700;cursor:pointer', { onClick: v.sendUr }, 'שידור לצג'),
              v.urgentOn ? el('button', 'min-height:48px;padding:0 18px;border-radius:12px;border:1px solid rgba(150,190,240,.25);background:transparent;color:#e6f1ff;font-size:15px;cursor:pointer', { onClick: v.clearUrClose }, 'הסרת ההודעה הנוכחית') : null)) : null,
          v.shHistory ? h(React.Fragment, null,
            el('span', 'font-size:13px;color:#8b9dbd;text-wrap:pretty', null, 'שחזור מבטל את הפעולה ואת כל מה שנעשה אחריה.'),
            el('div', 'display:flex;flex-direction:column', null,
              v.histRows.length ? null : el('span', 'font-size:14px;color:#8b9dbd;padding:10px 0', null, 'עוד לא נעשו שינויים מהשלט.'),
              v.histRows.map((x) => el('div', 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(150,190,240,.08)', { key: x.key },
                el('span', "flex:none;width:48px;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#8b9dbd", null, x.t),
                el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px', null, el('span', 'font-size:14px;text-wrap:pretty', null, x.text), el('span', 'font-size:12px;color:#8b9dbd', null, x.who)),
                x.canRestore ? el('button', 'flex:none;min-height:34px;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#e6f1ff;font-size:13px;cursor:pointer;white-space:nowrap', { onClick: x.restore }, 'שחזור') : null)))) : null)) : null;

      const toast = v.hasToast ? el('div', { position: 'fixed', bottom: v.toastBottom, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 14, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', padding: '10px 10px 10px 18px', borderRadius: 14, background: '#e6f1ff', color: '#040914', boxShadow: '0 12px 36px rgba(0,0,0,.45)' }, { dir: 'rtl', role: 'status' },
        el('span', 'font-size:15px;font-weight:600;padding-right:6px', null, v.toastText),
        v.toastUndo ? el('button', 'flex:none;min-height:36px;padding:0 14px;border-radius:10px;border:none;background:#040914;color:#e6f1ff;font-size:14px;font-weight:700;cursor:pointer', { onClick: v.toastUndoFn }, 'ביטול') : null) : null;

      const bottomBar = v.showBottomBar ? el('div', 'position:fixed;left:12px;right:12px;bottom:12px;z-index:30;display:flex;gap:8px;align-items:center;padding:8px;border-radius:18px;background:#0e1c3a;border:1px solid rgba(159,220,255,.3);box-shadow:0 12px 36px rgba(0,0,0,.5)', { dir: 'rtl' },
        el('button', 'flex:1;min-width:0;min-height:44px;text-align:right;padding:0 14px;border-radius:12px;border:none;background:rgba(4,9,20,.6);color:#8b9dbd;font-size:15px;cursor:pointer', { onClick: v.openChat }, 'מה לשנות בצג? כתבו לסוכן'),
        el('button', 'flex:none;width:44px;height:44px;border-radius:12px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#9fdcff;font-size:22px;cursor:pointer', { onClick: v.attachFromBar, 'aria-label': 'צירוף קובץ' }, '+')) : null;

      return h(React.Fragment, null,
        el('input', 'display:none', { type: 'file', ref: this.fileRef, multiple: true, accept: '.xlsx,.xls,.csv,.txt,image/*', onChange: v.onChatFiles }),
        el('input', 'display:none', { type: 'file', ref: this.photoRef, accept: 'image/*', onChange: v.onPhotoFile }),
        el('div', { minHeight: '100vh', display: 'grid', gridTemplateColumns: v.rootCols, background: 'radial-gradient(1200px 600px at 60% -10%, #0c1c3a 0%, #040914 60%)' }, { dir: 'rtl' },
          el('main', { minWidth: 0, padding: v.mainPad, display: 'flex', flexDirection: 'column', gap: 16 }, null,
            header, tkBanner, urBanner,
            el('div', { display: 'grid', gridTemplateColumns: v.mainCols, gap: 16, alignItems: 'start' }, null,
              el('div', 'display:flex;flex-direction:column;gap:16px;min-width:0', null, preview, todayPanel),
              el('div', 'display:flex;flex-direction:column;gap:16px;min-width:0', null, actions, studio))),
          agent),
        bottomBar, sheet, toast);
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(Remote));
})();
