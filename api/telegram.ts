// Telegram webhook. Deliberately contains no model call: it queues the raw message and lets the
// local runner (on the Claude Code subscription) parse it, then applies the already-parsed actions
// when the user taps confirm. That is why this deployment needs no ANTHROPIC_API_KEY.
//
// Register the webhook once:
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<host>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, must } from '../lib/db';
import { buildFeed } from '../lib/feed';
import { applyActions } from '../lib/intake-apply';
import { esc, sendMessage, tg } from '../lib/telegram';

const HELP = `<b>צג חלל · עדכון</b>
שלחו הודעה חופשית ואני אהפוך אותה לעדכון בצג, למשל:
• יום הולדת לדנה כהן מאגף תכנון ב-3.10
• יוסי לוי התחתן בשבת
• הרמת כוסית לחג ביום ג׳ 12:00 בלובי
• נקלט חייל חדש: עומר בר, יחידת בקרה, נולד 2004-05-12
• תערוכה ב-9900 ב-20.11
• בטל את המפגש עם מפא״ת
ההודעה נקראת תוך פחות מדקה, ואז תקבלו סיכום לאישור.
פקודות: /list אירועים בבלוק המנהלת · /events רצועת אירועים · /people אנשים · /status מצב המערכת · /whoami · /help`;

async function authorized(chatId: number): Promise<{ ok: boolean; name?: string }> {
  const ids = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (ids.includes(String(chatId))) return { ok: true };
  const row = must(await db().from('telegram_users').select('name,active').eq('chat_id', chatId).maybeSingle(), 'telegram_users') as any;
  return row?.active ? { ok: true, name: row.name } : { ok: false };
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
  return res.status(200).json({ ok: true });   // always 200 so Telegram does not retry
}

async function onMessage(msg: any) {
  const chatId: number = msg.chat.id;
  const text: string = (msg.text || msg.caption || '').trim();
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
    const rows = must(await db().from('people').select('display_name,unit,rank').eq('active', true)
      .order('created_at', { ascending: false }).limit(40), 'people') as any[];
    return sendMessage(chatId, rows.length
      ? `${rows.length} אנשים (40 אחרונים):\n` + rows.map(p => `• ${esc([p.display_name, p.rank, p.unit].filter(Boolean).join(' · '))}`).join('\n')
      : 'אין אנשים במערכת עדיין.');
  }
  if (text.startsWith('/status')) return sendMessage(chatId, await statusText());
  if (text.startsWith('/cancel')) {
    must(await db().from('intake_messages').update({ status: 'rejected' })
      .eq('channel', 'telegram').eq('sender', String(chatId)).eq('status', 'pending'), 'cancel');
    return sendMessage(chatId, 'בוטל.');
  }

  // Queue it. The runner picks it up within its intake interval and replies with the confirm card.
  must(await db().from('intake_messages').insert({
    channel: 'telegram', external_id: String(msg.message_id), sender: String(chatId), raw_text: text,
  }), 'intake insert');
  const stale = await runnerStale();
  return sendMessage(chatId, stale
    ? '📥 קיבלתי, אבל המעבד המקומי לא מגיב כרגע. ההודעה שמורה בתור ותטופל כשהוא יחזור.'
    : '📥 קיבלתי, מעבד…');
}

async function onCallback(cb: any) {
  const chatId: number = cb.message.chat.id;
  const messageId: number = cb.message.message_id;
  const [verb, id] = String(cb.data || '').split(':');
  await tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});

  const auth = await authorized(chatId);
  if (!auth.ok) return;

  const row = must(await db().from('intake_messages').select('*').eq('id', id).maybeSingle(), 'intake') as any;
  if (!row || row.status !== 'pending' || !row.parsed) {
    return tg('editMessageText', { chat_id: chatId, message_id: messageId, text: 'הבקשה כבר טופלה.' });
  }
  if (verb !== 'ok') {
    must(await db().from('intake_messages').update({ status: 'rejected' }).eq('id', id), 'intake');
    return tg('editMessageText', { chat_id: chatId, message_id: messageId, text: '❌ בוטל.' });
  }
  try {
    const done = await applyActions(row.parsed.actions, `telegram:${chatId}`);
    must(await db().from('intake_messages').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', id), 'intake');
    await tg('editMessageText', {
      chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
      text: `✅ בוצע:\n${done.map(esc).join('\n')}\nהצג יתעדכן תוך דקה.`,
    });
  } catch (e: any) {
    must(await db().from('intake_messages').update({ status: 'failed', error: String(e?.message).slice(0, 500) }).eq('id', id), 'intake');
    await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: `⚠️ נכשל: ${e?.message}` });
  }
}

/** The runner writes a heartbeat every couple of minutes; more than 10 minutes old means it is down. */
async function runnerState(): Promise<any | null> {
  const row = must(await db().from('settings').select('value').eq('key', 'runner').maybeSingle(), 'runner') as any;
  return row?.value ?? null;
}
async function runnerStale(): Promise<boolean> {
  const v = await runnerState();
  return !v?.at || Date.now() - Date.parse(v.at) > 10 * 60_000;
}
async function statusText(): Promise<string> {
  const v = await runnerState();
  if (!v?.at) return '⚠️ המעבד המקומי מעולם לא דיווח. ודאו שהוא רץ על המחשב (npm run runner).';
  const ageMin = Math.round((Date.now() - Date.parse(v.at)) / 60_000);
  const lines = [
    ageMin <= 10 ? `✅ המעבד המקומי פעיל (דיווח לפני ${ageMin} דק׳)` : `⚠️ המעבד המקומי לא דיווח ${ageMin} דק׳`,
    `מחשב: ${esc(String(v.host || '?'))}`,
    `ידיעות ממתינות לעיבוד: ${v.pending_enrich ?? '?'}`,
    `הודעות בתור: ${v.queued_intake ?? '?'}`,
  ];
  if (v.model_paused_until && Date.parse(v.model_paused_until) > Date.now()) {
    lines.push(`⏸ עבודת המודל בהשהיה עד ${esc(String(v.model_paused_until).slice(11, 16))} (מגבלת שימוש)`);
  }
  const feed = await buildFeed();
  lines.push(`עודכן לאחרונה: ${esc(String(feed.generatedAt).slice(0, 16).replace('T', ' '))}`);
  return lines.join('\n');
}
