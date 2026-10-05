// שלט צג החלל: the operators' remote control. A port of the Claude Design file "Space Wall Remote v2":
// the same layout, styles and flows, rendered with React (vendored UMD, no build) like the wall itself.
// Data and every change go through /api/remote (lib/remote-ops.ts); the wall picks changes up from /api/live.
// The agent panel sends requests to /api/remote's "agent" action (lib/remote-agent.ts): Claude carries them out on the
// server through the Anthropic API, with the remote's own operations, and every change can be undone here.
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
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const BDAY_DAYS = 30;   // birthdays in the upcoming list
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const mmss = (sec) => pad(Math.floor(sec / 60)) + ':' + pad(Math.floor(sec % 60));
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  /** month-day of a date; 29 February is celebrated on the 28th in a common year. */
  const mdOf = (d) => pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const bdayOn = (bday, y) => (bday === '02-29' && !leap(y) ? '02-28' : bday);
  const nextBday = (bday, now) => {
    for (const y of [now.getFullYear(), now.getFullYear() + 1]) { const md = bdayOn(bday, y), d = new Date(y, +md.slice(0, 2) - 1, +md.slice(3)); if (iso(d) >= iso(now)) return d; }
    return now;
  };
  const dm = (s) => { const d = parse(s); return d.getDate() + '.' + (d.getMonth() + 1); };
  const toMin = (t) => { const [hh, mm] = (t || '0:0').split(':').map(Number); return hh * 60 + (mm || 0); };
  const cnt = (n, one, many) => (n === 1 ? one : n + ' ' + many);   // "אדם אחד" / "3 אנשים"
  const initials = (n) => String(n || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  const hash = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0; return Math.abs(x); };

  const DESIGN0 = { noon: true, qr: true, feature: 12, list: 4, fx: true, globe: 90, globeStyle: 'holo', sway: true, lang: 'he' };
  const DEMO_OPTS = [['off', 'כבוי'], ['greeting', 'מודעה אישית'], ['noon', 'סרטון תדמית'], ['launch', 'שיגור']];
  const SPEC = [
    { title: 'הדגמה', controls: [{ key: 'demo', label: 'הדגמת רגע (בתצוגה המקדימה בלבד)', kind: 'select', options: DEMO_OPTS }] },
    { title: 'שפה', controls: [{ key: 'lang', label: 'שפת הצג (השלט נשאר בעברית)', kind: 'seg', options: [['he', 'עברית'], ['en', 'English']] }] },
    { title: 'רגעים', controls: [{ key: 'noon', label: 'סרטון תדמית אוטומטי ב-12:00', kind: 'toggle' }] },
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
  const TYPE_CHIPS = ['יום הולדת', 'חתונה', 'לידה', 'העלאה בדרגה', 'סיום תואר', 'שחרור', 'קליטה', 'אבל'];
  // Examples under the agent's greeting: a question goes out at once, a request lands in the box to be finished.
  const SUGGESTIONS = [
    { label: 'מה מוצג עכשיו בצג?', send: true },
    { label: 'מי חוגג/ת יום הולדת החודש?', send: true },
    { label: 'להוסיף יום הולדת…', fill: 'תוסיף/י יום הולדת ל' },
    { label: 'להזיז אירוע…', fill: 'תעביר/י את האירוע ' },
    { label: 'ידיעה חדשה מהאינטרנט…', fill: 'תמצא/י באינטרנט ידיעה חדשה על ' },
    { label: 'לייב של השיגור הבא', send: true },
  ];
  const AGENT_FILES = 3, AGENT_TEXT = 20000;   // per message, as the server takes them (lib/remote-agent.ts)

  // Mourning words as whole words, so "חתימות" isn't read as "מות" (the server's classifyLife uses the same list).
  const SAD = /(^|[\s,.;:()"'־-])[ובהל]?(אבל|אבלות|צער|נפטר|נפטרה|פטירה|פטירת|מות|לוויה|הלוויה|ז"ל|ז״ל)(?=$|[\s,.;:()"'־-])/;
  function tpl(type) {
    const t = type || '';
    if (SAD.test(t)) return { quiet: true, color: '#8b9dbd', head: 'משתתפים בצער' };
    if (/הולדת/.test(t)) return { color: WARM, head: 'יום הולדת שמח' };
    if (/חתונ|נישוא|אירוס/.test(t)) return { color: '#f4b6c8', head: 'מזל טוב לרגל החתונה' };
    if (/לידה|נולד/.test(t)) return { color: ICE, head: 'מזל טוב על הלידה' };
    if (/דרג|העלא/.test(t)) return { color: LIME, head: 'מזל טוב על הדרגה החדשה' };
    if (/שחרור|פרישה|פרידה/.test(t)) return { color: '#c9a7ff', head: 'תודה ובהצלחה בהמשך' };
    if (/קליטה|הצטרפ|חדש/.test(t)) return { color: '#7fe0c4', head: 'ברוכים הבאים' };
    return { color: '#c9a7ff', head: t ? 'מזל טוב · ' + t : 'מזל טוב' };
  }
  const dn = (p) => (p.rank ? p.rank + ' ' : '') + p.name;
  const onWall = (p) => p.active !== false && p.onWall !== false;   // left the directorate, or asked to stay off the wall
  const pline = (p) => [p.role, p.unit].filter(Boolean).join(' · ');
  const kindLabel = (k) => (KINDS.find(([x]) => x === k) || KINDS[0])[1];
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

  // ---- people: import from Excel/CSV (or the survey form's response sheet) and export ---------------
  const KINDS = [['civilian', 'אזרח/ית'], ['soldier', 'חובה / קבע'], ['officer', 'קצין/ה'], ['reservist', 'מילואים']];
  const PROFILE_LABELS = { upcoming: 'שמחה בדרך', expertise: 'תחומי מומחיות', hobbies: 'תחביבים', fun_fact: 'משהו שלא יודעים', space_q: 'לוקח/ת לחלל', office_note: 'ללשכה', photo_link: 'תמונה מהטופס' };
  // Header → field. The first rule a header matches wins, and each field takes its first column.
  const COLS = [
    ['first', /^(שם פרטי|first ?name|first|given name)$/], ['last', /^(שם משפחה|last ?name|last|surname|family name)$/],
    ['full', /^(שם|שם מלא|full ?name|name|שם ושם משפחה)$/],
    ['showBday', /(לחגוג|יום הולדת בצג|יום ההולדת בצג)/], ['onWall', /(מסכים|הסכמה|consent|מופיע בצג|מופיע\/ה בצג)/],
    ['birthday', /(תאריך לידה|יום הולדת|birth ?day|date of birth|dob)/], ['kind', /^(מעמד|סוג|kind|status)$/], ['rank', /^(דרגה|rank)$/],
    ['joined', /(הצטרפ|תאריך גיוס|joined|start date)/], ['leaves', /(שחרור|סיום|leaves|end date)/],
    ['unit', /(אגף|ענף|צוות|יחידה|מחלקה|unit|department|team)/], ['role', /^(תפקיד|role|title|job)/],
    ['email', /(מייל|אימייל|דוא"?ל|e-?mail)/], ['phone', /(טלפון|נייד|phone|mobile)/],
    ['office_note', /עוד משהו ללשכה/], ['notes', /^(הערות|הערה|notes)$/],
    ['expertise', /מומחיות/], ['hobbies', /תחביב/], ['fun_fact', /לא יודעים עליי/], ['space_q', /לחלל/], ['upcoming', /^(מה ומתי|שמחה|שמחות)/],
    ['photo_link', /(תמונ|photo)/], ['active', /^(פעיל|פעיל\/ה|active)$/],
  ];
  const PROFILE_FIELDS = ['expertise', 'hobbies', 'fun_fact', 'space_q', 'upcoming', 'photo_link', 'office_note'];
  const FIELD_LABELS = { first: 'שם פרטי', last: 'שם משפחה', full: 'שם מלא', showBday: 'לחגוג יום הולדת', onWall: 'הסכמה להופיע בצג', birthday: 'תאריך לידה', kind: 'מעמד', rank: 'דרגה',
    joined: 'הצטרפות', leaves: 'שחרור', unit: 'אגף / ענף', role: 'תפקיד', email: 'מייל', phone: 'טלפון', notes: 'הערות', active: 'פעיל/ה', ...PROFILE_LABELS };
  const normHeader = (s) => String(s == null ? '' : s).replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, '').replace(/[?:*.]+\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isoOf = (y, m, d) => { const s = y + '-' + pad(m) + '-' + pad(d), t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? s : null; };
  /** A date cell: an Excel date, an Excel serial number, or text like 15.3.1990, 15/03/90, 1990-03-15 (day first, as in Israel). */
  function cellDate(v) {
    if (v == null || v === '') return { v: undefined };
    if (v instanceof Date) { const d = new Date(v.getTime() + 12 * 3600e3); return { v: isNaN(d) ? null : isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()) }; }
    if (typeof v === 'number' && v > 3000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return { v: isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) }; }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return { v: isoOf(+m[1], +m[2], +m[3]) };
    m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (m) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
      if (a <= 12 && b > 12) [a, b] = [b, a];   // month first (an American export)
      return { v: isoOf(y, b, a) };
    }
    return { v: null };
  }
  const cellBool = (v) => { const s = String(v == null ? '' : v).trim().toLowerCase(); if (!s) return undefined; if (/^(כן|yes|true|1|v|✓|x|מסכים)/.test(s)) return true; if (/^(לא|no|false|0)/.test(s)) return false; return undefined; };
  const cellKind = (v) => { const s = String(v == null ? '' : v); if (!s.trim()) return undefined; if (/מילואים|reserv/i.test(s)) return 'reservist'; if (/קצינ|קצין|officer/i.test(s)) return 'officer'; if (/חובה|קבע|חייל|סדיר|soldier/i.test(s)) return 'soldier'; if (/אזרח|civil/i.test(s)) return 'civilian'; return undefined; };
  const cellText = (v) => (v instanceof Date ? iso(v) : String(v == null ? '' : v)).replace(/\s+/g, ' ').trim();
  const nkey = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  const personKey = (first, last) => [first, last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();

  /** Reads a people file into rows the server's importPeople takes, with what was understood and what wasn't. */
  async function readPeopleFile(file, people) {
    await loadXlsx();
    const csv = /\.(csv|txt)$/i.test(file.name), buf = await file.arrayBuffer();
    // Excel's plain "CSV" in Hebrew Windows is windows-1255, not UTF-8.
    const text = () => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1255').decode(buf); } };
    const wb = csv ? window.XLSX.read(text(), { type: 'string', raw: true }) : window.XLSX.read(buf, { cellDates: true });
    const grids = wb.SheetNames.map((n) => window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false }));
    const grid = grids.find((g) => g.length > 1) || grids[0] || [];
    const hi = grid.findIndex((r) => r.filter((c) => String(c).trim()).length >= 2);
    if (hi < 0) throw new Error('הקובץ ריק, או שאין בו שורת כותרות');
    const headers = grid[hi].map((c) => String(c == null ? '' : c).trim());
    const col = {}, used = [], unused = [];
    headers.forEach((hd, i) => {
      const n = normHeader(hd); if (!n) return;
      const rule = COLS.find(([f, re]) => col[f] == null && re.test(n));
      if (rule) { col[rule[0]] = i; used.push(FIELD_LABELS[rule[0]]); } else unused.push(hd);
    });
    if (col.first == null && col.full == null) throw new Error('לא מצאתי עמודת שם. בשורה הראשונה צריכות להיות כותרות כמו "שם פרטי" ו"שם משפחה", או "שם מלא".');
    const known = new Map(people.map((p) => [personKey(p.first, p.last), p]));
    const seen = new Set(), rows = [];
    grid.slice(hi + 1).forEach((r, idx) => {
      const get = (f) => (col[f] == null ? undefined : r[col[f]]);
      let first = cellText(get('first')), last = cellText(get('last'));
      if (!first && col.full != null) { const w = cellText(get('full')).split(' '); first = w.shift() || ''; last = last || w.join(' '); }
      if (!first && !last && !r.some((c) => String(c).trim())) return;   // an empty line
      const row = { n: hi + idx + 2, problems: [] }, f = { first: first || last, last: first ? last : '' };
      if (!f.first) { row.problems.push('אין שם'); rows.push(Object.assign(row, { f, name: '(בלי שם)' })); return; }
      for (const k of ['birthday', 'joined', 'leaves']) {
        const d = cellDate(get(k));
        if (d.v === null) row.problems.push(FIELD_LABELS[k] + ' לא מובן: ' + cellText(get(k)));
        else if (d.v) f[k] = d.v;
      }
      if (f.birthday && f.birthday > iso(new Date())) { row.problems.push('תאריך לידה בעתיד'); delete f.birthday; }
      for (const k of ['rank', 'role', 'unit', 'email', 'phone', 'notes']) { const t = cellText(get(k)); if (t) f[k] = t.slice(0, k === 'notes' ? 500 : k === 'email' ? 120 : 80); }
      const kind = cellKind(get('kind')); if (kind) f.kind = kind;
      for (const k of ['showBday', 'onWall', 'active']) { const b = cellBool(get(k)); if (b !== undefined) f[k] = b; }
      const profile = {};
      for (const k of PROFILE_FIELDS) { const t = cellText(get(k)); if (t) profile[k] = t.slice(0, 1000); }
      if (Object.keys(profile).length) f.profile = profile;
      const key = personKey(f.first, f.last);
      Object.assign(row, { f, name: [f.rank, f.first, f.last].filter(Boolean).join(' '), exists: known.has(key), again: seen.has(key) });
      seen.add(key);
      rows.push(row);
    });
    return { file: file.name, headers, used, unused, rows };
  }

  /** The whole list as an Excel file, in the columns the import reads back. */
  async function exportPeople(people) {
    await loadXlsx();
    const d = (s) => (s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '');
    const yn = (b) => (b ? 'כן' : 'לא');
    const rows = people.map((p) => ({ 'שם פרטי': p.first, 'שם משפחה': p.last, 'דרגה': p.rank, 'תפקיד': p.role, 'אגף / ענף / צוות': p.unit,
      'מעמד': (KINDS.find(([k]) => k === p.kind) || KINDS[0])[1], 'תאריך לידה': d(p.birthday), 'לחגוג יום הולדת בצג': yn(p.showBday), 'מופיע/ה בצג': yn(p.onWall),
      'תאריך הצטרפות': d(p.joined), 'תאריך שחרור': d(p.leaves), 'מייל': p.email, 'טלפון': p.phone, 'הערות': p.notes, 'פעיל/ה': yn(p.active) }));
    const ws = window.XLSX.utils.json_to_sheet(rows), wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'אנשים');
    wb.Workbook = { Views: [{ RTL: true }] };
    window.XLSX.writeFile(wb, 'אנשי המנהלת ' + iso(new Date()) + '.xlsx');
  }

  /** A phone or tablet: a touch screen with no mouse. */
  const touchOnly = () => { try { return matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (e) { return false; } };

  // ---- access: the private link /remote/?t=<REMOTE_TOKEN>, kept in this browser --------------------
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  /** The access code as pasted: the code itself or the whole private link, with whatever came along from a chat (spaces,
   *  quotes, a period, the invisible direction marks of Hebrew text, the words around it). */
  const codeOf = (text) => {
    const raw = String(text || '').replace(/[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ''), m = /[?&#]t=([^&#]+)/.exec(raw);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
    const bare = raw.replace(/^[`'"“”‘’«»]+|[`'"“”‘’«».,]+$/g, '');
    if (/^[\x21-\x7e]*$/.test(bare)) return bare;
    const runs = bare.match(/[A-Za-z0-9_-]{16,}/g);
    return runs ? runs.sort((x, y) => y.length - x.length)[0] : bare;
  };
  /** The address bar keeps the private link: a reload (also the one a phone's browser does after dropping the page), a
   *  bookmark or a home-screen icon then opens the remote again, and the address copied from it works on another device. */
  const keepLink = (t) => { try { const u = new URL(location.href); if (u.searchParams.get('t') !== t) { u.searchParams.set('t', t); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch (e) {} };
  /** The code in use: this browser's, else the address bar's (a browser that keeps nothing, like an old private mode). */
  const token = () => store.get('sw-remote-token') || codeOf(new URL(location.href).searchParams.get('t'));
  (() => {
    const t = codeOf(new URL(location.href).searchParams.get('t'));
    if (t) store.set('sw-remote-token', t);
    if (token()) keepLink(token());
  })();

  async function api(method, body) {
    let res;
    try {
      res = await fetch('/api/remote', {
        method, cache: 'no-store',
        headers: Object.assign({ 'x-remote-token': token(), 'x-remote-who': encodeURIComponent(store.get('sw-remote-who')) }, body ? { 'content-type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { throw new Error('אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.'); }
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) { const e = new Error('קוד הגישה לשלט לא תקף. פתחו שוב את הקישור הפרטי.'); e.auth = true; throw e; }
    if (!res.ok) { const e = new Error(j.error || 'הפעולה נכשלה'); e.status = res.status; throw e; }
    return j;
  }

  // ---- the remote ----------------------------------------------------------------------------------
  class Remote extends React.Component {
    constructor(p) {
      super(p);
      const who = store.get('sw-remote-who');
      this.state = {
        now: new Date(), vw: window.innerWidth, pw: 0,
        data: null, loadErr: '', auth: !!token(), who, whoDraft: '', tokenDraft: '',
        design: null, brightness: null,   // optimistic local values while a slider is being dragged
        demo: 'off',
        tab: 'today', studio: false, sheet: null, toast: null, nlBusy: false, photoBusy: false, busyAct: false, impBusy: false,
        pq: '', showInactive: false, gateErr: '',
        // The live preview runs the whole wall inside the page. A phone or tablet shows it on a tap (or while the design is
        // being edited): loaded by itself it took more memory than some phones give a page, and the remote crashed on opening.
        wallSrc: '', liveView: !touchOnly(),
        chatOpen: false, chatInput: '', attach: [], dragging: false,
        messages: [], agentBusy: false, agentAt: 0,
        keyDraft: '', keyBusy: false, keyErr: '', keyOpen: false,
      };
      this.fileRef = React.createRef(); this.photoRef = React.createRef(); this.scrollRef = React.createRef(); this.previewRef = React.createRef();
      this.personPhotoRef = React.createRef(); this.importRef = React.createRef(); this.panelRef = React.createRef();
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
    /** Reloads everything; returns the fresh data (null when it failed), since this.state catches up only on the next render. */
    async refresh() {
      try { const data = await api('GET'); this.setState({ data, loadErr: '' }); return data; }
      catch (e) { if (e.auth) this.setState({ auth: false, data: null, gateErr: 'קוד הגישה לא נכון, או שהקישור הוחלף. בקשו את הקישור העדכני.' }); else this.setState({ loadErr: e.message || 'אין חיבור' }); return null; }
    }
    /** Run an action; toast its label (or label(result)) with an undo button when the action made a new history entry. */
    async run(action, args, label, opts = {}) {
      this.setState({ busyAct: true });
      const before = this.D && this.D.history[0] ? this.D.history[0].id : 0;
      try {
        const j = await api('POST', Object.assign({ action }, args || {}));
        const top = j.state.history[0], fresh = top && top.id > before && top.canRestore;
        this.setState({ data: j.state, loadErr: '' });
        const text = typeof label === 'function' ? label(j.result) : label;
        if (!opts.quiet && text) this.toast(text, fresh ? top.id : null);
        return j.result;
      } catch (e) {
        if (e.auth) this.setState({ auth: false, data: null, gateErr: e.message });
        this.toast(e.message || 'הפעולה נכשלה');
        throw e;
      } finally { this.setState({ busyAct: false }); }
    }
    /** Sliders: show the value at once, send it when the hand stops. */
    burst(key, fn) { const t = this.timers[key] || (this.timers[key] = {}); clearTimeout(t.t); t.t = setTimeout(() => { delete this.timers[key]; fn(); }, 900); }
    toast(text, undoId) { clearTimeout(this.tt); this.setState({ toast: { text, undoId } }); this.tt = setTimeout(() => this.setState({ toast: null }), 4500); }
    /** Undo a change and everything after it; asks first when that reaches further, or someone else's change. True when done. */
    async restore(id) {
      const H = this.D ? this.D.history : [], later = H.filter((x) => x.id > id), me = this.meWho();
      const target = H.find((x) => x.id === id), mine = (x) => x.who === me || x.who === me + ' · סוכן';
      const others = [target, ...later].filter((x) => x && !mine(x));
      if (later.length || others.length) {
        const lines = [target, ...later].filter(Boolean).reverse().map((x) => '· ' + x.text + ' (' + x.who + ')').slice(0, 8).join('\n');
        if (!window.confirm((later.length ? 'הביטול יחזיר אחורה ' + (later.length + 1) + ' שינויים, כולל מה שנעשה אחרי:' : 'הביטול יחזיר אחורה שינוי של ' + (target ? target.who : 'מישהו אחר') + ':') + '\n' + lines + '\n\nלהמשיך?')) return false;
      }
      const r = await this.run('restore', { id }, null, { quiet: true }).catch(() => null);
      if (r) this.toast('בוטל: ' + r.label);
      return !!r;
    }
    /** The operator's name as the server writes it in the history (api/remote.ts whoOf). */
    meWho() { return (this.state.who || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) || 'מפעיל/ה'; }

    // ---- derived -----------------------------------------------------------------------------------
    get D() { return this.state.data; }
    design() { const D = this.D; return Object.assign({}, DESIGN0, D ? D.state.design : {}, this.state.design || {}); }
    buildSrc() {
      const D = this.D; if (!D) return '';
      const d = this.design();
      const q = new URLSearchParams({ noon: d.noon ? '1' : '0', qr: d.qr ? '1' : '0', feature: String(d.feature), list: String(d.list), fx: d.fx ? '1' : '0', globe: String(d.globe), globeStyle: d.globeStyle, sway: d.sway ? '1' : '0', lang: d.lang === 'en' ? 'en' : 'he', preview: '1' });
      if (this.state.studio && this.state.demo !== 'off') q.set('demo', this.state.demo);
      if (D.config && D.config.displayKey) q.set('key', D.config.displayKey);
      return '/?' + q.toString();
    }
    P(id) { return id && this.D ? this.D.people.find((p) => p.id === id) || null : null; }
    /** Whom a personal event is for: the linked person, or a stand-in carrying just the typed name. */
    lifeP(l) { return this.P(l.personId) || { id: 'n:' + (l.name || ''), name: l.name || '', rank: '', role: '', unit: '', photo: null, active: true, onWall: true, free: true }; }
    /** The one active person whose full name is exactly this text. */
    exactPerson(text) {
      const k = nkey(text), hits = k && this.D ? this.D.people.filter((p) => p.active && nkey(p.name) === k) : [];
      return hits.length === 1 ? hits[0] : null;
    }
    /** Link the sheet to a person and fill what the list knows: their name, and a birthday's date. */
    linkLife(pp, f) {
      const patch = { personId: pp.id, name: pp.name };
      if (/הולדת/.test(f.type || '') && pp.bday) Object.assign(patch, this.bdayDates(pp.bday, f));
      return patch;
    }
    bdayDates(bday, f) {
      const d = iso(nextBday(bday, this.state.now));
      return f.showFrom === f.date || !f.showFrom ? { date: d, showFrom: d } : { date: d };
    }
    avatar(p, src) {
      const photo = src || (p && p.photo) || null;
      return { bg: p ? colorFor(p) : 'rgba(150,190,240,.25)', ini: p ? initials(p.name) : '?', photoEl: photo ? imgEl(photo, COVER) : null };
    }
    celebs() {
      const D = this.D; if (!D) return [];
      // Greetings go full screen on the day and up to two days after (a Friday birthday is celebrated on Sunday);
      // mourning only shows quietly in the people panel, for its whole window.
      const ti = iso(this.state.now), back = [0, 1, 2].map((k) => addDays(this.state.now, -k));
      const b = [];
      D.people.forEach((p) => { if (!p.bday || !onWall(p) || !p.showBday) return; const k = back.findIndex((d) => bdayOn(p.bday, d.getFullYear()) === mdOf(d));
        if (k >= 0) b.push({ key: 'b' + p.id, person: p, type: 'יום הולדת' + (k ? (k === 1 ? ' · אתמול' : ' · שלשום') : ''), note: '', photoSrc: null, tpl: tpl('יום הולדת') }); });
      const bdayToday = new Set(b.map((x) => x.person.id));
      const greetDays = (x) => x.date <= ti && ti <= iso(addDays(parse(x.date), 2));
      const l = D.life.filter((x) => (x.kind === 'bereavement' ? ti >= x.showFrom && ti <= x.showUntil : greetDays(x)) && !(x.kind === 'birthday' && bdayToday.has(x.personId)))
        .map((x) => ({ key: x.id, lifeId: x.id, person: this.lifeP(x), type: x.type, note: x.note, photoSrc: x.photo === 'upload' ? x.photoSrc : null, noPhoto: x.photo === 'none', tpl: x.kind === 'bereavement' ? tpl('אבל') : tpl(x.type) }))
        .filter((x) => x.person && onWall(x.person));
      return [...b, ...l];
    }
    takeover() { const tk = this.D && this.D.takeover; return tk && Date.parse(tk.until) > this.state.now.getTime() ? tk : null; }
    tkTitle(tk) {
      if (!tk) return '';
      if (tk.kind === 'noon') return 'סרטון תדמית';
      if (tk.kind === 'welcome') return 'ברוכים הבאים' + (tk.guest ? ' · ' + tk.guest : '');
      if (tk.kind === 'event') return tk.title;
      if (tk.kind === 'image') return 'תמונה' + (tk.caption ? ' · ' + tk.caption : '');
      if (tk.kind === 'stream') return 'שידור חי' + (tk.title ? ' · ' + tk.title : '');
      return tpl(tk.type || (tk.person && tk.person.type)).head + (tk.person ? ' · ' + tk.person.name : '');
    }

    // ---- actions -----------------------------------------------------------------------------------
    openSheet(kind, f = {}, mode = 'add') { this.setState({ sheet: { kind, mode, f } }); }
    closeSheet() { this.setState({ sheet: null }); }
    setFV(obj) { this.setState((s) => (s.sheet ? { sheet: Object.assign({}, s.sheet, { f: Object.assign({}, s.sheet.f, obj) }) } : null)); }
    fv(k) { return (e) => this.setFV({ [k]: e.target.value }); }
    openLife(l, pre) {
      const ti = iso(this.state.now);
      if (l) this.openSheet('life', Object.assign({}, l, { name: this.lifeP(l).name }), 'edit');
      else {
        const pp = pre && pre.personId ? this.P(pre.personId) : null;
        this.openSheet('life', Object.assign({ personId: '', name: pp ? pp.name : '', type: '', date: ti, showFrom: ti, photo: 'crm', photoSrc: null, note: '' }, pre || {}));
      }
    }
    openEvent(e) {
      if (e) this.openSheet('event', Object.assign({}, e), 'edit');
      else this.openSheet('event', { title: '', date: iso(this.state.now), start: '10:00', end: '11:00', place: '', big: false });
    }
    showNoon() { this.run('noon', {}, 'הופעל סרטון התדמית').catch(() => {}); }
    showCeleb(x) { this.run('celebrate', { personId: x.person.free ? null : x.person.id, lifeId: x.lifeId }, 'מודעה אישית על כל המסך: ' + dn(x.person)).catch(() => {}); }
    showEvent(e) { this.run('showEvent', { eventId: e.id }, 'על כל המסך: ' + e.title).catch(() => {}); }
    endTk() { const w = (this.takeover() || {}).kind === 'welcome'; this.run('endTakeover', {}, w ? 'כניסה לצג הבית' : 'חזרה לתצוגה רגילה').catch(() => {}); }
    showWelcome(guest) { this.run('welcome', { guest: guest || undefined }, 'מסך ברוכים הבאים על הצג').catch(() => {}); }
    async saveLife(showNow) {
      const sh = this.state.sheet, f = sh.f, per = this.P(f.personId), name = (f.name || '').replace(/\s+/g, ' ').trim();
      if (!per && name.length < 2) return this.toast('כתבו למי השמחה');
      if (!(f.type || '').trim()) return this.toast('כתבו מה קרה');
      if (f.photo === 'upload' && !f.photoSrc) return this.toast('בחרו תמונה, או "ראשי תיבות"');
      const edit = sh.mode === 'edit', fix = this.bdayFix(f), date = fix || f.date, showFrom = fix ? (f.showFrom === f.date ? fix : f.showFrom) : f.showFrom || f.date;
      try {
        await this.run('saveLife', { id: edit ? f.id : undefined, personId: per ? per.id : null, name: per ? undefined : name, free: !per && !!f.noLink, type: f.type.trim(), date, showFrom, photo: f.photo, photoSrc: f.photo === 'upload' ? f.photoSrc : null, note: (f.note || '').trim(), showNow: !!showNow },
          (edit ? 'עודכן: ' : 'נוסף: ') + f.type.trim() + ' · ' + (per ? dn(per) : name));
        this.closeSheet();
      } catch (e) { /* toasted */ }
    }
    /** A birthday dated more than a few days back is a date of birth: it's celebrated on the next anniversary. */
    bdayFix(f) {
      if (!/הולדת/.test(f.type || '') || !f.date || f.date >= iso(addDays(this.state.now, -3))) return null;
      return iso(nextBday(f.date.slice(5), this.state.now));
    }
    async saveEvent() {
      const sh = this.state.sheet, f = sh.f;
      if (!(f.title || '').trim()) return this.toast('כתבו שם לאירוע');
      if (toMin(f.end) <= toMin(f.start)) return this.toast('שעת הסיום צריכה להיות אחרי שעת ההתחלה');
      const edit = sh.mode === 'edit';
      try {
        await this.run('saveEvent', { id: edit ? f.id : undefined, title: f.title.trim(), date: f.date, start: f.start, end: f.end, place: (f.place || '').trim(), big: !!f.big },
          (edit ? 'עודכן אירוע: ' : 'נוסף אירוע: ') + f.title.trim());
        this.closeSheet();
      } catch (e) { /* toasted */ }
    }
    delLife(l) { this.run('deleteLife', { id: l.id }, 'נמחק: ' + l.type + ' · ' + dn(this.lifeP(l))).catch(() => {}); }
    delEvent(e) { return this.run('deleteEvent', { id: e.id }, 'נמחק אירוע: ' + e.title).catch(() => {}); }

    // ---- people ----
    /** back: the sheet to return to after saving a new person (the life sheet's "add new person"), with the new id. */
    openPerson(p, prefill, back) {
      if (p) this.openSheet('person', Object.assign({}, p), 'edit');
      else this.openSheet('person', Object.assign({ first: '', last: '', rank: '', role: '', unit: '', kind: 'civilian', birthday: '', showBday: true, onWall: true, joined: '', leaves: '', email: '', phone: '', notes: '', photo: null, active: true, profile: {}, back: back || null }, prefill || {}), 'add');
    }
    async savePerson() {
      const sh = this.state.sheet, f = sh.f, edit = sh.mode === 'edit';
      if (!(f.first || '').trim()) return this.toast('כתבו שם פרטי');
      if (f.birthday && f.birthday > iso(this.state.now)) return this.toast('תאריך הלידה בעתיד');
      const body = { id: edit ? f.id : undefined, first: f.first.trim(), last: (f.last || '').trim(), rank: (f.rank || '').trim(), role: (f.role || '').trim(), unit: (f.unit || '').trim(),
        kind: f.kind || 'civilian', birthday: f.birthday || null, showBday: !!f.showBday, onWall: !!f.onWall, joined: f.joined || null, leaves: f.leaves || null,
        email: (f.email || '').trim(), phone: (f.phone || '').trim(), notes: (f.notes || '').trim(), photo: f.photo || null, active: f.active !== false };
      const name = [body.rank, body.first, body.last].filter(Boolean).join(' ');
      try {
        const r = await this.run('savePerson', body, (edit ? 'עודכן: ' : 'נוסף/ה לרשימה: ') + name);
        if (f.back) this.setState({ sheet: Object.assign({}, f.back, { f: Object.assign({}, f.back.f, { personId: r.id, name: [body.first, body.last].filter(Boolean).join(' ') }) }) });
        else this.closeSheet();
      } catch (e) { /* toasted */ }
    }
    delPerson(f) { this.run('deletePerson', { id: f.id }, 'נמחק/ה מהרשימה: ' + dn(f)).then(() => this.closeSheet(), () => {}); }
    async onPersonPhoto(e) {
      const fl = e.target.files[0]; e.target.value = ''; if (!fl) return;
      this.setState({ photoBusy: true });
      try { const dataUrl = await shrinkImage(fl, 640); const r = await api('POST', { action: 'photo', dataUrl, folder: 'people' }); this.setFV({ photo: r.result.url }); }
      catch (er) { this.toast(er.message && er.message !== 'unauthorized' ? er.message : 'לא הצלחתי להעלות את התמונה'); }
      finally { this.setState({ photoBusy: false }); }
    }
    async onImportFile(e) {
      const fl = e.target.files[0]; e.target.value = ''; if (!fl) return;
      this.setState({ impBusy: true });
      try { const imp = await readPeopleFile(fl, this.D ? this.D.people : []); this.openSheet('import', { imp }); }
      catch (er) { this.toast(er.message || 'לא הצלחתי לקרוא את הקובץ'); }
      finally { this.setState({ impBusy: false }); }
    }
    async doImport() {
      const imp = this.state.sheet && this.state.sheet.f.imp; if (!imp) return;
      const rows = imp.rows.filter((r) => r.f.first && !r.problems.includes('אין שם')).map((r) => r.f);
      if (!rows.length) return this.toast('אין בקובץ שורות עם שם');
      this.setState({ impBusy: true });
      try {
        await this.run('importPeople', { rows, file: imp.file.slice(0, 120) }, (r) => {
          const parts = [r.added ? cnt(r.added, 'אחד חדש', 'חדשים') : '', r.updated ? cnt(r.updated, 'אחד עודכן', 'עודכנו') : '', r.same ? cnt(r.same, 'אחד בלי שינוי', 'בלי שינוי') : ''].filter(Boolean);
          return 'ייבוא: ' + (parts.join(', ') || 'לא היה מה לעדכן') + (r.skipped && r.skipped.length ? ' · ' + cnt(r.skipped.length, 'שורה אחת דולגה', 'שורות דולגו') : '');
        });
        this.setState({ tab: 'people' });
        this.closeSheet();
      } catch (e) { /* toasted */ }
      finally { this.setState({ impBusy: false }); }
    }
    importVals(imp) {
      const dmy = (x) => dm(x) + '.' + x.slice(0, 4);
      let add = 0, upd = 0, again = 0, skip = 0;
      const rows = imp.rows.map((r) => {
        const noName = r.problems.includes('אין שם');
        if (noName) skip++; else if (r.again) again++; else if (r.exists) upd++; else add++;
        return { key: r.n, n: r.n, name: r.name, off: r.f.onWall === false,
          line: [r.f.birthday ? 'נולד/ה ' + dmy(r.f.birthday) : 'בלי תאריך לידה', r.f.unit, r.f.role].filter(Boolean).join(' · '),
          tag: noName ? { t: 'לא ייובא', c: RED } : r.again ? { t: 'שורה חוזרת', c: '#8b9dbd' } : r.exists ? { t: 'קיים · יעודכן', c: ICE } : { t: 'חדש', c: LIME },
          warn: r.problems.filter((x) => x !== 'אין שם').join(' · ') };
      });
      return { impFile: imp.file, impUsed: imp.used.join(', '), impUnused: imp.unused.filter(Boolean).join(', '),
        impRows: rows.slice(0, 300), impMore: Math.max(0, rows.length - 300), impCan: add + upd > 0,
        impSummary: [add ? cnt(add, 'אחד חדש', 'חדשים') : '', upd ? cnt(upd, 'אחד כבר ברשימה ויעודכן', 'כבר ברשימה ויעודכנו') : '', again ? cnt(again, 'שורה חוזרת אחת', 'שורות חוזרות') + ' (השורה האחרונה קובעת)' : '', skip ? cnt(skip, 'שורה אחת בלי שם, לא תיובא', 'שורות בלי שם, לא ייובאו') : ''].filter(Boolean).join(' · ') || 'אין שורות לייבוא',
        impLabel: 'ייבוא ' + cnt(add + upd, 'אדם אחד', 'אנשים') };
    }
    openTicker(t) {
      if (t) this.openSheet('ticker', Object.assign({}, t, { end: t.end || '' }), 'edit');
      else this.openSheet('ticker', { name: '', kind: 'אירוע', start: iso(this.state.now), end: '', place: '', url: '' });
    }
    async saveTicker() {
      const sh = this.state.sheet, f = sh.f, edit = sh.mode === 'edit';
      if ((f.name || '').trim().length < 2) return this.toast('כתבו שם');
      if (!f.start) return this.toast('בחרו תאריך');
      if (f.end && f.end < f.start) return this.toast('תאריך הסיום לפני תאריך ההתחלה');
      const url = (f.url || '').trim();
      if (url && !/^https?:\/\/\S+\.\S+/.test(url)) return this.toast('הקישור צריך להתחיל ב-https://');
      try {
        await this.run('saveTicker', { id: edit ? f.id : undefined, name: f.name.trim(), kind: f.kind || 'אירוע', start: f.start, end: f.end || null, place: (f.place || '').trim(), url },
          (edit ? 'עודכן: ' : 'נוסף לרצועת האירועים: ') + f.name.trim());
        this.closeSheet();
      } catch (e) { /* toasted */ }
    }
    delTicker(t) { this.run('deleteTicker', { id: t.id }, 'נמחק מרצועת האירועים: ' + t.name).then(() => { if (this.state.sheet && this.state.sheet.kind === 'ticker') this.closeSheet(); }, () => {}); }
    goPeople() { this.setState({ tab: 'people', studio: false, sheet: null }, () => { const e = this.panelRef.current; if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
    async exportPeople() {
      try { await exportPeople(this.D ? this.D.people : []); } catch (e) { this.toast('הייצוא נכשל: ' + (e.message || e)); }
    }
    async importNl() {
      const url = ((this.state.sheet.f.url) || '').trim();
      if (!/^https?:\/\/\S+\.\S+/.test(url)) return this.toast('הדביקו קישור מלא, שמתחיל ב-https://');
      this.setState({ nlBusy: true });
      try {
        const r = await this.run('newsletter', { url }, (x) => (x && x.handoff ? null : 'יובא גיליון הניוזלטר'));
        if (r && r.handoff) this.toast('אפשר לייבא רק גיליון מאתר הניוזלטר של רקיע (rakia-weekly.vercel.app). גיליון חדש נטען לבד בכל בוקר.');
        else this.closeSheet();
      } catch (e) { /* toasted */ }
      finally { this.setState({ nlBusy: false }); }
    }
    setDesign(k, v, label) {
      if (k === 'lang') return this.setLang(v);
      this.setState((s) => ({ design: Object.assign({}, s.design || {}, { [k]: v }) }));
      this.run('design', { patch: { [k]: v }, label: LABEL[k] + ': ' + label }, LABEL[k] + ': ' + label).catch(() => {}).finally(() => this.setState({ design: null }));
    }
    /** The whole wall in English (for visiting delegations) or back to Hebrew. Switching to English waits while the
     *  server translates what the wall shows now, so it comes up in English at once. */
    setLang(v) {
      if (this.state.langBusy) return;
      const en = v === 'en';
      this.setState((s) => ({ langBusy: en, design: Object.assign({}, s.design || {}, { lang: v }) }));
      const said = (r) => !en ? 'הצג חוזר לעברית'
        : r && r.error === 'no-key' ? 'הצג עבר לאנגלית, אבל התוכן המתחלף יישאר בעברית: לתרגום צריך את מפתח ה-API של הסוכן'
        : r && r.missing ? 'הצג עבר לאנגלית. חלק מהתוכן עוד מתורגם ויתחלף בדקות הקרובות'
        : 'הצג עבר לאנגלית';
      this.run('design', { patch: { lang: v }, label: en ? 'הצג באנגלית (משלחת)' : 'הצג חזר לעברית' }, said).catch(() => {})
        .finally(() => this.setState({ design: null, langBusy: false }));
    }
    slideDesign(k, v, unit) {
      this.setState((s) => ({ design: Object.assign({}, s.design || {}, { [k]: v }) }));
      this.burst('d' + k, () => this.run('design', { patch: { [k]: v }, label: LABEL[k] + ': ' + v + unit }, null, { quiet: true }).catch(() => {}).finally(() => this.setState({ design: null })));
    }

    // ---- agent panel: Claude carries out requests on the server (lib/remote-agent.ts) -------------------------
    agentInfo() { return (this.D && this.D.config && this.D.config.agent) || { ready: false, fromServer: false, hint: '' }; }
    async addFiles(list) {
      for (const f of Array.from(list || [])) {
        const kind = f.type.startsWith('image/') ? 'image' : /\.(xlsx|xls|csv|txt|json|md)$/i.test(f.name) ? 'sheet' : '';
        if (!kind) { this.toast('סוג קובץ לא נתמך: ' + f.name); continue; }
        if (this.state.attach.filter((a) => a.kind === kind).length >= AGENT_FILES) { this.toast(kind === 'image' ? 'אפשר לצרף עד 3 תמונות להודעה' : 'אפשר לצרף עד 3 קבצים להודעה'); continue; }
        try {
          if (kind === 'image') {
            const src = await shrinkImage(f, 1024);
            this.setState((s) => ({ attach: [...s.attach, { id: 'a' + Date.now() + Math.random(), name: f.name, kind, src, info: 'תמונה' }] }));
          } else {
            const { text, rows } = await readSheet(f), cut = text.length > AGENT_TEXT;
            this.setState((s) => ({ attach: [...s.attach, { id: 'a' + Date.now() + Math.random(), name: f.name, kind, text: text.slice(0, AGENT_TEXT), rows, info: rows + ' שורות' + (cut ? ' · רק ההתחלה תישלח' : '') }] }));
          }
        } catch (e) { this.toast('לא הצלחתי לקרוא את ' + f.name); }
      }
    }
    async sendChat(override) {
      const s = this.state, text = (override != null ? override : s.chatInput).trim(), att = s.attach;
      if (s.agentBusy || (!text && !att.length)) return;
      if (!this.agentInfo().ready) return this.setState({ keyOpen: true });
      const files = att.filter((a) => a.kind === 'sheet').map((a) => ({ name: a.name, text: a.text, rows: a.rows }));
      const images = att.filter((a) => a.kind === 'image').map((a) => ({ name: a.name, dataUrl: a.src }));
      const userMsg = { id: Date.now(), role: 'user', text, files: att.map((a) => ({ name: a.name, kind: a.kind, src: a.src, info: a.info })), sent: { files, images } };
      // What the agent is reminded of: the last turns (a failed one says so), and the attachments of a recent message,
      // which it may have asked about.
      const prior = s.messages.slice(-12);
      const withAtt = files.length || images.length ? null
        : prior.slice(-4).reverse().find((m) => m.role === 'user' && m.sent && (m.sent.files.length || m.sent.images.length));
      const history = prior.map((m) => (m.role === 'user'
        ? Object.assign({ role: 'user', text: m.text || '(קבצים מצורפים)' }, m === withAtt ? m.sent : {})
        : { role: 'assistant', text: m.err && !(m.actions && m.actions.length) ? '[הבקשה לא בוצעה: ' + m.text + ']'
          : m.text + (m.actions && m.actions.length ? '\n[בוצע: ' + m.actions.join(' · ') + ']' + (m.undone ? ' [בוטל אחר כך]' : '') : '') }));
      const before = this.D && this.D.history[0] ? this.D.history[0].id : 0;
      this.setState({ messages: [...s.messages, userMsg], chatInput: '', attach: [], agentBusy: true, agentAt: Date.now() });
      let reply;
      try {
        const j = await api('POST', { action: 'agent', text, files, images, history });
        const r = j.result || {};
        this.setState({ data: j.state, loadErr: '' });
        reply = { text: r.reply || 'בוצע.', actions: r.done || [], undoId: r.undoId || null, err: !!r.error && !(r.done || []).length, proposals: r.proposals || [] };
      } catch (e) {
        if (e.auth) this.setState({ auth: false, data: null, gateErr: e.message });
        const fresh = e.auth ? null : await this.refresh();
        // Cut off before the answer (the server's time limit): what the agent changed is in the history all the same.
        const me = this.meWho() + ' · סוכן', changed = (fresh ? fresh.history : []).filter((x) => x.id > before && x.who === me).reverse();
        reply = { err: true, text: e.status === 504 ? 'הסוכן לא הספיק לסיים בזמן.' + (changed.length ? ' מה שכבר בוצע מופיע כאן.' : ' נסו בקשה קצרה יותר.') : e.message || 'הבקשה נכשלה',
          actions: changed.map((x) => x.text), undoId: changed.length && changed[0].canRestore ? changed[0].id : null };
      }
      this.setState((st) => ({ agentBusy: false, messages: [...st.messages, Object.assign({ id: Date.now() + 1, role: 'bot' }, reply)] }));
    }
    /** An agent's suggestion from the internet (a news item, a picture, a stream) goes on the wall only on the operator's tap. */
    async approve(m, p) {
      const mark = (state) => this.setState((st) => ({ messages: st.messages.map((x) => (x.id === m.id ? Object.assign({}, x, { proposals: x.proposals.map((y) => (y.id === p.id ? Object.assign({}, y, { state }) : y)) }) : x)) }));
      if (p.state === 'busy' || p.state === 'done') return;
      mark('busy');
      const label = p.kind === 'news' ? 'הידיעה נוספה לצג' : p.kind === 'image' ? 'התמונה מוצגת על כל המסך' : 'השידור מוצג על כל המסך';
      try { await this.run(p.action, p.args, label); mark('done'); } catch (e) { mark(''); }
    }
    dismiss(m, p) { this.setState((st) => ({ messages: st.messages.map((x) => (x.id === m.id ? Object.assign({}, x, { proposals: x.proposals.map((y) => (y.id === p.id ? Object.assign({}, y, { state: 'no' }) : y)) }) : x)) })); }
    async undoReply(m) {
      if (await this.restore(m.undoId)) this.setState((st) => ({ messages: st.messages.map((x) => (x.id === m.id ? Object.assign({}, x, { undone: true }) : x)) }));
    }
    /** Connects the agent with the operator's API key (checked with Claude, kept on the server); null disconnects. */
    async saveKey(key) {
      if (key !== null && !key.trim()) return this.setState({ keyErr: 'הדביקו את המפתח' });
      if (key === null && !window.confirm('לנתק את הסוכן? כדי להשתמש בו שוב יהיה צריך להדביק מפתח.')) return;
      this.setState({ keyBusy: true, keyErr: '' });
      try {
        const j = await api('POST', { action: 'agentKey', key: key === null ? null : key.trim() });
        this.setState({ data: j.state, keyDraft: '', keyOpen: false });
        this.toast(key === null ? 'הסוכן נותק' : 'הסוכן מחובר ומוכן');
      } catch (e) {
        if (e.auth) this.setState({ auth: false, data: null, gateErr: e.message }); else this.setState({ keyErr: e.message || 'לא הצלחתי לשמור את המפתח' });
      } finally { this.setState({ keyBusy: false }); }
    }

    // ---- view values (as in the design) ------------------------------------------------------------
    renderVals() {
      const s = this.state, D = this.D, now = s.now, ti = iso(now), nm = now.getHours() * 60 + now.getMinutes();
      const wide = s.vw >= 1180, narrow = !wide, small = s.vw < 700, two = s.vw >= 900;
      const sw = (on) => ({ j: on ? 'flex-end' : 'flex-start', tbg: on ? ICE : OFF });
      const seg = (on) => ({ bg: on ? ICE : 'transparent', fg: on ? '#040914' : '#e6f1ff' });
      const design = this.design(), noonToday = D ? D.state.noonToday : true;
      const brightness = s.brightness != null ? s.brightness : D ? D.state.brightness : 100;
      const agent = this.agentInfo(), agentOn = !!D && agent.ready;
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
          hasBtn: !past, btn: live ? 'מוצג עכשיו' : toMin(e.start) - nm > 30 ? 'הצצה ל-10 דק׳' : 'על כל המסך', action: () => (live ? null : this.showEvent(e)), hasToggle: false };
      });
      const noonPast = nm >= 735, noonOn = design.noon && noonToday;
      rows.push(Object.assign({ key: 'noon', m: 720, time: '12:00', title: 'סרטון תדמית', op: noonPast ? 0.45 : 1,
        sub: !design.noon ? 'כבוי בהגדרות העיצוב' : noonPast ? 'הסתיים להיום' : (noonToday ? 'יעלה לבד' : 'דילוג היום'),
        hasBtn: false, hasToggle: design.noon && !noonPast }, sw(noonOn), {
        toggle: () => this.run('noonToday', { on: !noonToday }, noonToday ? 'דילוג על סרטון התדמית היום' : 'סרטון התדמית יעלה היום').catch(() => {}) }));
      rows.sort((a, b) => a.m - b.m);

      // Everything ahead: directorate events (a year), personal moments still to show, birthdays in the next 30 days.
      const soon = [], bLim = iso(addDays(now, BDAY_DAYS));
      events.filter((e) => e.date >= ti).forEach((e) => soon.push({ key: e.id, date: e.date, title: e.title, sub: e.start + '–' + e.end + (e.place ? ' · ' + e.place : '') + (e.big ? ' · מודעה מנהלת' : ''), tag: 'אירועים', tagColor: ICE, editable: true, edit: () => this.openEvent(e), del: () => this.delEvent(e) }));
      life.filter((l) => l.showUntil >= ti).forEach((l) => { const pp = this.lifeP(l), tp = l.kind === 'bereavement' ? tpl('אבל') : tpl(l.type);
        soon.push({ key: l.id, date: l.date, title: dn(pp), sub: (l.note ? l.note + ' · ' : '') + (!onWall(pp) ? 'לא מוצג: ' + (pp.active ? 'ביקש/ה לא להופיע בצג' : 'כבר לא במנהלת') : l.showFrom > ti ? 'יוצג החל מ-' + dm(l.showFrom) : (tp.quiet ? 'מוצג בשקט' : 'מוצג עכשיו')), tag: l.type, tagColor: tp.color, editable: true, edit: () => this.openLife(l), del: () => this.delLife(l) }); });
      (D && D.ticker ? D.ticker : []).forEach((t) => soon.push({ key: t.id, date: t.start < ti ? ti : t.start, title: t.name,
        sub: [t.end ? (t.start < ti ? 'עד ' : dm(t.start) + '–') + dm(t.end) : '', t.place, 'ברצועת האירועים בצג'].filter(Boolean).join(' · '),
        tag: t.kind === 'הזדמנות' ? 'הזדמנות' : 'אירוע בתעשייה', tagColor: '#7fe0c4', editable: true, edit: () => this.openTicker(t), del: () => this.delTicker(t) }));
      const lifeBdays = new Set(life.filter((l) => l.kind === 'birthday' && l.personId).map((l) => l.personId + '|' + l.date));
      people.forEach((pp) => { if (!pp.bday || !onWall(pp) || !pp.showBday) return; const d = nextBday(pp.bday, now);
        if (iso(d) <= bLim && !lifeBdays.has(pp.id + '|' + iso(d))) soon.push({ key: 'b' + pp.id, date: iso(d), title: dn(pp), sub: 'מחושב לבד מתאריך הלידה', tag: 'יום הולדת', tagColor: WARM, editable: false, open: () => this.openPerson(pp) }); });
      soon.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      let lastMonth = iso(now).slice(0, 7);
      const soonRows = soon.map((r) => { const d = parse(r.date), mk = r.date.slice(0, 7), head = mk !== lastMonth ? MONTHS[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '') : '';
        lastMonth = mk; return Object.assign({}, r, { day: d.getDate(), dow: r.date === ti ? 'היום' : DOWS[d.getDay()], head }); });

      // ---- people screen
      const pq = s.pq.trim().toLowerCase();
      const pMatch = (pp) => !pq || [pp.name, pp.rank, pp.role, pp.unit, pp.email, pp.phone].join(' ').toLowerCase().includes(pq);
      const activeP = people.filter((pp) => pp.active), inactiveP = people.filter((pp) => !pp.active);
      const pRow = (pp) => {
        const tags = [];
        if (!pp.onWall) tags.push({ t: 'לא מופיע/ה בצג', c: '#8b9dbd' });
        else if (pp.birthday && !pp.showBday) tags.push({ t: 'בלי יום הולדת בצג', c: '#8b9dbd' });
        if (pp.active && !pp.birthday) tags.push({ t: 'חסר תאריך לידה', c: WARM });
        if (pp.profile && pp.profile.upcoming) tags.push({ t: 'שמחה בדרך', c: '#f4b6c8' });
        return { key: pp.id, name: dn(pp), line: pline(pp) || kindLabel(pp.kind), bday: pp.birthday ? dm(pp.birthday) : '', av: this.avatar(pp), tags, open: () => this.openPerson(pp) };
      };
      const thisMonth = pad(now.getMonth() + 1), noBirthday = activeP.filter((pp) => !pp.birthday).length;
      const bdaysMonth = activeP.filter((pp) => pp.bday && pp.bday.slice(0, 2) === thisMonth && pp.onWall && pp.showBday).length;

      const nextEv = todayEvents.find((e) => toMin(e.end) > nm);
      const nl = D && D.newsletter;
      const actGroups = [
        { title: 'להציג עכשיו על כל המסך', items: [
          { label: tkK === 'welcome' ? 'כניסה לצג הבית ✦' : 'ברוכים הבאים', sub: tkK === 'welcome' ? 'מסך הפתיחה מוצג · לחיצה מכניסה לצג באנימציה' : 'מסך פתיחה מרשים לביקור משלחת', dot: '#e6f1ff', bg: tkK === 'welcome' ? 'rgba(212,242,92,.16)' : 'rgba(230,241,255,.08)', border: tkK === 'welcome' ? 'rgba(212,242,92,.7)' : 'rgba(230,241,255,.35)', go: () => (tkK === 'welcome' ? this.endTk() : this.openSheet('welcome', { guest: '' })) },
          { label: tkK === 'noon' ? 'עצירת הסרטון' : 'סרטון תדמית', sub: tkK === 'noon' ? 'מוצג עכשיו' : 'עולה לבד ב-12:00', dot: LIME, bg: 'rgba(212,242,92,.09)', border: 'rgba(212,242,92,.4)', go: () => (tkK === 'noon' ? this.endTk() : this.showNoon()) },
          { label: 'מודעה אישית', sub: cel.length ? 'היום: ' + dn(cel[0].person) + (cel.length > 1 ? ' ועוד ' + (cel.length - 1) : '') : 'אין מודעות אישיות היום', dot: WARM, bg: 'rgba(233,184,114,.09)', border: 'rgba(233,184,114,.4)', go: () => this.openSheet('celebrate') },
          { label: 'מודעה מנהלת', sub: nextEv ? nextEv.title : 'בחירה מלוח האירועים', dot: ICE, bg: 'rgba(159,220,255,.09)', border: 'rgba(159,220,255,.4)', go: () => this.openSheet('eventShow') }] },
        { title: 'להוסיף לצג', items: [
          { label: 'אנשי המנהלת', sub: 'חתונה, לידה, דרגה או כל דבר אחר', dot: '#f4b6c8', bg: 'rgba(14,28,58,.55)', border: 'rgba(150,190,240,.16)', go: () => this.openLife() },
          { label: 'אירועים', sub: 'נכנס ללוח האירועים בצג', dot: ICE, bg: 'rgba(14,28,58,.55)', border: 'rgba(150,190,240,.16)', go: () => this.openEvent() },
          { label: 'ניוזלטר השבוע', sub: nl && nl.range ? 'בצג: ' + nl.range : 'עדיין לא יובא גיליון', dot: LIME, bg: 'rgba(14,28,58,.55)', border: 'rgba(150,190,240,.16)', go: () => this.openSheet('newsletter', { url: '' }) },
          { label: 'רשימת האנשים', sub: activeP.length ? activeP.length + ' ברשימה · הוספה, עריכה וייבוא' : 'הרשימה ריקה · הוספה או ייבוא מאקסל', dot: WARM, bg: 'rgba(14,28,58,.55)', border: activeP.length ? 'rgba(150,190,240,.16)' : 'rgba(233,184,114,.45)', go: () => this.goPeople() }] },
        { title: 'עוד', items: [
          { label: design.lang === 'en' ? 'חזרה לעברית' : 'הצג באנגלית', sub: s.langBusy ? 'מתרגם את הצג…' : design.lang === 'en' ? 'הצג מוצג עכשיו באנגלית' : 'כל הצג באנגלית, למשלחות מחו״ל', dot: '#7fe0c4', bg: design.lang === 'en' ? 'rgba(127,224,196,.09)' : 'rgba(14,28,58,.55)', border: design.lang === 'en' ? 'rgba(127,224,196,.45)' : 'rgba(150,190,240,.16)', go: () => this.setLang(design.lang === 'en' ? 'he' : 'en') },
          { label: 'הודעה דחופה', sub: urgent ? 'משודרת עכשיו' : 'פס אדום בראש הצג', dot: RED, bg: 'rgba(14,28,58,.55)', border: urgent ? 'rgba(255,122,107,.5)' : 'rgba(150,190,240,.16)', go: () => this.openSheet('urgent', { text: '' }) },
          { label: 'עיצוב הצג', sub: 'גלובוס ' + (design.globeStyle === 'real' ? 'ריאליסטי' : 'הולוגרפי') + ' · אפקטים ' + (design.fx ? 'פעילים' : 'כבויים'), dot: '#c9a7ff', bg: 'rgba(14,28,58,.55)', border: 'rgba(150,190,240,.16)', go: () => this.setState({ studio: true, sheet: null }) }] },
      ];

      const lfP = this.P(f.personId), lfT = tpl(f.type), q = (f.name || '').replace(/\s+/g, ' ').trim();
      const lfSrc = f.photo === 'upload' ? f.photoSrc : null;
      const lfAvBase = lfP ? this.avatar(lfP, lfSrc) : q ? this.avatar({ id: 'n:' + q, name: q }, lfSrc) : { bg: 'rgba(150,190,240,.25)', ini: '?', photoEl: lfSrc ? imgEl(lfSrc, COVER) : null };
      const lfAv = f.photo === 'none' ? Object.assign({}, lfAvBase, { photoEl: null }) : lfAvBase;
      const lfFix = kind === 'life' ? this.bdayFix(f) : null, lfDay = lfFix || f.date;
      const lfW = lfDay ? { from: lfFix ? (f.showFrom === f.date ? lfFix : f.showFrom) : f.showFrom || lfDay, until: iso(addDays(parse(lfDay), 10)), greetUntil: iso(addDays(parse(lfDay), 2)) } : null;
      const bdayTxt = (pp) => (pp.bday ? 'יום הולדת ' + Number(pp.bday.slice(3)) + '.' + Number(pp.bday.slice(0, 2)) : '');
      const lfSuggest = kind === 'life' && !lfP && q ? people.filter((pp) => pp.active && [pp.name, pp.rank, pp.role, pp.unit].join(' ').includes(q)).slice(0, 5) : [];

      const evShowList = events.filter((e) => e.date > ti || (e.date === ti && toMin(e.end) > nm)).sort((a, b) => ((a.date + a.start) < (b.date + b.start) ? -1 : 1)).slice(0, 6);
      const soonish = (e) => e.date === ti && toMin(e.start) - nm <= 30;   // running or starting within half an hour: stays until it ends
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

        tkOn: !!tk, tkTitle: this.tkTitle(tk), tkRemain: tk && tkK !== 'welcome' ? 'נותרו ' + mmss(remain) : '', endTk: () => this.endTk(),
        tkEndLabel: tkK === 'welcome' ? 'כניסה לצג הבית ✦' : 'חזרה לתצוגה רגילה', tkWelcome: tkK === 'welcome', tkGuest: tkK === 'welcome' ? tk.guest || '' : '',
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
        wallHref: '/' + (D && D.config && D.config.displayKey ? '?key=' + encodeURIComponent(D.config.displayKey) : ''), wallSrc: s.wallSrc, livePreview: !!s.wallSrc && (s.liveView || s.studio),
        offerLive: !!s.wallSrc && !s.liveView && !s.studio, showLive: () => this.setState({ liveView: true }),
        previewTransform: 'scale(' + ((s.pw || 560) / 1920).toFixed(4) + ')',
        previewFilter: brightness < 100 ? 'brightness(' + (brightness / 100).toFixed(2) + ')' : 'none',   // a filter, even a neutral one, redraws the whole preview each frame
        brightness, setBrightness: (e) => { const v = +e.target.value; this.setState({ brightness: v }); this.burst('br', () => this.run('brightness', { value: v }, null, { quiet: true }).catch(() => {}).finally(() => this.setState({ brightness: null }))); },

        showToday: !s.studio,
        tabs: [['today', 'היום'], ['soon', 'אירועים קרובים'], ['people', 'אנשים']].map(([id, label]) => Object.assign({ id, label }, seg(s.tab === id), { pick: () => this.setState({ tab: id }) })),
        tabToday: s.tab === 'today', tabSoon: s.tab === 'soon', tabPeople: s.tab === 'people',
        addEvent: () => this.openEvent(), addLife: () => this.openLife(), addTicker: () => this.openTicker(), toPeople: () => this.setState({ tab: 'people' }),

        // people screen
        pq: s.pq, setPq: (e) => this.setState({ pq: e.target.value }), hasPeople: people.length > 0,
        pSummary: activeP.length ? cnt(activeP.length, 'אדם אחד', 'אנשים') + (bdaysMonth ? ' · ' + cnt(bdaysMonth, 'יום הולדת אחד', 'ימי הולדת') + ' החודש' : '') + (noBirthday ? ' · ' + (noBirthday === 1 ? 'לאחד' : 'ל-' + noBirthday) + ' חסר תאריך לידה' : '') : '',
        pRows: activeP.filter(pMatch).map(pRow), pNoMatch: !!pq && activeP.length > 0 && !activeP.some(pMatch),
        pInactive: inactiveP.filter(pMatch).map(pRow), showInactive: s.showInactive, toggleInactive: () => this.setState({ showInactive: !s.showInactive }),
        addPerson: () => this.openPerson(), pickImport: () => this.importRef.current && this.importRef.current.click(), onImportFile: (e) => this.onImportFile(e),
        impBtn: s.impBusy ? 'קורא את הקובץ…' : 'ייבוא מאקסל', exportPeople: () => this.exportPeople(),
        celebs: cel.map(celRow), hasCelebs: cel.length > 0, noCelebs: cel.length === 0,
        hasQuiet: quiet.length > 0, quietNames: quiet.map((x) => dn(x.person)).join(', '),
        todayRows: rows, soonRows,

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
          hasActions: !!(m.actions && m.actions.length), hasUndo: !!m.undoId, undo: () => this.undoReply(m),
          props: (m.proposals || []).map((p) => Object.assign({}, p, { kindLabel: p.kind === 'news' ? 'ידיעה לניוזלטר בצג' : p.kind === 'image' ? 'תמונה על כל המסך' : 'שידור חי על כל המסך',
            el: p.image ? imgEl(p.image, { display: 'block', width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10 }) : null,
            approve: () => this.approve(m, p), dismiss: () => this.dismiss(m, p) })),
          files: (m.files || []).map((fl) => Object.assign({}, fl, { isImg: fl.kind === 'image', isDoc: fl.kind !== 'image', el: fl.src ? imgEl(fl.src, { display: 'block', maxWidth: 180, maxHeight: 120, borderRadius: 10, border: '1px solid rgba(150,190,240,.2)' }) : null })) })),
        agentReady: agentOn, agentSub: !D ? '' : agent.ready ? 'כתבו מה לשנות, והסוכן יבצע. אפשר לבטל כל שינוי.' : 'צריך לחבר פעם אחת מפתח API',
        greeting: agentOn && !s.messages.length ? 'שלום' + (s.who ? ' ' + s.who : '') + '! כתבו כאן מה לשנות בצג, ואבצע את זה מיד: להוסיף יום הולדת או שמחה, להזיז אירוע, להעלות הודעה דחופה, לעדכן את רשימת האנשים, לשנות משהו בעיצוב, להביא ידיעה או תמונה מהאינטרנט (הן עולות לצג רק אחרי אישור שלכם) ולפתוח שידור חי של שיגור. כל שינוי אפשר לבטל. אפשר גם לצרף אקסל, CSV או תמונה.' : '',
        agentBusy: s.agentBusy, busyText: 'עובד על זה…' + (s.agentBusy && now - s.agentAt >= 5000 ? ' ' + Math.round((now - s.agentAt) / 1000) + ' שנ׳' : ''),
        showSuggest: agentOn && !s.messages.length && !s.agentBusy,
        suggestions: SUGGESTIONS.map((sg) => ({ label: sg.label, send: () => (sg.send ? this.sendChat(sg.label) : this.setState({ chatInput: sg.fill }, () => { const t = document.getElementById('agent-input'); if (t) { t.focus(); t.setSelectionRange(sg.fill.length, sg.fill.length); } })) })),
        // the key: a setup card until the agent is connected, then a small card to replace or disconnect it
        keyCard: !!D && (!agent.ready || s.keyOpen), keySetup: !agent.ready, keyHint: agent.hint, keyFromServer: agent.fromServer,
        keyManage: agentOn, toggleKey: () => this.setState({ keyOpen: !s.keyOpen, keyErr: '' }),
        keyDraft: s.keyDraft, setKeyDraft: (e) => this.setState({ keyDraft: e.target.value, keyErr: '' }), keyErr: s.keyErr, keyBusy: s.keyBusy,
        saveKey: () => !s.keyBusy && this.saveKey(s.keyDraft), dropKey: () => !s.keyBusy && this.saveKey(null),
        keyEnter: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!s.keyBusy) this.saveKey(s.keyDraft); } },
        hasAttach: s.attach.length > 0,
        attachList: s.attach.map((a) => Object.assign({}, a, { isImg: a.kind === 'image', el: a.src ? imgEl(a.src, { width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }) : null, remove: () => this.setState((st) => ({ attach: st.attach.filter((x) => x.id !== a.id) })) })),
        chatInput: s.chatInput, setChatInput: (e) => this.setState({ chatInput: e.target.value }),
        chatKey: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); this.sendChat(); } },
        sendChat: () => this.sendChat(), sendBg: LIME, sendOpacity: s.agentBusy ? 0.5 : 1,
        dragging: s.dragging,
        onDragOver: (e) => { e.preventDefault(); if (!s.dragging) this.setState({ dragging: true }); },
        onDragLeave: (e) => { if (e.currentTarget.contains(e.relatedTarget)) return; this.setState({ dragging: false }); },
        onDrop: (e) => { e.preventDefault(); this.setState({ dragging: false }); this.addFiles(e.dataTransfer.files); },

        sheetOn: !!sh, closeSheet: () => this.closeSheet(), sheetBackdrop: (e) => { if (e.target === e.currentTarget) this.closeSheet(); },
        sheetAlign: small ? 'flex-end' : 'center', sheetPad: small ? '0' : '24px', sheetRadius: small ? '20px 20px 0 0' : '20px', sheetMaxH: small ? '92vh' : '88vh',
        sheetTitle: { celebrate: 'מודעה אישית על כל המסך', eventShow: 'מודעה מנהלת על כל המסך', life: sh && sh.mode === 'edit' ? 'עריכה באנשי המנהלת' : 'הוספה לאנשי המנהלת', event: sh && sh.mode === 'edit' ? 'עריכת אירוע' : 'אירוע חדש', newsletter: 'ניוזלטר השבוע', urgent: 'הודעה דחופה', welcome: 'מסך ברוכים הבאים', history: 'היסטוריית שינויים',
          person: sh && sh.mode === 'edit' ? 'פרטי ' + [f.first, f.last].filter(Boolean).join(' ') : 'אדם חדש ברשימה', import: 'ייבוא אנשים מקובץ', ticker: sh && sh.mode === 'edit' ? 'עריכה ברצועת האירועים' : 'אירוע או הזדמנות לרצועה' }[kind] || '',
        shCeleb: kind === 'celebrate', shEvShow: kind === 'eventShow', shLife: kind === 'life', shEvent: kind === 'event', shNl: kind === 'newsletter', shUrgent: kind === 'urgent', shWelcome: kind === 'welcome', shHistory: kind === 'history',
        shPerson: kind === 'person', shImport: kind === 'import', shTicker: kind === 'ticker',
        openLifeNew: () => this.openLife(), openEventNew: () => this.openEvent(),
        showEvents: evShowList.map((e) => { const live = tk && tk.eventId === e.id; const d = parse(e.date);
          return { key: e.id, title: e.title, when: (e.date === ti ? 'היום' : 'יום ' + DOWS[d.getDay()] + ' ' + dm(e.date)) + ' · ' + e.start + '–' + e.end + (e.place ? ' · ' + e.place : ''), btn: live ? 'מוצג עכשיו' : soonish(e) ? 'הצגה עכשיו' : 'הצצה ל-10 דק׳', show: () => { if (!live) this.showEvent(e); this.closeSheet(); } }; }),
        noShowEvents: evShowList.length === 0,

        // Who: free text. A name from the people list is suggested while typing, and picking it (or typing it in full)
        // links the event to that person and fills in what the list knows.
        lfNameVal: f.name || '', lfNameAuto: kind === 'life' && sh.mode !== 'edit' && !f.personId,
        setLfName: (e) => { const v = e.target.value, hit = f.noLink ? null : this.exactPerson(v); this.setFV(hit ? Object.assign(this.linkLife(hit, f), { name: v }) : { name: v, personId: '' }); },
        lfLinked: !!lfP, lfLinkedName: lfP ? dn(lfP) : '', lfPersonAv: lfP ? this.avatar(lfP) : null,
        lfLinkedLine: lfP ? (onWall(lfP) ? [pline(lfP), bdayTxt(lfP)].filter(Boolean).join(' · ') || 'מרשימת האנשים' : lfP.active ? 'ביקש/ה לא להופיע בצג' : 'כבר לא במנהלת') : '',
        lfUnlink: () => this.setFV({ personId: '', noLink: true }),
        lfSuggest: lfSuggest.map((pp) => ({ key: pp.id, name: dn(pp), line: pp.onWall ? [pline(pp), bdayTxt(pp)].filter(Boolean).join(' · ') : 'ביקש/ה לא להופיע בצג', av: this.avatar(pp),
          pick: () => this.setFV(Object.assign(this.linkLife(pp, f), { noLink: false })) })),
        lfFree: kind === 'life' && !lfP && q.length >= 2,
        lfFreeHint: lfSuggest.length ? 'או המשיכו לכתוב: אפשר כל שם, גם של מי שלא ברשימה.' : 'לא ברשימת האנשים. בצג יופיע השם כפי שנכתב.',
        lfAddPerson: () => { const w = q.split(' ').filter(Boolean); this.openPerson(null, { first: w[0] || '', last: w.slice(1).join(' ') }, sh); },
        lfAddLabel: '+ להוסיף את "' + q + '" לרשימת האנשים (לא חובה)',
        lfType: f.type || '',
        setLfType: (e) => { const v = e.target.value; this.setFV(Object.assign({ type: v }, /הולדת/.test(v) && !/הולדת/.test(f.type || '') && lfP && lfP.bday ? this.bdayDates(lfP.bday, f) : {})); },
        typeChips: TYPE_CHIPS.map((t) => ({ label: t, border: f.type === t ? LIME : 'rgba(150,190,240,.22)',
          pick: () => this.setFV(Object.assign({ type: t }, /הולדת/.test(t) && lfP && lfP.bday ? this.bdayDates(lfP.bday, f) : {})) })),
        lfBdayHint: lfFix ? 'זה נראה כמו תאריך לידה, אז המודעה האישית תעלה ביום ההולדת הקרוב: ' + dm(lfFix) + '.' + lfFix.slice(0, 4) : '',
        lfDate: f.date || '', setLfDate: (e) => { const v = e.target.value; this.setFV(sh && sh.mode !== 'edit' && f.showFrom === f.date ? { date: v, showFrom: v < ti ? ti : v } : { date: v }); },
        lfShowFrom: f.showFrom || '', setLfShowFrom: this.fv('showFrom'),
        lfPhotoOpts: [['crm', lfP ? 'מהרשימה' : 'ראשי תיבות'], ['upload', 'העלאה'], ['none', 'בלי תמונה']].map(([v, label]) => Object.assign({ v, label }, seg(f.photo === v), { pick: () => { this.setFV({ photo: v }); if (v === 'upload' && !f.photoSrc && this.photoRef.current) this.photoRef.current.click(); } })),
        lfIsUpload: f.photo === 'upload', lfIsCrm: f.photo === 'crm', lfHasSrc: !!f.photoSrc,
        lfCrmHint: lfP ? 'תמונת הפרופיל נשלפת מרשימת האנשים. אם אין תמונה, יוצגו ראשי תיבות.' : 'יוצגו ראשי התיבות של השם.',
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
        lfPName: lfP ? dn(lfP) : q || 'שם', lfPLine: lfP ? pline(lfP) : q ? '' : 'תפקיד · ענף', lfNameColor: lfT.quiet ? '#cfd8e6' : '#e6f1ff',
        lfPMsg: f.note || (lfT.quiet ? 'משפחת מנהלת החלל משתתפת בצערך' : 'מאחלים המון אושר והצלחה — ממשפחת מנהלת החלל'),
        lfPrevBg: lfT.quiet ? '#0b1120' : 'radial-gradient(circle at 50% 40%, #1b2f5c 0%, #040914 75%)',
        lfQuiet: !!lfT.quiet, lfNotQuiet: !lfT.quiet,
        lfWindow: lfW ? 'מוצג בפאנל האנשים מ-' + dm(lfW.from) + ' עד ' + dm(lfW.until) + ', ועולה על כל המסך כל חצי שעה מ-' + dm(lfDay) + ' עד ' + dm(lfW.greetUntil) : '',
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

        // person sheet
        psEdit: kind === 'person' && sh.mode === 'edit',
        psAv: kind === 'person' ? this.avatar({ id: f.id || 'new', name: [f.first, f.last].filter(Boolean).join(' ') || '?' }, f.photo) : null,
        psFirst: f.first || '', setPsFirst: this.fv('first'), psLast: f.last || '', setPsLast: this.fv('last'),
        psRank: f.rank || '', setPsRank: this.fv('rank'), psRole: f.role || '', setPsRole: this.fv('role'), psUnit: f.unit || '', setPsUnit: this.fv('unit'),
        psKinds: KINDS.map(([k, label]) => Object.assign({ v: k, label }, seg((f.kind || 'civilian') === k), { pick: () => this.setFV({ kind: k }) })),
        psBirthday: f.birthday || '', setPsBirthday: this.fv('birthday'), psJoined: f.joined || '', setPsJoined: this.fv('joined'), psLeaves: f.leaves || '', setPsLeaves: this.fv('leaves'),
        psEmail: f.email || '', setPsEmail: this.fv('email'), psPhone: f.phone || '', setPsPhone: this.fv('phone'), psNotes: f.notes || '', setPsNotes: this.fv('notes'),
        psOnWall: sw(f.onWall !== false), togglePsOnWall: () => this.setFV({ onWall: f.onWall === false }),
        psShowBday: sw(f.onWall !== false && f.showBday !== false), psBdayOff: f.onWall === false, togglePsShowBday: () => { if (f.onWall !== false) this.setFV({ showBday: f.showBday === false }); },
        psActive: sw(f.active !== false), togglePsActive: () => this.setFV({ active: f.active === false }),
        psProfile: Object.keys(PROFILE_LABELS).filter((k) => f.profile && f.profile[k]).map((k) => ({ key: k, label: PROFILE_LABELS[k], text: f.profile[k], link: k === 'photo_link' && /^https?:\/\//.test(f.profile[k]) })),
        psAddMoment: kind === 'person' && sh.mode === 'edit' && f.active !== false && f.onWall !== false ? () => this.openLife(null, { personId: f.id }) : null,
        psPhotoBtn: s.photoBusy ? 'מעלה…' : f.photo ? 'החלפת תמונה' : 'העלאת תמונה', psHasPhoto: !!f.photo,
        pickPsPhoto: () => { if (!s.photoBusy && this.personPhotoRef.current) this.personPhotoRef.current.click(); }, clearPsPhoto: () => this.setFV({ photo: null }),
        onPersonPhoto: (e) => this.onPersonPhoto(e),
        savePerson: () => this.savePerson(), deletePerson: () => this.delPerson(f), psSaveLabel: sh && sh.mode === 'edit' ? 'שמירת שינויים' : 'הוספה לרשימה',

        // import sheet
        ...(kind === 'import' ? this.importVals(f.imp) : {}),
        doImport: () => { if (!s.impBusy) this.doImport(); }, impGo: s.impBusy ? 'מייבא…' : null,

        // ticker sheet
        tiName: f.name || '', setTiName: this.fv('name'), tiStart: f.start || '', setTiStart: this.fv('start'), tiEnd: f.end || '', setTiEnd: this.fv('end'),
        tiPlace: f.place || '', setTiPlace: this.fv('place'), tiUrl: f.url || '', setTiUrl: this.fv('url'),
        tiKinds: [['אירוע', 'אירוע'], ['הזדמנות', 'הזדמנות (מועד אחרון)']].map(([k, label]) => Object.assign({ v: k, label }, seg((f.kind || 'אירוע') === k), { pick: () => this.setFV({ kind: k }) })),
        tiEdit: kind === 'ticker' && sh.mode === 'edit', saveTicker: () => this.saveTicker(), deleteTicker: () => this.delTicker(f),

        urInput: f.text || '', setUrInput: this.fv('text'),
        wlInput: f.guest || '', setWlInput: this.fv('guest'),
        sendWl: () => { this.showWelcome((f.guest || '').trim()); this.closeSheet(); },
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
        if (needToken) { const t = codeOf(s.tokenDraft); if (!t) return this.setState({ gateErr: 'הדביקו את קוד הגישה' }); store.set('sw-remote-token', t); keepLink(t); this.setState({ auth: true, tokenDraft: '', gateErr: '' }, () => this.refresh()); }
        const w = s.whoDraft.trim();
        if (!s.who && w) { store.set('sw-remote-who', w); this.setState({ who: w }); }
      };
      return el('div', 'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:radial-gradient(1200px 600px at 60% -10%, #0c1c3a 0%, #040914 60%)', { dir: 'rtl' },
        el('form', 'width:100%;max-width:420px;background:#0a1530;border:1px solid rgba(150,190,240,.2);border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:22px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box', { onSubmit: (e) => { e.preventDefault(); submit(); } },
          el('div', 'display:flex;align-items:center;gap:12px',
            el('img', 'width:42px;height:42px;border-radius:50%;background:#e6f1ff;object-fit:contain;padding:3px;box-sizing:border-box;flex:none', { src: '/assets/logo-mark.png', alt: '' }),
            el('h1', 'margin:0;font-size:20px;font-weight:800', null, 'שלט צג החלל')),
          needToken ? el('span', 'font-size:14px;color:#8b9dbd;text-wrap:pretty', null, 'פתחו את השלט מהקישור הפרטי שקיבלתם, או הדביקו כאן את הקישור או את קוד הגישה.') : null,
          needToken ? input(s.tokenDraft, (e) => this.setState({ tokenDraft: e.target.value }), 'קוד גישה או קישור', { dir: 'ltr', autoComplete: 'off', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }) : null,
          s.gateErr ? el('span', 'font-size:14px;color:#ffb4a8;text-wrap:pretty', { role: 'alert' }, s.gateErr) : null,
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
      const smallBtn = (label, onClick, extra) => el('button', 'min-height:38px;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.25);background:transparent;color:#e6f1ff;font-size:14px;cursor:pointer;white-space:nowrap' + (extra || ''), { onClick }, label);
      const linkBtn = (label, onClick) => el('button', 'padding:0;border:none;background:none;color:#9fdcff;font-size:inherit;cursor:pointer;text-decoration:underline', { onClick }, label);
      const dashedBtn = (label, onClick) => el('button', 'min-height:44px;border-radius:12px;border:1px dashed rgba(159,220,255,.35);background:transparent;color:#9fdcff;font-size:15px;cursor:pointer', { onClick }, label);
      const lbl = (text, child, grow) => el('label', `flex:${grow || 1};min-width:140px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#8b9dbd`, null, text, child);
      const row2 = (...kids) => el('div', 'display:flex;gap:10px;flex-wrap:wrap', null, ...kids);
      const textIn = (value, onChange, extra) => el('input', field, Object.assign({ value, onChange }, extra));
      const dateIn = (value, onChange) => el('input', dateField, { type: 'date', value, onChange });
      const toggleRow = (title, sub, sw, onClick) => el('div', 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-radius:14px;background:rgba(4,9,20,.5);border:1px solid rgba(150,190,240,.12)', null,
        el('div', 'display:flex;flex-direction:column;gap:2px;min-width:0', null, el('span', 'font-size:15px;font-weight:600', null, title), el('span', 'font-size:12.5px;color:#8b9dbd;text-wrap:pretty', null, sub)),
        toggleBtn(true, sw.j, sw.tbg, onClick, title));
      const saveBtn = (label, onClick, disabled) => el('button', 'flex:1;min-width:140px;min-height:48px;border-radius:12px;border:none;background:#d4f25c;color:#0b1400;font-size:16px;font-weight:700;cursor:pointer', { onClick, disabled }, label);
      const delBtn = (label, onClick) => el('button', 'min-height:48px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,122,107,.5);background:transparent;color:#ff7a6b;font-size:15px;cursor:pointer', { onClick }, label);
      const personRow = (r) => el('button', 'display:flex;align-items:center;gap:12px;width:100%;padding:8px 4px;border:none;border-bottom:1px solid rgba(150,190,240,.08);background:transparent;color:#e6f1ff;cursor:pointer;text-align:right', { key: r.key, onClick: r.open, className: 'sw-hover' },
        avatarDiv(40, 14, r.av),
        el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px', null,
          el('span', 'font-size:15px;font-weight:600', null, r.name),
          el('span', 'font-size:12px;color:#8b9dbd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', null, r.line),
          r.tags.length ? el('div', 'display:flex;gap:6px;flex-wrap:wrap;padding-top:2px', null, r.tags.map((t) => el('span', `font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid ${t.c};color:${t.c}`, { key: t.t }, t.t))) : null),
        r.bday ? el('span', "flex:none;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#e9b872;direction:ltr", null, r.bday + ' 🎂') : null);

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
        el('button', v.tkWelcome ? 'flex:none;min-height:48px;padding:0 20px;border-radius:12px;border:none;background:#d4f25c;color:#0b1400;font-size:16px;font-weight:800;cursor:pointer;white-space:nowrap;box-shadow:0 0 24px rgba(212,242,92,.35)'
          : 'flex:none;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid rgba(212,242,92,.6);background:transparent;color:#d4f25c;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap', { onClick: v.endTk }, v.tkEndLabel)) : null;
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
              el('span', 'font-size:5.4cqw;font-weight:800', null, 'סרטון תדמית'),
              el('span', 'font-size:1.7cqw;color:#8b9dbd', null, 'סרטון התדמית · מנהלת החלל'),
              el('div', 'position:absolute;left:6cqw;right:6cqw;bottom:5cqw;height:.45cqw;border-radius:1cqw;background:rgba(150,190,240,.2);overflow:hidden', null, el('div', { height: '100%', width: v.tkPct, background: '#d4f25c' }))) : null,
            v.tkWelcome ? el('div', 'position:absolute;inset:0;direction:ltr;background:radial-gradient(ellipse at 50% 40%, #142a55 0%, #020611 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6cqw;text-align:center', null,
              el('img', 'width:9cqw;height:9cqw;border-radius:50%;background:#eef5fd;object-fit:contain;padding:.8cqw;box-sizing:border-box;box-shadow:0 0 3cqw rgba(111,214,234,.6);margin-bottom:1.4cqw', { src: '/assets/logo-mark.png', alt: '' }),
              el('span', "font-family:'IBM Plex Mono',monospace;font-size:1.7cqw;letter-spacing:.5em;color:#9fdcff", null, 'WELCOME TO'),
              el('span', "font-family:'Lexend',sans-serif;font-size:5cqw;font-weight:600;line-height:1.05", null, 'THE SPACE', el('br'), 'PROGRAM OFFICE'),
              v.tkGuest ? el('span', "font-family:'Lexend',sans-serif;font-size:2cqw;color:#d4f25c;margin-top:.6cqw", { dir: 'auto' }, v.tkGuest) : null) : null,
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
            v.urgentOn ? el('div', 'position:absolute;top:0;left:0;right:0;direction:rtl;padding:1cqw 2cqw;background:#b3261e;color:#fff;font-size:1.9cqw;font-weight:700;text-align:center', null, v.urgentText) : null),
          v.offerLive ? el('button', 'position:absolute;left:10px;bottom:10px;direction:rtl;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(150,190,240,.35);background:rgba(6,12,26,.82);color:#e6f1ff;font-size:14px;font-weight:600;cursor:pointer', { type: 'button', onClick: v.showLive }, '▶ תצוגה חיה') : null),
        el('div', 'display:flex;align-items:center;gap:12px', null,
          el('span', 'font-size:14px;color:#8b9dbd;flex:none', null, 'בהירות'),
          el('input', 'flex:1;min-width:0;height:28px', { type: 'range', min: 10, max: 100, value: v.brightness, onChange: v.setBrightness, 'aria-label': 'בהירות' }),
          el('span', "font-family:'IBM Plex Mono',monospace;font-size:14px;width:44px;text-align:left;flex:none", null, v.brightness + '%')));

      // ---- today / upcoming
      const todayPanel = v.showToday ? el('section', 'border-radius:20px;border:1px solid rgba(150,190,240,.14);background:rgba(14,28,58,.55);padding:14px 16px;display:flex;flex-direction:column;gap:14px;scroll-margin-top:12px', { ref: this.panelRef },
        segWrap(3, v.tabs.map((t) => el('button', `min-height:40px;border-radius:9px;border:none;background:${t.bg};color:${t.fg};font-size:15px;font-weight:700;cursor:pointer`, { key: t.id, onClick: t.pick }, t.label))),
        v.tabToday ? h(React.Fragment, null,
          el('div', 'display:flex;flex-direction:column;gap:10px', null,
            el('div', 'display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap', null,
              el('span', 'font-size:15px;font-weight:700', null, 'מודעות אישיות היום'),
              el('span', 'font-size:12px;color:#8b9dbd', null, 'עולות לבד על כל המסך כל :00 ו-:30 · לחיצה מציגה עכשיו')),
            v.hasCelebs ? el('div', 'display:flex;flex-wrap:wrap;gap:8px', null, v.celebs.map((c) =>
              el('button', 'display:flex;align-items:center;gap:8px;padding:5px 5px 5px 14px;border-radius:999px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.5);color:#e6f1ff;cursor:pointer;text-align:right', { key: c.key, onClick: c.show },
                avatarDiv(34, 13, c.av),
                el('div', 'display:flex;flex-direction:column;gap:0', null, el('span', 'font-size:14px;font-weight:600', null, c.name), el('span', `font-size:12px;color:${c.color}`, null, c.type))))) : null,
            v.noCelebs ? el('span', 'font-size:14px;color:#8b9dbd', null, 'אין מודעות אישיות היום', v.hasPeople ? null : h(React.Fragment, null, ' · רשימת האנשים עדיין ריקה: ', linkBtn('להוספת אנשים', v.toPeople))) : null,
            v.hasQuiet ? el('span', 'font-size:13px;color:#8b9dbd', null, 'מוצג בשקט בפאנל האנשים: ' + v.quietNames) : null),
          el('div', 'display:flex;flex-direction:column', null,
            el('span', 'font-size:15px;font-weight:700;padding-bottom:6px', null, 'לוח הזמנים היום'),
            v.todayRows.map((r) => el('div', `display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(150,190,240,.08);opacity:${r.op}`, { key: r.key },
              el('span', "flex:none;width:96px;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#cfe0f7;direction:ltr;text-align:right", null, r.time),
              el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px', null, el('span', 'font-size:15px;font-weight:600;text-wrap:pretty', null, r.title), el('span', 'font-size:12px;color:#8b9dbd', null, r.sub)),
              r.hasBtn ? el('button', 'flex:none;min-height:36px;padding:0 12px;border-radius:10px;border:1px solid rgba(159,220,255,.4);background:transparent;color:#9fdcff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap', { onClick: r.action }, r.btn) : null,
              r.hasToggle ? toggleBtn(true, r.j, r.tbg, r.toggle, r.title) : null)))) : null,
        v.tabSoon ? el('div', 'display:flex;flex-direction:column', null,
          el('div', 'display:flex;gap:6px;flex-wrap:wrap;padding-bottom:4px', null,
            smallBtn('+ לאירועים', v.addEvent), smallBtn('+ לאנשי המנהלת', v.addLife), smallBtn('+ לרצועת האירועים', v.addTicker)),
          v.soonRows.length ? null : el('span', 'font-size:14px;color:#8b9dbd;padding:10px 0;text-wrap:pretty', null, 'עוד אין אירועים קרובים. אפשר להוסיף לאירועים, לאנשי המנהלת או לרצועת האירועים בכפתורים למעלה.'),
          v.soonRows.map((r) => h(React.Fragment, { key: r.key },
            r.head ? el('span', 'padding:14px 0 2px;font-size:13px;font-weight:700;color:#9fdcff', null, r.head) : null,
            el('div', 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(150,190,240,.08)', null,
              el('div', 'flex:none;width:44px;height:44px;border-radius:10px;background:rgba(4,9,20,.6);border:1px solid rgba(150,190,240,.14);display:flex;flex-direction:column;align-items:center;justify-content:center', null,
                el('span', 'font-size:16px;font-weight:800;line-height:1', null, r.day), el('span', 'font-size:11px;color:#8b9dbd', null, r.dow)),
              el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px', null,
                el('span', 'font-size:15px;font-weight:600;text-wrap:pretty', null, r.title),
                el('div', 'display:flex;align-items:center;gap:8px;flex-wrap:wrap', null,
                  el('span', `font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid ${r.tagColor};color:${r.tagColor}`, null, r.tag),
                  el('span', 'font-size:12px;color:#8b9dbd', null, r.sub))),
              r.editable ? el('div', 'flex:none;display:flex;gap:6px', null,
                el('button', 'min-height:36px;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#e6f1ff;font-size:13px;cursor:pointer', { onClick: r.edit }, 'עריכה'),
                el('button', 'width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,122,107,.35);background:transparent;color:#ff7a6b;font-size:14px;cursor:pointer', { onClick: r.del, 'aria-label': 'מחיקה' }, '✕')) : null,
              r.open ? el('button', 'flex:none;min-height:36px;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#e6f1ff;font-size:13px;cursor:pointer', { onClick: r.open }, 'פרטים') : null))),
          el('span', 'padding-top:12px;font-size:12px;color:#8b9dbd;text-wrap:pretty', null, 'ימי ההולדת מחושבים לבד מתאריכי הלידה ברשימת האנשים, 30 יום קדימה. ברצועת האירועים בצג מופיעים גם האירועים מהניוזלטר השבועי. ',
            linkBtn('לרשימת האנשים', v.toPeople))) : null,
        v.tabPeople ? el('div', 'display:flex;flex-direction:column;gap:10px', null,
          el('div', 'display:flex;gap:6px;flex-wrap:wrap', null,
            el('button', 'min-height:38px;padding:0 14px;border-radius:10px;border:none;background:#d4f25c;color:#0b1400;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap', { onClick: v.addPerson }, '+ הוספת אדם'),
            smallBtn(v.impBtn, v.pickImport), v.hasPeople ? smallBtn('ייצוא לאקסל', v.exportPeople) : null),
          v.hasPeople ? el('input', field, { value: v.pq, onChange: v.setPq, placeholder: 'חיפוש לפי שם, ענף, תפקיד או טלפון', type: 'search' }) : null,
          v.pSummary ? el('span', 'font-size:12px;color:#8b9dbd', null, v.pSummary) : null,
          v.hasPeople ? null : el('div', 'display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:14px;border:1px dashed rgba(159,220,255,.3);background:rgba(4,9,20,.4)', null,
            el('span', 'font-size:15px;font-weight:700', null, 'עוד אין אנשים ברשימה'),
            el('span', 'font-size:13px;color:#8b9dbd;line-height:1.55;text-wrap:pretty', null, 'מהרשימה הזאת הצג יודע מתי יש ימי הולדת ולמי לשייך שמחות. אפשר להוסיף אחד-אחד, או לייבא בבת אחת קובץ אקסל, כולל גיליון התשובות של טופס ההיכרות (בגוגל שיטס: קובץ ← הורדה ← Microsoft Excel).')),
          v.pNoMatch ? el('span', 'font-size:14px;color:#8b9dbd;padding:4px 0', null, 'אין התאמות לחיפוש') : null,
          el('div', 'display:flex;flex-direction:column', null, v.pRows.map(personRow)),
          v.pInactive.length ? h(React.Fragment, null,
            el('button', 'align-self:flex-start;padding:4px 0;border:none;background:none;color:#8b9dbd;font-size:13px;cursor:pointer', { onClick: v.toggleInactive }, (v.showInactive ? '▾ ' : '◂ ') + 'כבר לא במנהלת (' + v.pInactive.length + ')'),
            v.showInactive ? el('div', 'display:flex;flex-direction:column;opacity:.75', null, v.pInactive.map(personRow)) : null) : null) : null) : null;

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
      const closeX = 'flex:none;width:40px;height:40px;border-radius:10px;border:none;background:rgba(150,190,240,.08);color:#8b9dbd;font-size:16px;cursor:pointer';
      const keyCard = v.keyCard ? el('div', 'display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:14px;background:rgba(4,9,20,.6);border:1px solid rgba(212,242,92,.3)', null,
        v.keySetup ? h(React.Fragment, null,
          el('span', 'font-size:16px;font-weight:800', null, 'מחברים את הסוכן, פעם אחת'),
          el('span', 'font-size:14px;color:#b9c8e2;line-height:1.5;text-wrap:pretty', null, 'הסוכן עובד עם Claude ומבצע את הבקשות כאן, בשלט. לשם כך צריך מפתח API:'),
          el('ol', 'margin:0;padding:0 20px 0 0;display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.5', null,
            el('li', null, null, 'נכנסים ל-', el('a', 'color:#9fdcff', { href: 'https://console.anthropic.com', target: '_blank', rel: 'noopener noreferrer' }, 'console.anthropic.com'), ' ומתחברים.'),
            el('li', null, null, 'ב-Billing מוסיפים אמצעי תשלום וקרדיט. התשלום לפי שימוש, בערך כמה סנטים לבקשה.'),
            el('li', null, null, 'ב-API Keys לוחצים Create Key, מעתיקים את המפתח ומדביקים כאן:')))
          : el('div', 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px', null,
            el('span', 'font-size:14px;line-height:1.5;text-wrap:pretty;padding-top:8px', null, 'הסוכן מחובר' + (v.keyHint ? ' עם מפתח שמסתיים ב-\u2066' + v.keyHint + '\u2069' : '') + '.' + (v.keyFromServer ? ' המפתח מוגדר בהגדרות השרת.' : ' כדי להחליף, מדביקים מפתח אחר:')),
            el('button', closeX, { onClick: v.toggleKey, 'aria-label': 'סגירה' }, '✕')),
        v.keyFromServer ? null : el('div', 'display:flex;gap:8px', null,
          el('input', "flex:1;min-width:0;min-height:44px;box-sizing:border-box;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px;direction:ltr;text-align:left;font-family:'IBM Plex Mono',monospace",
            { type: 'password', value: v.keyDraft, onChange: v.setKeyDraft, onKeyDown: v.keyEnter, placeholder: 'sk-ant-…', autoComplete: 'off', spellCheck: false, 'aria-label': 'מפתח API' }),
          el('button', `flex:none;min-width:76px;height:44px;padding:0 14px;border-radius:12px;border:none;background:${LIME};color:#0b1400;font-size:15px;font-weight:800;cursor:pointer;opacity:${v.keyBusy ? 0.6 : 1}`, { onClick: v.saveKey }, v.keyBusy ? 'בודק…' : v.keySetup ? 'חיבור' : 'החלפה')),
        v.keyErr ? el('span', 'font-size:13px;color:#ffb4a8;line-height:1.5;text-wrap:pretty', { role: 'alert' }, v.keyErr) : null,
        v.keySetup ? el('span', 'font-size:12px;color:#8b9dbd;line-height:1.5', null, 'המפתח נשמר בשרת של הצג ולא מוצג שוב.') : null,
        !v.keySetup && !v.keyFromServer ? el('button', 'align-self:flex-start;padding:0;border:none;background:none;color:#ffb4a8;font-size:13px;cursor:pointer;text-decoration:underline', { onClick: v.dropKey }, 'ניתוק הסוכן') : null) : null;
      const agent = el('aside', { position: v.agentPos, top: 0, left: v.agentSide, right: v.agentSide, bottom: v.agentSide, height: v.agentH, zIndex: v.agentZ, display: v.agentDisplay, flexDirection: 'column', background: '#081127', borderRight: '1px solid rgba(150,190,240,.14)', boxSizing: 'border-box' },
        { onDragOver: v.onDragOver, onDragLeave: v.onDragLeave, onDrop: v.onDrop },
        el('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid rgba(150,190,240,.12)', null,
          el('div', 'display:flex;flex-direction:column;gap:2px;min-width:0', null,
            el('span', 'font-size:17px;font-weight:800', null, 'סוכן הצג'),
            el('span', 'font-size:12px;color:#8b9dbd', null, v.agentSub)),
          el('div', 'display:flex;gap:6px;flex:none', null,
            v.keyManage ? el('button', 'height:40px;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#9fdcff;font-size:13px;cursor:pointer', { onClick: v.toggleKey }, 'מפתח') : null,
            v.narrow ? el('button', closeX, { onClick: v.closeChat, 'aria-label': 'סגירה' }, '✕') : null)),
        // the key card stays in view above the conversation, however far down it is scrolled
        keyCard ? el('div', 'flex:none;max-height:70vh;overflow-y:auto;padding:16px 18px 0', null, keyCard) : null,
        el('div', 'flex:1;min-height:0;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:14px', { ref: this.scrollRef },
          v.greeting ? el('div', 'font-size:15px;line-height:1.55;white-space:pre-wrap;text-wrap:pretty', null, v.greeting) : null,
          v.msgs.map((m) => el('div', 'display:flex;flex-direction:column;gap:6px', { key: m.id },
            m.isUser ? el('div', 'align-self:flex-end;max-width:88%;display:flex;flex-direction:column;gap:6px;align-items:flex-end', null,
              m.files.map((fl, i) => el('div', null, { key: i },
                fl.isImg ? fl.el : null,
                fl.isDoc ? el('div', 'display:flex;flex-direction:column;gap:1px;padding:8px 12px;border-radius:10px;background:rgba(212,242,92,.08);border:1px solid rgba(212,242,92,.3)', null, el('span', 'font-size:13px;font-weight:600;direction:ltr', null, fl.name), el('span', 'font-size:11px;color:#8b9dbd', null, fl.info)) : null)),
              m.hasText ? el('div', 'padding:10px 14px;border-radius:14px;background:rgba(159,220,255,.14);font-size:15px;line-height:1.5;white-space:pre-wrap;text-wrap:pretty', null, m.text) : null) : null,
            m.isBot ? el('div', 'display:flex;flex-direction:column;gap:8px;max-width:95%', null,
              el('div', `font-size:15px;line-height:1.55;white-space:pre-wrap;text-wrap:pretty;color:${m.color}`, null, m.text),
              m.hasActions ? el('div', 'display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:12px;background:rgba(4,9,20,.6);border:1px solid rgba(150,190,240,.12)', null,
                m.actions.map((a, i) => el('div', `display:flex;align-items:baseline;gap:8px;font-size:13px;color:#b9c8e2${m.undone ? ';text-decoration:line-through' : ''}`, { key: i }, el('span', 'flex:none;width:6px;height:6px;border-radius:50%;background:#d4f25c;transform:translateY(-1px)'), el('span', null, null, a))),
                m.hasUndo ? el('div', 'display:flex;padding-top:6px', null, m.undone
                  ? el('span', 'font-size:13px;color:#8b9dbd', null, 'בוטל')
                  : el('button', 'min-height:34px;padding:0 14px;border-radius:10px;border:1px solid rgba(150,190,240,.25);background:transparent;color:#e6f1ff;font-size:13px;font-weight:600;cursor:pointer', { onClick: m.undo }, 'ביטול')) : null) : null,
              m.props.map((p) => el('div', `display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:rgba(4,9,20,.6);border:1px solid ${p.state === 'done' ? 'rgba(143,224,184,.5)' : 'rgba(212,242,92,.4)'};opacity:${p.state === 'no' ? 0.5 : 1}`, { key: p.id },
                el('span', 'font-size:12px;color:#d4f25c;font-weight:600', null, p.kindLabel + ' · מחכה לאישור'),
                p.el,
                el('span', 'font-size:15px;font-weight:700;line-height:1.35', null, p.title),
                p.text ? el('span', 'font-size:13px;color:#b9c8e2;line-height:1.45', null, p.text) : null,
                p.source || p.url ? el('span', 'font-size:12px;color:#8b9dbd;direction:ltr;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', null,
                  [p.source, p.url ? el('a', 'color:#9fdcff', { key: 'u', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)) : null].filter(Boolean).reduce((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])) : null,
                p.state === 'done' ? el('span', 'font-size:13px;color:#8fe0b8;font-weight:600', null, 'עלה לצג ✓ (אפשר לבטל בהיסטוריה)')
                  : p.state === 'no' ? el('span', 'font-size:13px;color:#8b9dbd', null, 'לא עלה')
                  : el('div', 'display:flex;gap:8px', null,
                    el('button', `flex:1;min-height:40px;border-radius:10px;border:none;background:#d4f25c;color:#0b1400;font-size:14px;font-weight:800;cursor:pointer;opacity:${p.state === 'busy' ? 0.5 : 1}`, { onClick: p.approve }, 'להעלות לצג'),
                    el('button', 'min-height:40px;padding:0 14px;border-radius:10px;border:1px solid rgba(150,190,240,.25);background:transparent;color:#e6f1ff;font-size:14px;cursor:pointer', { onClick: p.dismiss }, 'לא'))))) : null)),
          v.agentBusy ? el('div', 'align-self:flex-start;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;background:rgba(4,9,20,.6);border:1px solid rgba(150,190,240,.12);font-size:14px;color:#b9c8e2', { role: 'status' },
            el('span', 'flex:none;width:8px;height:8px;border-radius:50%;background:#d4f25c'), v.busyText) : null,
          v.showSuggest ? el('div', 'display:flex;flex-wrap:wrap;gap:6px', null, v.suggestions.map((sg) =>
            el('button', 'min-height:34px;padding:6px 12px;line-height:1.35;border-radius:999px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#cfe0f7;font-size:13px;cursor:pointer;text-align:right', { key: sg.label, onClick: sg.send }, sg.label))) : null),
        v.agentReady && v.hasAttach ? el('div', 'display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px 0', null, v.attachList.map((at) =>
          el('div', 'display:flex;align-items:center;gap:8px;padding:4px 4px 4px 10px;border-radius:10px;background:rgba(159,220,255,.1);border:1px solid rgba(159,220,255,.25);max-width:100%', { key: at.id },
            at.isImg ? at.el : null,
            el('div', 'display:flex;flex-direction:column;min-width:0', null, el('span', 'font-size:12px;font-weight:600;direction:ltr;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px', null, at.name), el('span', 'font-size:11px;color:#8b9dbd', null, at.info)),
            el('button', 'width:24px;height:24px;border-radius:6px;border:none;background:transparent;color:#8b9dbd;font-size:12px;cursor:pointer', { onClick: at.remove, 'aria-label': 'הסרה' }, '✕')))) : null,
        v.agentReady ? el('div', 'display:flex;align-items:flex-end;gap:8px;padding:12px 18px 18px', null,
          el('button', 'flex:none;width:44px;height:44px;border-radius:12px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#9fdcff;font-size:22px;line-height:1;cursor:pointer', { onClick: v.pickFiles, 'aria-label': 'צירוף קובץ', title: 'צירוף אקסל, CSV או תמונה' }, '+'),
          el('textarea', 'flex:1;min-width:0;min-height:44px;max-height:140px;overflow:hidden;resize:none;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid rgba(150,190,240,.22);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px;line-height:1.45', { id: 'agent-input', value: v.chatInput, onChange: v.setChatInput, onKeyDown: v.chatKey, rows: 1, placeholder: 'מה לשנות בצג?' }),
          el('button', `flex:none;min-width:64px;height:44px;padding:0 14px;border-radius:12px;border:none;background:${v.sendBg};color:#0b1400;font-size:15px;font-weight:800;cursor:pointer;opacity:${v.sendOpacity}`, { onClick: v.sendChat, 'aria-busy': v.agentBusy }, 'שליחה')) : null,
        v.dragging ? el('div', 'position:absolute;inset:8px;border-radius:16px;border:2px dashed #d4f25c;background:rgba(4,9,20,.88);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#d4f25c;pointer-events:none', null, 'שחררו כדי לצרף') : null);

      // ---- sheets
      const sheet = v.sheetOn ? el('div', { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(1,3,10,.7)', display: 'flex', alignItems: v.sheetAlign, justifyContent: 'center', padding: v.sheetPad, boxSizing: 'border-box' }, { dir: 'rtl', onClick: v.sheetBackdrop },
        el('div', { width: '100%', maxWidth: 560, maxHeight: v.sheetMaxH, overflowY: 'auto', background: '#0a1530', border: '1px solid rgba(150,190,240,.2)', borderRadius: v.sheetRadius, boxShadow: '0 24px 70px rgba(0,0,0,.6)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box' }, { role: 'dialog', 'aria-label': v.sheetTitle },
          el('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px', null,
            el('h2', 'margin:0;font-size:19px;font-weight:800', null, v.sheetTitle),
            el('button', 'flex:none;width:40px;height:40px;border-radius:10px;border:none;background:rgba(150,190,240,.08);color:#8b9dbd;font-size:16px;cursor:pointer', { onClick: v.closeSheet, 'aria-label': 'סגירה' }, '✕')),
          v.shCeleb ? h(React.Fragment, null,
            el('span', 'font-size:14px;color:#8b9dbd;text-wrap:pretty', null, 'המודעה האישית עולה על כל המסך לדקה, ואז הצג חוזר לתצוגה הרגילה.'),
            el('div', 'display:flex;flex-direction:column;gap:8px', null, v.celebs.map((c) =>
              el('button', 'display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;border:1px solid rgba(150,190,240,.14);background:rgba(4,9,20,.5);color:#e6f1ff;cursor:pointer;text-align:right', { key: c.key, onClick: c.showClose },
                avatarDiv(46, 16, c.av),
                el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px', null, el('span', 'font-size:16px;font-weight:600', null, c.name), el('span', `font-size:13px;color:${c.color}`, null, c.type)),
                el('span', 'flex:none;font-size:14px;font-weight:700;color:#d4f25c', null, 'הצגה')))),
            v.noCelebs ? el('span', 'font-size:14px;color:#8b9dbd', null, 'אין מודעות אישיות היום.') : null,
            el('button', 'min-height:44px;border-radius:12px;border:1px dashed rgba(159,220,255,.35);background:transparent;color:#9fdcff;font-size:15px;cursor:pointer', { onClick: v.openLifeNew }, '+ הוספה לאנשי המנהלת')) : null,
          v.shEvShow ? h(React.Fragment, null,
            el('span', 'font-size:14px;color:#8b9dbd;text-wrap:pretty', null, 'האירוע עולה על כל המסך ויורד לבד כשהוא מסתיים לפי היומן.'),
            el('div', 'display:flex;flex-direction:column;gap:8px', null, v.showEvents.map((e) =>
              el('div', 'display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;border:1px solid rgba(150,190,240,.14);background:rgba(4,9,20,.5)', { key: e.key },
                el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px', null, el('span', 'font-size:16px;font-weight:600;text-wrap:pretty', null, e.title), el('span', 'font-size:13px;color:#8b9dbd', null, e.when)),
                el('button', 'flex:none;min-height:40px;padding:0 14px;border-radius:10px;border:none;background:#9fdcff;color:#040914;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap', { onClick: e.show }, e.btn)))),
            v.noShowEvents ? el('span', 'font-size:14px;color:#8b9dbd', null, 'אין אירועים קרובים ביומן.') : null,
            el('button', 'min-height:44px;border-radius:12px;border:1px dashed rgba(159,220,255,.35);background:transparent;color:#9fdcff;font-size:15px;cursor:pointer', { onClick: v.openEventNew }, '+ אירוע חדש')) : null,
          v.shLife ? h(React.Fragment, null,
            el('div', 'display:flex;flex-direction:column;gap:6px', null,
              el('span', 'font-size:13px;color:#8b9dbd', null, 'מי?'),
              el('input', field, { value: v.lfNameVal, onChange: v.setLfName, placeholder: 'שם, למשל: דנה כהן', maxLength: 60, autoFocus: v.lfNameAuto, 'aria-label': 'שם' }),
              v.lfLinked ? el('div', 'display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;border:1px solid rgba(212,242,92,.4);background:rgba(212,242,92,.05)', null,
                avatarDiv(40, 14, v.lfPersonAv),
                el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px', null,
                  el('span', 'font-size:12px;color:#d4f25c;font-weight:600', null, 'מרשימת האנשים'),
                  el('span', 'font-size:15px;font-weight:600', null, v.lfLinkedName), el('span', 'font-size:12px;color:#8b9dbd', null, v.lfLinkedLine)),
                el('button', 'flex:none;min-height:34px;padding:0 10px;border-radius:10px;border:1px solid rgba(150,190,240,.22);background:transparent;color:#e6f1ff;font-size:12px;cursor:pointer', { onClick: v.lfUnlink }, 'בלי קישור')) : null,
              v.lfSuggest.length ? el('div', 'display:flex;flex-direction:column;gap:2px;padding:4px;border-radius:12px;background:rgba(4,9,20,.5);border:1px solid rgba(150,190,240,.12)', null,
                el('span', 'font-size:12px;color:#8b9dbd;padding:2px 6px', null, 'מרשימת האנשים:'),
                v.lfSuggest.map((m) =>
                  el('button', 'display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:10px;border:none;background:transparent;color:#e6f1ff;cursor:pointer;text-align:right', { key: m.key, onClick: m.pick, className: 'sw-hover' },
                    avatarDiv(32, 12, m.av),
                    el('div', 'display:flex;flex-direction:column;gap:0;min-width:0', null, el('span', 'font-size:15px;font-weight:600', null, m.name), el('span', 'font-size:12px;color:#8b9dbd', null, m.line))))) : null,
              v.lfFree ? el('span', 'font-size:12px;color:#8b9dbd;text-wrap:pretty', null, v.lfFreeHint, v.lfSuggest.length ? null : ' ', v.lfSuggest.length ? null : linkBtn(v.lfAddLabel, v.lfAddPerson)) : null),
            el('div', 'display:flex;flex-direction:column;gap:8px', null,
              el('span', 'font-size:13px;color:#8b9dbd', null, 'מה קרה?'),
              el('input', field, { value: v.lfType, onChange: v.setLfType, placeholder: 'כתבו בחופשיות, למשל: נולד בן', maxLength: 40 }),
              el('div', 'display:flex;flex-wrap:wrap;gap:6px', null, v.typeChips.map((t) =>
                el('button', `min-height:32px;padding:0 12px;border-radius:999px;border:1px solid ${t.border};background:transparent;color:#cfe0f7;font-size:13px;cursor:pointer`, { key: t.label, onClick: t.pick }, t.label)))),
            el('div', 'display:flex;gap:10px;flex-wrap:wrap', null,
              el('label', 'flex:1;min-width:140px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#8b9dbd', null, 'תאריך האירוע', el('input', dateField, { type: 'date', value: v.lfDate, onChange: v.setLfDate })),
              el('label', 'flex:1;min-width:140px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#8b9dbd', null, 'להתחיל להציג ב-', el('input', dateField, { type: 'date', value: v.lfShowFrom, onChange: v.setLfShowFrom }))),
            v.lfBdayHint ? el('span', 'font-size:12px;color:#e9b872;margin-top:-6px;text-wrap:pretty', null, v.lfBdayHint) : null,
            el('div', 'display:flex;flex-direction:column;gap:8px', null,
              el('span', 'font-size:13px;color:#8b9dbd', null, 'תמונה'),
              segWrap(3, v.lfPhotoOpts.map((o) => el('button', `min-height:40px;border-radius:9px;border:none;background:${o.bg};color:${o.fg};font-size:14px;font-weight:600;cursor:pointer`, { key: o.v, onClick: o.pick }, o.label))),
              v.lfIsUpload ? el('div', 'display:flex;align-items:center;gap:10px', null,
                v.lfHasSrc ? el('div', 'flex:none;width:56px;height:56px;border-radius:10px;overflow:hidden;position:relative;background:#000', null, v.lfThumbEl) : null,
                el('button', 'min-height:40px;padding:0 14px;border-radius:10px;border:1px dashed rgba(159,220,255,.4);background:transparent;color:#9fdcff;font-size:14px;cursor:pointer', { onClick: v.pickPhoto }, v.lfPhotoBtn)) : null,
              v.lfIsCrm ? el('span', 'font-size:12px;color:#8b9dbd', null, v.lfCrmHint) : null),
            el('input', field, { value: v.lfNote, onChange: v.setLfNote, placeholder: 'נוסח אישי (לא חובה)', maxLength: 120 }),
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
              el('div', 'display:flex;flex-direction:column;gap:2px', null, el('span', 'font-size:15px;font-weight:600', null, 'מודעה מנהלת'), el('span', 'font-size:13px;color:#8b9dbd;text-wrap:pretty', null, 'האירוע עולה לבד על כל המסך כשהוא מתחיל, ויורד כשהוא נגמר')),
              toggleBtn(true, v.evBigJ, v.evBigBg, v.toggleEvBig, 'מודעה מנהלת')),
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
          v.shWelcome ? h(React.Fragment, null,
            el('span', 'font-size:14px;color:#8b9dbd;line-height:1.5', null, 'הצג יציג בגדול "WELCOME TO THE SPACE PROGRAM OFFICE" עם אנימציות, עד שלוחצים כאן בשלט "כניסה לצג הבית". אז הלוגו נכנס והצג הרגיל עולה באנימציה.'),
            el('div', 'display:flex;flex-direction:column;gap:6px', null,
              el('span', 'font-size:13px;color:#8b9dbd', null, 'שורה מתחת לכותרת (לא חובה)'),
              el('input', 'min-height:48px;box-sizing:border-box;width:100%;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px', { value: v.wlInput, onChange: v.setWlInput, maxLength: 80, placeholder: 'לדוגמה: Delegation of Japan', dir: 'auto' })),
            el('button', 'min-height:48px;border-radius:12px;border:none;background:#d4f25c;color:#0b1400;font-size:16px;font-weight:700;cursor:pointer', { onClick: v.sendWl }, 'הצגה על כל המסך')) : null,
          v.shUrgent ? h(React.Fragment, null,
            el('span', 'font-size:14px;color:#8b9dbd', null, 'פס אדום בראש הצג, עד שמסירים אותו.'),
            el('textarea', 'resize:vertical;box-sizing:border-box;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px;line-height:1.5', { value: v.urInput, onChange: v.setUrInput, rows: 3, maxLength: 200, placeholder: 'לדוגמה: תרגיל פינוי ב-11:00, נא להתכנס ברחבה' }),
            el('div', 'display:flex;gap:8px;flex-wrap:wrap', null,
              el('button', 'flex:1;min-width:140px;min-height:48px;border-radius:12px;border:none;background:#ff7a6b;color:#1a0406;font-size:16px;font-weight:700;cursor:pointer', { onClick: v.sendUr }, 'שידור לצג'),
              v.urgentOn ? el('button', 'min-height:48px;padding:0 18px;border-radius:12px;border:1px solid rgba(150,190,240,.25);background:transparent;color:#e6f1ff;font-size:15px;cursor:pointer', { onClick: v.clearUrClose }, 'הסרת ההודעה הנוכחית') : null)) : null,
          v.shPerson ? h(React.Fragment, null,
            el('div', 'display:flex;align-items:center;gap:14px', null,
              avatarDiv(72, 24, v.psAv),
              el('div', 'display:flex;flex-direction:column;gap:6px;align-items:flex-start', null,
                el('button', 'min-height:38px;padding:0 14px;border-radius:10px;border:1px dashed rgba(159,220,255,.4);background:transparent;color:#9fdcff;font-size:14px;cursor:pointer', { onClick: v.pickPsPhoto }, v.psPhotoBtn),
                v.psHasPhoto ? linkBtn('הסרת התמונה', v.clearPsPhoto) : el('span', 'font-size:12px;color:#8b9dbd', null, 'בלי תמונה יוצגו ראשי תיבות'))),
            row2(lbl('שם פרטי', textIn(v.psFirst, v.setPsFirst, { maxLength: 40, autoFocus: !v.psEdit })), lbl('שם משפחה', textIn(v.psLast, v.setPsLast, { maxLength: 40 }))),
            row2(lbl('דרגה', textIn(v.psRank, v.setPsRank, { maxLength: 30, placeholder: 'למשל: סרן, רס״ן' })), lbl('תפקיד', textIn(v.psRole, v.setPsRole, { maxLength: 80 }))),
            lbl('אגף / ענף / צוות', textIn(v.psUnit, v.setPsUnit, { maxLength: 80 })),
            el('div', 'display:flex;flex-direction:column;gap:6px', null, el('span', 'font-size:13px;color:#8b9dbd', null, 'מעמד'),
              segWrap(v.psKinds.length === 4 && s.vw < 520 ? 2 : 4, v.psKinds.map((o) => el('button', `min-height:40px;border-radius:9px;border:none;background:${o.bg};color:${o.fg};font-size:14px;font-weight:600;cursor:pointer`, { key: o.v, onClick: o.pick }, o.label)))),
            row2(lbl('תאריך לידה', dateIn(v.psBirthday, v.setPsBirthday)), el('div', 'flex:1;min-width:140px')),
            toggleRow('מופיע/ה בצג', 'בלי הסכמה הפרטים נשמרים ברשימה בלבד: בלי יום הולדת, שמחות או תמונה בצג', v.psOnWall, v.togglePsOnWall),
            toggleRow('לחגוג יום הולדת בצג', v.psBdayOff ? 'כבוי, כי האדם לא מופיע בצג' : 'מודעה אישית על כל המסך ביום ההולדת (השנה לא מוצגת)', v.psShowBday, v.togglePsShowBday),
            row2(lbl('תאריך הצטרפות', dateIn(v.psJoined, v.setPsJoined)), lbl('תאריך שחרור / סיום', dateIn(v.psLeaves, v.setPsLeaves))),
            row2(lbl('מייל', textIn(v.psEmail, v.setPsEmail, { type: 'email', dir: 'ltr', maxLength: 120 })), lbl('טלפון', textIn(v.psPhone, v.setPsPhone, { type: 'tel', dir: 'ltr', maxLength: 40 }))),
            lbl('הערות ללשכה', el('textarea', 'resize:vertical;box-sizing:border-box;width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:15px;line-height:1.5', { value: v.psNotes, onChange: v.setPsNotes, rows: 2, maxLength: 500 })),
            el('span', 'font-size:12px;color:#8b9dbd;margin-top:-6px', null, 'פרטי הקשר וההערות נשמרים ללשכה בלבד ולא מוצגים בצג.'),
            v.psProfile.length ? el('div', 'display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:14px;background:rgba(4,9,20,.5);border:1px solid rgba(150,190,240,.12)', null,
              el('span', 'font-size:12px;color:#9fdcff;font-weight:600', null, 'מטופס ההיכרות'),
              v.psProfile.map((pf) => el('div', 'display:flex;gap:8px;font-size:13px;line-height:1.45', { key: pf.key },
                el('span', 'flex:none;color:#8b9dbd;min-width:96px', null, pf.label),
                pf.link ? el('a', null, { href: pf.text, target: '_blank', rel: 'noopener' }, 'פתיחה ↗') : el('span', 'color:#e6f1ff;text-wrap:pretty;white-space:pre-wrap', null, pf.text)))) : null,
            v.psAddMoment ? dashedBtn('+ אירוע אישי לאדם הזה', v.psAddMoment) : null,
            v.psEdit ? toggleRow('עדיין במנהלת', 'מי שעזב/ה: כבו כאן. נשמר ברשימה ולא מוצג יותר בצג', v.psActive, v.togglePsActive) : null,
            el('div', 'display:flex;gap:8px;flex-wrap:wrap', null,
              saveBtn(v.psSaveLabel, v.savePerson, s.busyAct || s.photoBusy),
              v.psEdit ? delBtn('מחיקה', v.deletePerson) : null)) : null,
          v.shImport ? h(React.Fragment, null,
            el('div', 'display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:14px;background:rgba(4,9,20,.5);border:1px solid rgba(150,190,240,.12)', null,
              el('span', 'font-size:15px;font-weight:700;overflow-wrap:anywhere', null, v.impFile),
              el('span', 'font-size:14px;color:#cfe0f7;text-wrap:pretty', null, v.impSummary),
              el('span', 'font-size:12px;color:#8b9dbd;text-wrap:pretty', null, 'עמודות שזוהו: ' + v.impUsed),
              v.impUnused ? el('span', 'font-size:12px;color:#8b9dbd;text-wrap:pretty', null, 'לא בשימוש: ' + v.impUnused) : null),
            el('div', 'display:flex;flex-direction:column;max-height:44vh;overflow-y:auto', null, v.impRows.map((r) =>
              el('div', 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(150,190,240,.08)', { key: r.key },
                el('span', "flex:none;width:28px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:#5d6f8f", null, r.n),
                el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px', null,
                  el('span', 'font-size:14px;font-weight:600', null, r.name),
                  el('span', 'font-size:12px;color:#8b9dbd', null, r.line + (r.off ? ' · לא מופיע/ה בצג' : '')),
                  r.warn ? el('span', 'font-size:12px;color:#ffb4a8', null, r.warn) : null),
                el('span', `flex:none;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid ${r.tag.c};color:${r.tag.c}`, null, r.tag.t)))),
            v.impMore ? el('span', 'font-size:12px;color:#8b9dbd', null, 'ועוד ' + v.impMore + ' שורות') : null,
            el('span', 'font-size:12px;color:#8b9dbd;text-wrap:pretty', null, 'מי שכבר ברשימה (לפי שם מלא) מתעדכן רק בפרטים שיש בקובץ, ושום פרט קיים לא נמחק. אחרי הייבוא אפשר לבטל הכל בלחיצה אחת.'),
            el('div', 'display:flex;gap:8px;flex-wrap:wrap', null,
              saveBtn(v.impGo || v.impLabel, v.doImport, !v.impCan || s.impBusy),
              el('button', 'min-height:48px;padding:0 18px;border-radius:12px;border:1px solid rgba(150,190,240,.25);background:transparent;color:#e6f1ff;font-size:15px;cursor:pointer', { onClick: v.pickImport }, 'קובץ אחר'))) : null,
          v.shTicker ? h(React.Fragment, null,
            el('input', 'min-height:48px;box-sizing:border-box;width:100%;padding:0 12px;border-radius:10px;border:1px solid rgba(150,190,240,.2);background:rgba(4,9,20,.6);color:#e6f1ff;font-size:16px', { value: v.tiName, onChange: v.setTiName, placeholder: 'שם, למשל: כנס החלל הבינלאומי', maxLength: 120, autoFocus: !v.tiEdit }),
            segWrap(2, v.tiKinds.map((o) => el('button', `min-height:40px;border-radius:9px;border:none;background:${o.bg};color:${o.fg};font-size:14px;font-weight:600;cursor:pointer`, { key: o.v, onClick: o.pick }, o.label))),
            row2(lbl('תאריך', dateIn(v.tiStart, v.setTiStart)), lbl('עד (לא חובה)', dateIn(v.tiEnd, v.setTiEnd))),
            textIn(v.tiPlace, v.setTiPlace, { placeholder: 'מקום, למשל: תל אביב (לא חובה)', maxLength: 80 }),
            textIn(v.tiUrl, v.setTiUrl, { placeholder: 'קישור, https://… (לא חובה)', dir: 'ltr', type: 'url' }),
            el('span', 'font-size:12px;color:#8b9dbd;text-wrap:pretty', null, 'מופיע ברצועת "אירועים והזדמנויות" בתחתית הצג, עד שהתאריך עובר.'),
            el('div', 'display:flex;gap:8px;flex-wrap:wrap', null,
              saveBtn(v.tiEdit ? 'שמירת שינויים' : 'שמירה', v.saveTicker, s.busyAct),
              v.tiEdit ? delBtn('מחיקה', v.deleteTicker) : null)) : null,
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
        el('input', 'display:none', { type: 'file', ref: this.personPhotoRef, accept: 'image/*', onChange: v.onPersonPhoto }),
        el('input', 'display:none', { type: 'file', ref: this.importRef, accept: '.xlsx,.xls,.csv,.txt', onChange: v.onImportFile }),
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
