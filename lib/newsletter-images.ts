// Stores the inline pictures of a newsletter issue (see parseIssue's `images`) as files in the public
// wall-photos bucket, and points each news item's `image` at its file. The file name carries a hash
// of the bytes, so a re-import that changes a picture gets a new URL past any CDN cache, and an
// unchanged one is simply overwritten in place.
import { createHash } from 'node:crypto';
import { db } from './db.js';
import type { ParsedIssue } from './newsletter.js';

const BUCKET = 'wall-photos';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

type Store = {
  upload(path: string, body: Buffer, o: { contentType: string; upsert: boolean; cacheControl: string }): Promise<{ error: { message: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
};
/** Uploads every inline picture and fills in `image` in place. A picture that fails stays null (the wall then uses
 *  its category image), so one bad upload never blocks the issue. Returns how many pictures were stored. */
export async function storeNewsletterImages(parsed: ParsedIssue, store: Store = db().storage.from(BUCKET)): Promise<{ stored: number; failed: number }> {
  let stored = 0, failed = 0;
  await Promise.all(parsed.images.map(async (img, i) => {
    const item = parsed.content.news[i];
    if (!img || !item) return;
    const ext = EXT[img.mime];
    if (!ext) { failed++; return; }
    const bytes = Buffer.from(img.base64, 'base64');
    const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 10);
    const path = `newsletter/${parsed.issue_date}/${String(i).padStart(2, '0')}-${hash}.${ext}`;
    const up = await store.upload(path, bytes, { contentType: img.mime, upsert: true, cacheControl: '31536000' });
    if (up.error) { failed++; console.error(`[newsletter] picture ${i}: ${up.error.message}`); return; }
    item.image = store.getPublicUrl(path).data.publicUrl;
    stored++;
  }));
  return { stored, failed };
}
