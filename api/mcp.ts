// "צג חלל" — an MCP server for operating the lobby wall from the Claude app.
// Add it in Claude as a custom connector with the URL  https://<host>/mcp/<token>
// The token in the path is the only credential, so keep the URL private. It is MCP_TOKEN in the environment, else
// the mcp_token row of app_settings in Supabase (for when the Vercel environment can't be edited); change it to
// revoke the URL (an app_settings change reaches every instance within a minute).
//
// Stateless Streamable HTTP: every request gets a fresh server, which fits serverless functions.
// The tools can only do what lib/wall-ops.ts allows: no raw SQL, no schema changes, soft-delete for people.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as ops from '../lib/wall-ops.js';
import { ACTIONS, DesignPatch } from '../lib/remote-ops.js';
import { isoDateIL } from '../lib/dates.js';
import { setting } from '../lib/settings.js';

const INSTRUCTIONS = `אתה עוזר/ת התפעול של "צג חלל", המסך בלובי של מנהלת החלל. דרך הכלים האלה מעדכנים את מה שמוצג: אנשים, אירועים אישיים, אירועי מנהלת, ורצועת האירועים וההזדמנויות.
בצג ובשלט קוראים להם כך: "אירועים" (אירועי המנהלת), "אנשי המנהלת" (ימי הולדת ושמחות אישיות), ועל כל המסך: "סרטון תדמית", "מודעה אישית" ו"מודעה מנהלת" (אירוע שעולה לבד כשהוא מתחיל). בשמות האלה משתמשים בתשובות.

כללי עבודה:
- התחל/י כל שיחה ב-wall_overview כדי לדעת מה כבר קיים ומה התאריך היום.
- לפני כל אירוע אישי חפש/י את האדם עם find_people ושלח/י את ה-person_id שלו. מי שאינו ברשימה: אם הוא מאנשי המנהלת, הוסף/י אותו עם add_person; אחרת אפשר לשמור את האירוע עם name בלבד, והשם יוצג בצג כפי שנכתב.
- לפני כתיבה, סכם/י בשורה אחת מה עומד להישמר ובקש/י אישור. אחרי השמירה אשר/י מה נשמר, כולל תאריך בפורמט יום.חודש.
- שעות של אירועי מנהלת: לפי השדות date, time ו-end_time (שעון ישראל). starts_at ו-ends_at הם UTC, לא לצטט מהם שעה.
- תאריך בלי שנה פירושו המופע הבא שלו. אם אין שעה לאירוע מנהלת, שאל/י; אם אין תשובה, 09:00.
- יום הולדת: עדיף לשמור תאריך לידה באדם (birthday) ואז הוא יופיע אוטומטית כל שנה; אירוע birthday נפרד רק כשאין תאריך לידה.
- מחיקה בלתי הפיכה: delete_event דורש אישור מפורש. remove_person רק מסתיר את האדם.
- אם משהו לא ברור (איזה "דני"? איזה תאריך?), שאל/י שאלה אחת קצרה במקום לנחש.
- שליטה חיה (מסך מלא, הודעה דחופה, בהירות, עיצוב, דילוג על סרטון התדמית) עולה לצג תוך שניות ונרשמת בהיסטוריה של השלט, שם אפשר לבטל. אין צורך לבקש אישור לפני שינוי כזה, רק לפני מחיקה.
- הודעת אבל לא עולה על כל המסך.
- ענה/י בעברית, קצר.`;

const idOf = z.string().uuid();
const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: `שגיאה: ${(e as Error)?.message || String(e)}` }] });
const guard = <A>(fn: (a: A) => Promise<unknown>) => async (a: A) => { try { return ok(await fn(a)); } catch (e) { return fail(e); } };

function buildServer(): McpServer {
  const server = new McpServer({ name: 'space-wall', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  server.registerTool('wall_overview', {
    title: 'מה בצג',
    description: 'מה מוצג עכשיו בצג, ורשימת האירועים הקרובים (45 יום) עם מזהים לעריכה ומחיקה. התחל/י כאן.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, guard(async () => ops.overview()));

  server.registerTool('find_people', {
    title: 'חיפוש אנשים',
    description: 'חיפוש אנשי המנהלת לפי שם, אגף, תפקיד או דרגה. בלי query מחזיר את כולם. מחזיר מזהים (id) לשימוש בכלים אחרים.',
    inputSchema: { query: z.string().optional(), include_inactive: z.boolean().optional() },
    annotations: { readOnlyHint: true },
  }, guard(async (a: { query?: string; include_inactive?: boolean }) => ops.findPeople(a.query, a.include_inactive)));

  server.registerTool('add_person', {
    title: 'הוספת אדם',
    description: 'הוספת איש/אשת מנהלת חדש/ה (קליטה). תאריך לידה מאפשר ימי הולדת אוטומטיים.',
    inputSchema: ops.PersonFields.shape,
  }, guard(async (a: any) => ops.addPerson(a)));

  server.registerTool('update_person', {
    title: 'עדכון פרטי אדם',
    description: 'עדכון פרטים (דרגה, אגף, תפקיד, תאריכים, תמונה, הסכמה להופיע בצג). רק השדות שנשלחים משתנים; null מוחק שדה (למשל birthday: null). active: true מחזיר אדם שהוסר.',
    inputSchema: { id: idOf, ...ops.PersonPatch.shape },
  }, guard(async ({ id, ...patch }: any) => ops.updatePerson(id, patch)));

  server.registerTool('remove_person', {
    title: 'הסרת אדם',
    description: 'מסתיר אדם שעזב מהצג ומחישוב ימי ההולדת. ההיסטוריה נשמרת וניתן להחזיר עם update_person ו-active: true.',
    inputSchema: { id: idOf },
    annotations: { destructiveHint: true },
  }, guard(async (a: { id: string }) => ops.removePerson(a.id)));

  server.registerTool('add_life_event', {
    title: 'אירוע אישי',
    description: 'אירוע אישי לאדם מרשימת האנשים (person_id) או לכל שם (name): birthday (יום הולדת), wedding (חתונה), birth (לידה), promotion (עלייה בדרגה), discharge (שחרור), joined (קליטה), bereavement (אבל), other. מופיע בבלוק "אנשים במנהלת" ובחגיגה במסך מלא (למעט אבל).',
    inputSchema: {
      person_id: idOf.optional().describe('מ-find_people'),
      name: z.string().min(2).max(60).optional().describe('בלי person_id: השם כפי שיוצג בצג. שם מלא של אדם אחד ברשימה מקושר אליו'),
      type: z.enum(ops.LIFE_TYPES),
      event_date: ops.DATE,
      text_he: z.string().max(80).optional().describe('שורת תצוגה מותאמת, למשל "להולדת הבת · אגף הנדסה". ריק = אוטומטי'),
      show_from: ops.DATE.optional(), show_until: ops.DATE.optional(),
      rank: z.string().min(1).max(30).optional().describe('רק ב-promotion: הדרגה החדשה. מתעדכנת גם בפרטי האדם, וממנה השורה בצג'),
    },
  }, guard(async (a: any) => ops.addLifeEvent(a)));

  server.registerTool('add_directorate_event', {
    title: 'אירוע בלוח האירועים',
    description: 'אירוע פנימי: toast (הרמת כוסית), ceremony (טקס), conference (כנס), exhibition (תערוכה), fun_day (יום כיף), visit (ביקור משלחת), meeting (מפגש), other. מופיע בבלוק "אירועים" בשבוע שלפניו.',
    inputSchema: {
      title: z.string().min(2).max(80), type: z.enum(ops.DIR_TYPES).optional(),
      date: ops.DATE, time: ops.TIME.optional(), end_time: ops.TIME.optional(),
      place: z.string().max(60).optional(), audience: z.string().max(60).optional(),
    },
  }, guard(async (a: any) => ops.addDirectorateEvent(a)));

  server.registerTool('add_ticker_item', {
    title: 'פריט לרצועה',
    description: 'פריט לרצועת "אירועים והזדמנויות" בתחתית הצג. kind: "אירוע" לכנס או תערוכה בתעשייה, "הזדמנות" לקול קורא, מענק או מועד הגשה (starts_on = תאריך היעד).',
    inputSchema: {
      name: z.string().min(2).max(90), kind: z.enum(['אירוע', 'הזדמנות']),
      starts_on: ops.DATE, ends_on: ops.DATE.optional(), place: z.string().max(40).optional(), url: z.string().url().optional(),
    },
  }, guard(async (a: any) => ops.addTickerItem(a)));

  server.registerTool('update_event', {
    title: 'עריכת אירוע',
    description: 'עריכת אירוע קיים לפי kind ו-id (מתוך wall_overview). directorate: title,type,date,time,end_time,place,audience; שינוי date או time מזיז גם את שעת הסיום (אותו משך), end_time קובע אותה, ו-end_time: null מבטל אותה. life: type,event_date,text_he,show_from,show_until. ticker: name,kind,starts_on,ends_on,place,url.',
    inputSchema: { kind: z.enum(['directorate', 'life', 'ticker']), id: idOf, fields: z.record(z.string(), z.any()) },
  }, guard(async (a: { kind: ops.EventKind; id: string; fields: Record<string, unknown> }) => ops.updateEvent(a.kind, a.id, a.fields)));

  server.registerTool('delete_event', {
    title: 'מחיקת אירוע',
    description: 'מחיקה סופית של אירוע לפי kind ו-id. לבקש אישור מפורש לפני הקריאה.',
    inputSchema: { kind: z.enum(['directorate', 'life', 'ticker']), id: idOf },
    annotations: { destructiveHint: true },
  }, guard(async (a: { kind: ops.EventKind; id: string }) => ops.deleteEvent(a.kind, a.id)));

  server.registerTool('import_newsletter_issue', {
    title: 'ייבוא גיליון ניוזלטר',
    description: `טעינת גיליון שבועי של ניוזלטר רקיע לעמודת הניוזלטר בצג. קרא/י את הגיליון (מקישור או מטקסט שהודבק), וכתוב/י לכל ידיעה: cat (ביטחון | שיגורים | חקר החלל | כלכלה ותעשייה | תקשורת לוויינית | חישה מרחוק | מדיניות), il (האם קשור לישראל), date (למשל 14–15.09), src (שם המקור), title (כותרת עברית עד 90 תווים), dek (משפט הסבר אחד), url (קישור לכתבה, לקוד QR). featured: אינדקסים של 4–6 הידיעות החשובות. summary: 3–5 שורות תמצית. ticker: אירועים והזדמנויות מהגיליון, לכל אחד end (היום האחרון שלו, YYYY-MM-DD) כדי שירד מהרצועה כשעבר. היום ${isoDateIL()}.`,
    inputSchema: { issue_date: ops.DATE, source_url: z.string().url(), content: ops.NewsletterContent },
  }, guard(async (a: any) => ops.importNewsletter(a.issue_date, a.source_url, a.content)));

  // ---- live controls (shared with the remote, app/remote; recorded in its history with undo) ----
  const WHO = 'Claude';
  const live = (action: string) => guard(async (a: any) => (await ACTIONS[action](a, WHO)) ?? 'בוצע');

  server.registerTool('show_fullscreen', {
    title: 'הצגה על כל המסך',
    description: 'מציג עכשיו על כל המסך: welcome (מסך WELCOME TO THE SPACE PROGRAM OFFICE לביקור משלחת, עד ש-end מכניס לצג הבית באנימציה; guest: שורה אופציונלית מתחת לכותרת), noon (סרטון התדמית), celebration (מודעה אישית: life_event_id של אירוע אישי, גם של מי שלא ברשימה; או person_id לבד, וזו מודעת יום הולדת), event (מודעה מנהלת: event_id של אירוע; יורד לבד בסוף האירוע), news (חדשות החלל: הידיעה המרכזית הבאה), או end (חזרה לתצוגה רגילה).',
    inputSchema: { what: z.enum(['welcome', 'noon', 'celebration', 'event', 'news', 'end']), guest: z.string().max(80).optional(), person_id: idOf.optional(), life_event_id: idOf.optional(), event_id: idOf.optional() },
  }, guard(async (a: { what: string; guest?: string; person_id?: string; life_event_id?: string; event_id?: string }) => {
    if (a.what === 'welcome') return ACTIONS.welcome({ guest: a.guest }, WHO).then(() => 'בוצע');
    if (a.what === 'noon') return ACTIONS.noon({}, WHO).then(() => 'בוצע');
    if (a.what === 'end') return ACTIONS.endTakeover({}, WHO).then(() => 'בוצע');
    if (a.what === 'event') return ACTIONS.showEvent({ eventId: a.event_id }, WHO).then(() => 'בוצע');
    if (a.what === 'news') return ACTIONS.showNews({}, WHO).then(() => 'בוצע');
    return ACTIONS.celebrate({ personId: a.person_id, lifeId: a.life_event_id }, WHO).then(() => 'בוצע');
  }));

  server.registerTool('set_noon_show_today', {
    title: 'סרטון התדמית היום',
    description: 'on=false מדלג על סרטון התדמית האוטומטי של היום (12:00); on=true מחזיר אותו.',
    inputSchema: { on: z.boolean() },
  }, live('noonToday'));

  server.registerTool('set_wall_design', {
    title: 'עיצוב הצג',
    description: 'שינוי עיצוב הצג. noon (סרטון תדמית אוטומטי), qr (קודי QR), fx (אפקטי רקע), sway (תנועת מצלמה): true/false. feature: שניות לכתבה מרכזית (6–30). list: שניות לכל ידיעה (2–10). globe: שניות לסיבוב הגלובוס (20–240). globeStyle: "holo" (הולוגרפי) או "real" (ריאליסטי).',
    inputSchema: { changes: DesignPatch, label: z.string().max(80).describe('תיאור קצר בעברית להיסטוריה, למשל "סגנון הגלובוס: ריאליסטי"') },
  }, guard(async (a: { changes: unknown; label: string }) => (await ACTIONS.design({ patch: a.changes, label: a.label }, WHO), 'בוצע')));

  server.registerTool('set_brightness', {
    title: 'בהירות',
    description: 'בהירות הצג באחוזים, 10–100.',
    inputSchema: { value: z.number().int().min(10).max(100) },
  }, live('brightness'));

  server.registerTool('set_urgent_message', {
    title: 'הודעה דחופה',
    description: 'פס אדום בראש הצג עד שמסירים אותו. טקסט ריק מסיר את ההודעה.',
    inputSchema: { text: z.string().max(200) },
  }, live('urgent'));

  server.registerTool('set_event_important', {
    title: 'מודעה מנהלת',
    description: 'מודעה מנהלת (important=true): האירוע עולה לבד על כל המסך כשהוא מתחיל, ויורד כשהוא נגמר.',
    inputSchema: { id: idOf, important: z.boolean() },
  }, live('eventImportant'));

  return server;
}

async function tokenOk(given: string | undefined): Promise<boolean> {
  const want = await setting('MCP_TOKEN', 'mcp_token');
  if (want.length < 24 || !given) return false;            // no token configured = closed, never open
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await tokenOk(req.query.token as string | undefined).catch(() => false))) return res.status(404).json({ error: 'not found' });
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', 'POST').json({ error: 'method not allowed' });
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('mcp request failed', e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'internal error' }, id: null });
  }
}
