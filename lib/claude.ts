import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
  return client;
}
export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5';

export type Usage = { input: number; output: number };
export function addUsage(u: Usage, m: { usage?: { input_tokens?: number; output_tokens?: number } }) {
  u.input += m.usage?.input_tokens ?? 0;
  u.output += m.usage?.output_tokens ?? 0;
}

/** Directorate context shared by every prompt. Keep stable so it caches. */
export const DIRECTORATE_PROFILE = `אתה עורך התוכן של "צג חלל", מסך בלובי של מנהלת החלל במשרד הביטחון בישראל.
הקהל: אנשי המנהלת (מהנדסים, קציני פרויקטים, מנהלים) שעסוקים ואין להם זמן לעקוב אחרי חדשות החלל.
תחומי העניין, לפי סדר חשיבות:
1. חלל ביטחוני (לוויינים צבאיים, SSA/מודעות מצב במסלול, נשק נגד לוויינים, הגנה במסלול, תקשורת צבאית לוויינית)
2. גאופוליטיקה של החלל (ארה"ב, סין, רוסיה, איראן, אירופה, הודו, טורקיה, מפרץ)
3. ישראל (התעשייה האווירית, אלביט, רפאל, סוכנות החלל, סטארט-אפים, שיגורים ישראליים)
4. שיגורים ופלטפורמות שיגור, תעשייה ועסקאות (חוזים, רכישות, מימון), מדיניות ורגולציה, טכנולוגיה ומו"פ, מזג אוויר חללי
5. חקר החלל ומדע: רק אם משמעותי במיוחד.
סגנון: עברית עיתונאית תמציתית, בגובה העיניים, בלי סופרלטיבים. שמות מערכות וחברות נשארים באנגלית/כמקובל בעברית.`;
