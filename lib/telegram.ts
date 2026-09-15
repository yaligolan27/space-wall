import { env } from './env';

export async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(`telegram ${method}: ${json.description || res.status}`);
  return json.result;
}
export async function sendMessage(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}
/** Best-effort alert to the ops chat; never throws. */
export async function alert(text: string) {
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!chat || !process.env.TELEGRAM_BOT_TOKEN) return;
  try { await sendMessage(chat, text); } catch (e) { console.warn('alert failed', e); }
}
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
