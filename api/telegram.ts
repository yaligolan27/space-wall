// Telegram webhook: free-text updates about people and directorate events → Claude → confirm → DB.
// Set the webhook once:  https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<host>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, must } from '../lib/db';
import { buildFeed } from '../lib/feed';
import { applyActions, parseIntake, type IntakeAction } from '../lib/intake';
import { esc, sendMessage, tg } from '../lib/telegram';

const HELP = `<b>צג חלל · עדכון</b>
שלחו הודעה חופשית ואני אהפוך אותה לעדכון בצג, למשל:
• יום הולדת לדנה כהן מאגף תכנון ב-3.10
• יוסי לוי התחתן בשבת
• הרמת כוסית לחג ביום ג׳ 12:00 בלובי
• נקלט חייל חדש: עומר בר, יחידת בקרה, נולד 2004-05-12
• תערוכה ב-9900 ב-20.11
• בטל את המפגש עם מפא״ת
לפני כל שינוי תקבלו סיכום ותאשרו.
פקודות: /list אירועים קרובים בצג · /events רצועת אירועים · /people אנשים · /whoami · /help`;

async function authorized(chatId: number): Promise<{ ok: boolean; name?: string }> {
  const ids = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (ids.includes(String(chatId))) return { ok: true };
  const row = must(await db().from('telegram_users').select('name,active').eq('chat_id', chatId).maybeSingle(), 'telegram_users') as any;
  return row?.active ? { ok: true, name: row.name } : { ok: false };
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).end();
  const update = req.body || {};
  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message) await onMessage(update.message);
  } catch (e: any) {
    console.error('telegram handler failed', e);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) await sendMessage(chatId, `⚠️ שגיאה: ${esc(e?.message || String(e))}`).catch(() => {});
  }
  return res.status(200).json({ ok: true }); // always 200 so Telegram does not retry
}

async function onMessage(msg: any) {
  const chatId: number = msg.chat.id;
  const text: string = (msg.text || msg.caption || '').trim();
  const sender = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || String(chatId);
  if (text.startsWith('/whoami')) return sendMessage(chatId, `מזהה הצ׳אט: <code>${chatId}</code>`);
  const auth = await authorized(chatId);
  if (!auth.ok) return sendMessage(chatId, `הבוט סגור למורשים בלבד. מזהה הצ׳אט שלך: <code>${chatId}</code>. בקשו מהמנהל להוסיף אותו.`);
  if (!text) return sendMessage(chatId, 'שלחו טקסט (תמונות עדיין לא נתמכות).');

  if (text.startsWith('/start') || text.startsWith('/help')) return sendMessage(chatId, HELP);
  if (text.startsWith('/list') || text.startsWith('/events')) {
    const feed = await buildFeed();
    const lines = text.startsWith('/list')
      ? feed.directorate.map(d => `• <b>${esc(d.date)}</b> ${esc(d.name)}`)
      : feed.events.map(e => `• <b>${esc(e.date)}</b> ${esc(e.name)}${e.place ? ' · ' + esc(e.place) : ''}`);
    return sendMessage(chatId, lines.length ? lines.join('\n') : 'אין פריטים כרגע.');
  }
  if (text.startsWith('/people')) {
    const rows = must(await db().from('people').select('display_name,unit,rank').eq('active', true).order('created_at', { ascending: false }).limit(40), 'people') as any[];
    return sendMessage(chatId, rows.length ? `${rows.length} אנשים (40 אחרונים):\n` + rows.map(p => `• ${esc([p.display_name, p.rank, p.unit].filter(Boolean).join(' · '))}`).join('\n') : 'אין אנשים במערכת עדיין.');
  }
  if (text.startsWith('/cancel')) {
    must(await db().from('intake_messages').update({ status: 'rejected' }).eq('channel', 'telegram').eq('sender', String(chatId)).eq('status', 'pending'), 'cancel');
    return sendMessage(chatId, 'בוטל.');
  }

  const intake = must(await db().from('intake_messages').insert({ channel: 'telegram', external_id: String(msg.message_id), sender: String(chatId), raw_text: text }).select('id').single(), 'intake') as any;
  const { result } = await parseIntake(text, auth.name || sender);
  must(await db().from('intake_messages').update({ parsed: result }).eq('id', intake.id), 'intake-parsed');

  if (result.needs_clarification) {
    must(await db().from('intake_messages').update({ status: 'rejected', error: 'clarification' }).eq('id', intake.id), 'intake');
    return sendMessage(chatId, `❓ ${esc(result.clarification_he || 'חסר פרט. אפשר לנסח שוב?')}`);
  }
  const real = result.actions.filter(a => a.type !== 'none');
  if (!real.length) {
    must(await db().from('intake_messages').update({ status: 'rejected', error: 'no-actions' }).eq('id', intake.id), 'intake');
    return sendMessage(chatId, esc(result.summary_he || 'לא זיהיתי עדכון בהודעה.'));
  }
  const summary = real.map(describe).filter(Boolean).map(esc).join('\n');
  return sendMessage(chatId, `<b>לאשר?</b>\n${summary}`, {
    reply_markup: { inline_keyboard: [[{ text: '✅ אשר', callback_data: `ok:${intake.id}` }, { text: '❌ בטל', callback_data: `no:${intake.id}` }]] },
  });
}

async function onCallback(cb: any) {
  const chatId: number = cb.message.chat.id;
  const [verb, id] = String(cb.data || '').split(':');
  await tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
  const row = must(await db().from('intake_messages').select('*').eq('id', id).maybeSingle(), 'intake') as any;
  if (!row || row.status !== 'pending') return tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: 'הבקשה כבר טופלה.' });
  if (verb !== 'ok') {
    must(await db().from('intake_messages').update({ status: 'rejected' }).eq('id', id), 'intake');
    return tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: '❌ בוטל.' });
  }
  const auth = await authorized(chatId);
  if (!auth.ok) return;
  try {
    const done = await applyActions(row.parsed.actions, `telegram:${chatId}`);
    must(await db().from('intake_messages').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', id), 'intake');
    await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, parse_mode: 'HTML', text: `✅ בוצע:\n${done.map(esc).join('\n')}\nהצג יתעדכן תוך דקה.` });
  } catch (e: any) {
    must(await db().from('intake_messages').update({ status: 'failed', error: e?.message }).eq('id', id), 'intake');
    await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `⚠️ נכשל: ${e?.message}` });
  }
}
