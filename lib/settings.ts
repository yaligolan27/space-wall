// Runtime settings that may live in Supabase (app_settings) because the Vercel project's environment can't
// always be edited. The environment variable wins when it is set.
import { db } from './db.js';

const cache = new Map<string, { value: string; at: number }>();

/** process.env[envName], else the app_settings row `key`; '' when neither is set. Cached for a minute (maxAgeMs).
 *  A failed read is not cached, so a database hiccup can't lock everyone out for a minute. */
export async function setting(envName: string, key: string, maxAgeMs = 60e3): Promise<string> {
  if (process.env[envName]) return process.env[envName]!;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value;
  const r = await db().from('app_settings').select('value').eq('key', key).maybeSingle();
  if (r.error) return hit?.value || '';
  const value = (r.data?.value as string) || '';
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** Writes the app_settings row `key`; an empty value deletes it. Other instances see it once their cache expires. */
export async function saveSetting(key: string, value: string): Promise<void> {
  const r = value
    ? await db().from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() })
    : await db().from('app_settings').delete().eq('key', key);
  if (r.error) throw new Error('שמירת ההגדרה נכשלה: ' + r.error.message);
  cache.delete(key);
}
