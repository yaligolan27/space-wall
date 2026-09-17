// Intake processing. The Vercel webhook only queues the raw Telegram message; this step (local,
// on the subscription) turns it into structured actions and sends the confirmation card.
// Applying the confirmed actions needs no model and happens back in the webhook.
import { db, must } from '../../lib/db';
import { DIRECTORATE_PROFILE } from '../../lib/profile';
import { IntakeResult, type IntakeAction } from '../../lib/schemas';
import { isoDateIL } from '../../lib/dates';
import { esc, sendMessage } from '../../lib/telegram';
import { runClaudeTask } from './cc';

function instructions(today: string, people: string, events: string): string {
  return `${DIRECTORATE_PROFILE}

תפקידך כאן: לקבל הודעה חופשית ממי שמעדכן את הצג (מזכירות, משאבי אנוש, קצין) ולהפוך אותה לפעולות מובנות על בסיס הנתונים.
ההודעה נמצאת ב-task.json בשדה "text", והשולח בשדה "sender".

היום: ${today} (שעון ישראל). השבוע בישראל מתחיל ביום ראשון.
אנשים קיימים במערכת (התאם שמות לקיימים כשברור שמדובר באותו אדם): ${people || 'אין'}.
אירועי מנהלת קרובים: ${events || 'אין'}.

סוגי פעולות (type): add_person, update_person, add_life_event, add_directorate_event, add_industry_event, remove_event, set_setting, none.

כללים:
- אירוע אישי (יום הולדת, חתונה, לידה, אבל, עלייה בדרגה, שחרור, קליטה) הוא add_life_event עם person_name ועם life_event_type ו-event_date בפורמט YYYY-MM-DD. אם האדם אינו קיים, הוסף add_person לפניו עם מה שידוע.
- "יום הולדת ל-X ב-3.4" ללא שנה: זה תאריך האירוע השנה (או בשנה הבאה אם התאריך עבר), ולא תאריך לידה. שנת לידה מפורשת נכנסת ל-birthday ב-add_person.
- אירוע של המנהלת (הרמת כוסית, טקס, כנס פנימי, תערוכה, יום כיף, ביקור משלחת, מפגש) הוא add_directorate_event עם starts_at מלא בפורמט ISO עם אזור זמן ישראל, למשל 2026-09-15T12:00:00+03:00. בלי שעה, השתמש ב-09:00.
- כנס או תערוכה חיצוניים בתעשייה הם add_industry_event עם starts_on ו-ends_on בפורמט YYYY-MM-DD.
- בקשה למחוק או לבטל היא remove_event עם match, ואם ידוע גם remove_kind.
- עדכון שורת הנתונים בצג (מספר עצמים במעקב, מזג אוויר חללי) הוא set_setting עם setting_key ו-line1 או line2.
- text_he הוא טקסט תצוגה קצר בסגנון "יום הולדת · שם · אגף". השאר null אם המשתמש לא ניסח משהו מיוחד; המערכת תרכיב אותו.
- אם חסר פרט מהותי (מי, מתי) ואי אפשר להסיק בסבירות גבוהה: needs_clarification=true, שאלה אחת קצרה ב-clarification_he, ו-actions מערך ריק.
- הודעה שאינה עדכון (שאלה, שיחה): פעולה אחת מסוג none ותשובה קצרה ב-summary_he.
- שדות שאינם רלוונטיים לפעולה: null.

מבנה result.json:
{"actions":[{"type":"add_life_event","person_name":"דנה כהן","unit":"אגף תכנון","life_event_type":"birthday","event_date":"2026-10-03","text_he":null}],"summary_he":"יום הולדת לדנה כהן ב-3.10","needs_clarification":false,"clarification_he":null}`;
}

function describe(a: IntakeAction): string {
  switch (a.type) {
    case 'add_person': return `👤 אדם חדש: ${a.person_name || [a.first_name, a.last_name].filter(Boolean).join(' ')}${a.unit ? ' · ' + a.unit : ''}${a.birthday ? ' · נולד/ה ' + a.birthday : ''}`;
    case 'update_person': return `✏️ עדכון פרטים: ${a.person_name || a.match}`;
    case 'add_life_event': return `🎉 ${a.life_event_type} · ${a.person_name} · ${a.event_date || 'היום'}`;
    case 'add_directorate_event': return `📅 ${a.title} · ${a.starts_at}${a.place ? ' · ' + a.place : ''}`;
    case 'add_industry_event': return `🏛 ${a.title} · ${a.starts_on}${a.place ? ' · ' + a.place : ''}`;
    case 'remove_event': return `🗑 הסרה: ${a.match || a.title || a.person_name}`;
    case 'set_setting': return `⚙️ ${a.setting_key}: ${[a.line1, a.line2].filter(Boolean).join(' / ')}`;
    default: return '';
  }
}

/** Parses every queued message. Returns how many it handled. */
export async function processIntake(): Promise<number> {
  const s = db();
  const queued = must(await s.from('intake_messages').select('*')
    .eq('status', 'pending').is('parsed', null)
    .order('received_at').limit(5), 'queued') as any[];
  if (!queued.length) return 0;

  const peopleRows = must(await s.from('people').select('display_name,unit,role,rank').eq('active', true).limit(300), 'people') as any[];
  const eventRows = must(await s.from('directorate_events').select('title,starts_at,place')
    .gte('starts_at', new Date().toISOString()).order('starts_at').limit(30), 'events') as any[];
  const people = peopleRows.map(p => [p.display_name, p.unit, p.role, p.rank].filter(Boolean).join(' / ')).join('; ');
  const events = eventRows.map(e => `${e.title} (${e.starts_at}${e.place ? ', ' + e.place : ''})`).join('; ');
  const today = isoDateIL();

  let handled = 0;
  for (const msg of queued) {
    const chatId = Number(msg.sender);
    try {
      const result = await runClaudeTask({
        name: 'intake',
        input: { text: msg.raw_text, sender: msg.sender },
        instructions: instructions(today, people, events),
        schema: IntakeResult,
        timeoutMs: 180_000,
      });

      if (result.needs_clarification) {
        must(await s.from('intake_messages').update({ parsed: result, status: 'rejected', error: 'clarification' }).eq('id', msg.id), 'intake');
        await sendMessage(chatId, `❓ ${esc(result.clarification_he || 'חסר פרט. אפשר לנסח שוב?')}`);
        handled++;
        continue;
      }
      const real = result.actions.filter(a => a.type !== 'none');
      if (!real.length) {
        must(await s.from('intake_messages').update({ parsed: result, status: 'rejected', error: 'no-actions' }).eq('id', msg.id), 'intake');
        await sendMessage(chatId, esc(result.summary_he || 'לא זיהיתי עדכון בהודעה.'));
        handled++;
        continue;
      }

      // parsed set, status still pending: the row is now awaiting the user's tap.
      must(await s.from('intake_messages').update({ parsed: result }).eq('id', msg.id), 'intake');
      const summary = real.map(describe).filter(Boolean).map(esc).join('\n');
      await sendMessage(chatId, `<b>לאשר?</b>\n${summary}`, {
        reply_markup: { inline_keyboard: [[{ text: '✅ אשר', callback_data: `ok:${msg.id}` }, { text: '❌ בטל', callback_data: `no:${msg.id}` }]] },
      });
      handled++;
    } catch (e: any) {
      if (e?.name === 'UsageLimitError') throw e;   // let the runner back off; the row stays queued
      console.error(`[intake] ${msg.id} failed:`, e?.message || e);
      must(await s.from('intake_messages').update({ status: 'failed', error: String(e?.message || e).slice(0, 500) }).eq('id', msg.id), 'intake');
      await sendMessage(chatId, `⚠️ לא הצלחתי לפרש את ההודעה. נסו לנסח אחרת.`).catch(() => {});
    }
  }
  return handled;
}

/** How many messages are waiting to be parsed. */
export async function queuedCount(): Promise<number> {
  const r = await db().from('intake_messages').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('parsed', null);
  if (r.error) throw new Error(`queuedCount: ${r.error.message}`);
  return r.count ?? 0;
}
