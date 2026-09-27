// "צג חלל" — an MCP server for operating the lobby wall from the Claude app.
// Add it in Claude as a custom connector with the URL  https://<host>/mcp/<MCP_TOKEN>
// The token in the path is the only credential, so keep the URL private; rotate MCP_TOKEN to revoke it.
//
// Stateless Streamable HTTP: every request gets a fresh server, which fits serverless functions.
// The tools can only do what lib/wall-ops.ts allows: no raw SQL, no schema changes, soft-delete for people.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as ops from '../lib/wall-ops';
import { isoDateIL } from '../lib/dates';

const INSTRUCTIONS = `אתה עוזר/ת התפעול של "צג חלל", המסך בלובי של מנהלת החלל. דרך הכלים האלה מעדכנים את מה שמוצג: אנשים, אירועים אישיים, אירועי מנהלת, ורצועת האירועים וההזדמנויות.

כללי עבודה:
- התחל/י כל שיחה ב-wall_overview כדי לדעת מה כבר קיים ומה התאריך היום.
- לפני כל אירוע אישי חפש/י את האדם עם find_people. אם אינו קיים, הוסף/י אותו עם add_person ורק אז את האירוע.
- לפני כתיבה, סכם/י בשורה אחת מה עומד להישמר ובקש/י אישור. אחרי השמירה אשר/י מה נשמר, כולל תאריך בפורמט יום.חודש.
- תאריך בלי שנה פירושו המופע הבא שלו. אם אין שעה לאירוע מנהלת, שאל/י; אם אין תשובה, 09:00.
- יום הולדת: עדיף לשמור תאריך לידה באדם (birthday) ואז הוא יופיע אוטומטית כל שנה; אירוע birthday נפרד רק כשאין תאריך לידה.
- מחיקה בלתי הפיכה: delete_event דורש אישור מפורש. remove_person רק מסתיר את האדם.
- אם משהו לא ברור (איזה "דני"? איזה תאריך?), שאל/י שאלה אחת קצרה במקום לנחש.
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
    description: 'עדכון פרטים (דרגה, אגף, תפקיד, תאריכים, תמונה). רק השדות שנשלחים משתנים.',
    inputSchema: { id: idOf, ...ops.PersonFields.partial().shape },
  }, guard(async ({ id, ...patch }: any) => ops.updatePerson(id, patch)));

  server.registerTool('remove_person', {
    title: 'הסרת אדם',
    description: 'מסתיר אדם שעזב מהצג ומחישוב ימי ההולדת. ההיסטוריה נשמרת וניתן להחזיר עם update_person.',
    inputSchema: { id: idOf },
    annotations: { destructiveHint: true },
  }, guard(async (a: { id: string }) => ops.removePerson(a.id)));

  server.registerTool('add_life_event', {
    title: 'אירוע אישי',
    description: 'אירוע אישי לאדם קיים: birthday (יום הולדת), wedding (חתונה), birth (לידה), promotion (עלייה בדרגה), discharge (שחרור), joined (קליטה), bereavement (אבל), other. מופיע בבלוק "אנשים במנהלת" ובחגיגה במסך מלא (למעט אבל).',
    inputSchema: {
      person_id: idOf,
      type: z.enum(ops.LIFE_TYPES),
      event_date: ops.DATE,
      text_he: z.string().max(80).optional().describe('שורת תצוגה מותאמת, למשל "להולדת הבת · אגף הנדסה". ריק = אוטומטי'),
      show_from: ops.DATE.optional(), show_until: ops.DATE.optional(),
    },
  }, guard(async (a: any) => ops.addLifeEvent(a)));

  server.registerTool('add_directorate_event', {
    title: 'אירוע מנהלת',
    description: 'אירוע פנימי: toast (הרמת כוסית), ceremony (טקס), conference (כנס), exhibition (תערוכה), fun_day (יום כיף), visit (ביקור משלחת), meeting (מפגש), other. מופיע בבלוק "אירועים במנהלת" בשבוע שלפניו.',
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
    description: 'עריכת אירוע קיים לפי kind ו-id (מתוך wall_overview). directorate: title,type,date,time,place,audience. life: type,event_date,text_he,show_from,show_until. ticker: name,kind,starts_on,ends_on,place,url.',
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
    description: `טעינת גיליון שבועי של ניוזלטר רקיע לעמודת הניוזלטר בצג. קרא/י את הגיליון (מקישור או מטקסט שהודבק), וכתוב/י לכל ידיעה: cat (ביטחון | שיגורים | חקר החלל | כלכלה ותעשייה | תקשורת לוויינית | חישה מרחוק | מדיניות), il (האם קשור לישראל), date (למשל 14–15.09), src (שם המקור), title (כותרת עברית עד 90 תווים), dek (משפט הסבר אחד), url (קישור לכתבה, לקוד QR). featured: אינדקסים של 4–6 הידיעות החשובות. summary: 3–5 שורות תמצית. ticker: אירועים והזדמנויות מהגיליון. היום ${isoDateIL()}.`,
    inputSchema: { issue_date: ops.DATE, source_url: z.string().url(), content: ops.NewsletterContent },
  }, guard(async (a: any) => ops.importNewsletter(a.issue_date, a.source_url, a.content)));

  return server;
}

function tokenOk(given: string | undefined): boolean {
  const want = process.env.MCP_TOKEN || '';
  if (want.length < 24 || !given) return false;            // no token configured = closed, never open
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!tokenOk(req.query.token as string | undefined)) return res.status(404).json({ error: 'not found' });
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
