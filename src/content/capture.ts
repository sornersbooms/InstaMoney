import { extractProfileFromRow, getCommentRows, getFollowersModalRows } from './selectors';
import type { CapturedProfile } from '@/lib/types';

/** Lee únicamente lo que ya está renderizado en pantalla — sin scroll ni paginación automática. */
export function captureVisibleFollowers(): CapturedProfile[] {
  const rows = getFollowersModalRows();
  const seen = new Set<string>();
  const profiles: CapturedProfile[] = [];
  for (const row of rows) {
    const extracted = extractProfileFromRow(row);
    if (!extracted || seen.has(extracted.username)) continue;
    seen.add(extracted.username);
    profiles.push(extracted);
  }
  return profiles;
}

/** De los comentarios solo guardamos el perfil de quien comentó, no el texto del comentario. */
export function captureVisibleCommenters(): CapturedProfile[] {
  const rows = getCommentRows();
  const seen = new Set<string>();
  const profiles: CapturedProfile[] = [];
  for (const row of rows) {
    const extracted = extractProfileFromRow(row);
    if (!extracted || seen.has(extracted.username)) continue;
    seen.add(extracted.username);
    profiles.push({ username: extracted.username, profilePicUrl: extracted.profilePicUrl });
  }
  return profiles;
}
