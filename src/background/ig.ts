/**
 * Cliente de Instagram. Las peticiones salen desde la ventana de trabajo, con la sesión del usuario.
 *
 * Instagram retiró de su web muchas rutas REST (perfiles, feeds, hashtags, ubicaciones, mensajes →
 * 404). Lo que sigue vivo se usa por API (seguidores/seguidos, relación, likers, comentarios, info de
 * publicación); el resto se lee de la propia página o se hace pulsando sus botones. Si algo deja de
 * funcionar, este es el archivo a revisar (y src/content/executor.ts para la parte de página).
 */
import { IgBlockError, runOnPage, sendToWorker } from './worker';

export { IgBlockError };
import type { Candidate, InboxThread } from '@/lib/types';

/** La ruta ya no existe en la web de Instagram (404 con HTML): hay que usar la vía por la página. */
export class IgUnavailableError extends Error {}

interface RawResponse {
  ok: boolean;
  status: number;
  data: any;
  text?: string;
  url?: string;
  loggedIn?: boolean;
  error?: string;
}

const BLOCK_MARKERS = ['feedback_required', 'checkpoint_required', 'challenge_required', 'login_required', 'spam', 'please wait', 'rate_limit', 'too many'];

async function call(method: 'GET' | 'POST', path: string, query?: Record<string, string>, form?: Record<string, string>): Promise<any> {
  const res = await sendToWorker<RawResponse>({ type: 'DP_IG', method, path, query, form });
  if (!res) throw new Error('Sin respuesta de la pestaña de Instagram.');
  if (res.error) throw new Error(res.error);
  const finalUrl = res.url ?? '';
  if (!res.data) {
    // Respuesta HTML: casi siempre una ruta que Instagram retiró (redirige a /accounts/login aunque haya
    // sesión). No es un bloqueo: se usa la alternativa por la página.
    if (finalUrl.includes('/challenge/')) throw new IgBlockError(`Instagram pide verificar la cuenta (checkpoint) en ${path}. Ábrela en la ventana de trabajo y complétalo.`);
    if (res.loggedIn === false) throw new Error('La sesión de Instagram está cerrada: inicia sesión en la ventana de trabajo.');
    throw new IgUnavailableError(`Instagram ya no ofrece ${path} en la web (${res.status}).`);
  }
  // Bloqueo real: solo lo que Instagram dice en JSON.
  const message = String(res.data.message ?? res.data.feedback_title ?? '').toLowerCase();
  const blocked = res.status === 429 || res.data.spam === true || BLOCK_MARKERS.some((m) => message.includes(m));
  if (blocked) {
    const why = res.data.feedback_message ?? res.data.feedback_title ?? res.data.message ?? 'acción bloqueada';
    throw new IgBlockError(`Instagram limitó la cuenta (${res.status} en ${path}): ${why}`);
  }
  if (!res.ok || res.data.status === 'fail') throw new Error(`Instagram ${res.status} en ${path}: ${res.data.message ?? 'error'}`);
  return res.data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IG = 'https://www.instagram.com';

// ───────────────────────────── perfiles ─────────────────────────────

export interface RecentPost {
  id: string;
  shortcode: string;
  /** Descripción automática de la imagen que genera Instagram ("Puede ser una imagen de…"). */
  altText?: string;
  /** 0 si no se conoce. */
  takenAt: number;
  caption: string;
}

export interface ProfileInfo {
  userId: string;
  username: string;
  fullName?: string;
  bio?: string;
  profilePicUrl?: string;
  followerCount?: number;
  followingCount?: number;
  mediaCount?: number;
  isPrivate: boolean;
  isVerified: boolean;
  /** undefined = no se puede saber desde la página. */
  isBusiness?: boolean;
  followedByViewer: boolean;
  followsViewer: boolean;
  recentPosts: RecentPost[];
}

export async function getSession(): Promise<{ userId?: string; username?: string; loggedIn: boolean }> {
  return sendToWorker({ type: 'DP_SESSION' });
}

export interface MediaInfo {
  id: string;
  altText?: string;
  shortcode: string;
  takenAt: number;
  caption: string;
  userId?: string;
  username?: string;
}

export async function getMediaInfo(mediaId: string): Promise<MediaInfo | null> {
  const data = await call('GET', `/api/v1/media/${mediaId}/info/`);
  const m = data.items?.[0];
  if (!m) return null;
  return {
    id: String(m.pk ?? mediaId).split('_')[0],
    shortcode: m.code,
    takenAt: (m.taken_at ?? 0) * 1000,
    caption: m.caption?.text ?? '',
    altText: m.accessibility_caption || undefined,
    userId: m.user?.pk ? String(m.user.pk) : undefined,
    username: m.user?.username,
  };
}

/**
 * Instagram retiró /users/web_profile_info de la web: el perfil se lee abriendo la página del usuario
 * en la ventana de trabajo (bio, contadores, ID y últimas publicaciones), como lo vería cualquier visitante.
 */
export async function getProfile(username: string): Promise<ProfileInfo> {
  const clean = username.replace(/^@/, '').trim();
  const res = await runOnPage<{ ok: boolean; error?: string; profile?: any }>(`${IG}/${encodeURIComponent(clean)}/`, { type: 'DP_DOM_PROFILE', username: clean });
  if (!res?.ok || !res.profile) throw new Error(res?.error ?? `No se pudo leer el perfil de @${clean}.`);
  const p = res.profile;
  if (!p.userId) throw new Error(`No se encontró el ID de @${clean} en su perfil.`);
  const recentPosts: RecentPost[] = ((p.shortcodes ?? []) as string[]).map((code, i) => ({
    id: mediaIdFromShortcode(code),
    shortcode: code,
    takenAt: 0,
    caption: (p.captions?.[i] as string) ?? '',
  }));
  // Fecha y texto exactos de la última publicación (para el filtro de actividad y la IA).
  if (recentPosts[0]) {
    try {
      const info = await getMediaInfo(recentPosts[0].id);
      if (info) {
        recentPosts[0].takenAt = info.takenAt;
        if (info.caption) recentPosts[0].caption = info.caption;
        recentPosts[0].altText = info.altText;
      }
    } catch (err) {
      if (err instanceof IgBlockError) throw err;
    }
  }
  return {
    userId: String(p.userId),
    username: clean,
    fullName: p.fullName,
    bio: p.bio,
    profilePicUrl: p.profilePicUrl,
    followerCount: p.followerCount,
    followingCount: p.followingCount,
    mediaCount: p.mediaCount,
    isPrivate: !!p.isPrivate,
    isVerified: !!p.isVerified,
    isBusiness: undefined,
    followedByViewer: !!p.followedByViewer,
    followsViewer: !!p.followsViewer,
    recentPosts,
  };
}

function toCandidates(users: any[]): Candidate[] {
  return (users ?? [])
    .filter((u) => u?.username)
    .map((u) => ({ username: u.username, userId: u.pk ? String(u.pk) : u.id ? String(u.id) : undefined }));
}

/** La lista de seguidores a veces no trae next_max_id aunque haya más: entonces se pagina por posición. */
function nextCursor(data: any, cursor: string | null | undefined, got: number): string | null {
  if (data.next_max_id) return String(data.next_max_id);
  if (data.has_more && got > 0) return String((Number(cursor) || 0) + got);
  return null;
}

export async function getFollowers(userId: string, cursor?: string | null) {
  const query: Record<string, string> = { count: '25', search_surface: 'follow_list_page' };
  if (cursor) query.max_id = cursor;
  const data = await call('GET', `/api/v1/friendships/${userId}/followers/`, query);
  const candidates = toCandidates(data.users);
  return { candidates, next: nextCursor(data, cursor, candidates.length) };
}

export async function getFollowing(userId: string, cursor?: string | null) {
  const query: Record<string, string> = { count: '25' };
  if (cursor) query.max_id = cursor;
  const data = await call('GET', `/api/v1/friendships/${userId}/following/`, query);
  const candidates = toCandidates(data.users);
  return { candidates, next: nextCursor(data, cursor, candidates.length) };
}

// ───────────────────────────── publicaciones ─────────────────────────────

const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function shortcodeFromInput(input: string): string {
  const m = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(input);
  return m ? m[1] : input.trim();
}

export function mediaIdFromShortcode(shortcode: string): string {
  let id = 0n;
  for (const ch of shortcode.slice(0, 11)) id = id * 64n + BigInt(SHORTCODE_ALPHABET.indexOf(ch));
  return id.toString();
}

export function shortcodeFromMediaId(mediaId: string): string {
  let id = BigInt(mediaId.split('_')[0]);
  let code = '';
  while (id > 0n) {
    code = SHORTCODE_ALPHABET[Number(id % 64n)] + code;
    id /= 64n;
  }
  return code;
}

export async function getLikers(mediaId: string): Promise<Candidate[]> {
  const data = await call('GET', `/api/v1/media/${mediaId}/likers/`);
  return toCandidates(data.users);
}

export interface IgComment {
  pk: string;
  userId: string;
  username: string;
  text: string;
  createdAt: number;
}

export async function getComments(mediaId: string, cursor?: string | null) {
  const query: Record<string, string> = { can_support_threading: 'true', permalink_enabled: 'false' };
  if (cursor) query.min_id = cursor;
  const data = await call('GET', `/api/v1/media/${mediaId}/comments/`, query);
  const comments: IgComment[] = (data.comments ?? []).map((c: any) => ({
    pk: String(c.pk),
    userId: String(c.user?.pk ?? c.user_id),
    username: c.user?.username,
    text: c.text ?? '',
    createdAt: (c.created_at ?? 0) * 1000,
  }));
  return { comments, next: (data.next_min_id as string | undefined) ?? null };
}

interface GridCursor {
  page: number;
  taken: number;
}

/**
 * Hashtags y ubicaciones: Instagram retiró sus APIs web, así que se abre la página (/explore/tags/… o
 * /explore/locations/…), se leen las publicaciones de la cuadrícula y el autor de cada una sale de
 * /media/{id}/info/ (que sí sigue disponible).
 */
async function getGridUsers(url: string, cursor?: string | null) {
  const c: GridCursor = cursor ? JSON.parse(cursor) : { page: 0, taken: 0 };
  const res = await runOnPage<{ ok: boolean; shortcodes?: string[]; error?: string }>(url, { type: 'DP_DOM_GRID', scrolls: c.page });
  if (!res?.ok) throw new Error(res?.error ?? 'No se pudo leer la página.');
  if (c.page === 0 && (res.shortcodes ?? []).length === 0) {
    throw new Error('Instagram no muestra publicaciones aquí (resultados ocultos por «contenido sensible» o sin publicaciones). Prueba otro hashtag o ubicación.');
  }
  const fresh = (res.shortcodes ?? []).slice(c.taken, c.taken + 12);
  const owners = new Map<string, Candidate>();
  for (const code of fresh) {
    try {
      const info = await getMediaInfo(mediaIdFromShortcode(code));
      if (info?.username) owners.set(info.username, { username: info.username, userId: info.userId, context: info.caption.slice(0, 200) });
    } catch (err) {
      if (err instanceof IgBlockError) throw err;
    }
    await sleep(1200 + Math.random() * 1500);
  }
  const next: GridCursor | null = fresh.length > 0 && c.page < 10 ? { page: c.page + 1, taken: c.taken + fresh.length } : null;
  return { candidates: [...owners.values()], next: next ? JSON.stringify(next) : null };
}

export function getHashtagUsers(tag: string, cursor?: string | null) {
  const clean = tag.replace(/^#/, '').trim();
  return getGridUsers(`${IG}/explore/tags/${encodeURIComponent(clean)}/`, cursor);
}

export function locationIdFromInput(input: string): string {
  const m = /locations\/(\d+)/.exec(input);
  return m ? m[1] : input.trim();
}

export function getLocationUsers(locationId: string, cursor?: string | null) {
  return getGridUsers(`${IG}/explore/locations/${locationId}/`, cursor);
}

/** Últimas publicaciones propias (para las reglas de palabra clave). */
export async function getOwnRecentPosts(count: number): Promise<RecentPost[]> {
  const s = await getSession();
  if (!s.username) throw new Error('No se pudo saber cuál es tu usuario de Instagram.');
  const p = await getProfile(s.username);
  return p.recentPosts.slice(0, count);
}

// ───────────────────────────── acciones ─────────────────────────────
//
// IMPORTANTE: ninguna acción que cambia algo (seguir, me gusta, comentar…) usa la API. Las rutas
// antiguas (/web/likes/…, /media/…/like/, /friendships/create/…) ya no existen en la web e Instagram
// llega a CERRAR LA SESIÓN al recibirlas. Todo se hace pulsando los botones de la página, como una
// persona. La API solo se usa para lecturas que la propia web de Instagram sigue haciendo.

async function domAction(url: string, message: Record<string, unknown>, what: string) {
  const res = await runOnPage<{ ok: boolean; error?: string }>(url, message);
  if (!res?.ok) throw new Error(res?.error ?? `No se pudo ${what}.`);
}

export async function follow(_userId: string, username: string) {
  await domAction(`${IG}/${username}/`, { type: 'DP_DOM_FOLLOW' }, 'seguir');
}

export async function unfollow(_userId: string, username: string) {
  await domAction(`${IG}/${username}/`, { type: 'DP_DOM_UNFOLLOW' }, 'dejar de seguir');
}

export async function friendship(userId: string): Promise<{ following: boolean; followedBy: boolean }> {
  const data = await call('GET', `/api/v1/friendships/show/${userId}/`);
  return { following: !!data.following, followedBy: !!data.followed_by };
}

export async function like(mediaId: string) {
  await domAction(`${IG}/p/${shortcodeFromMediaId(mediaId)}/`, { type: 'DP_DOM_LIKE' }, 'dar me gusta');
}

/** Comentario en la publicación. Las respuestas a un comentario van como comentario normal con @usuario. */
export async function comment(mediaId: string, text: string, _replyToCommentId?: string) {
  await domAction(`${IG}/p/${shortcodeFromMediaId(mediaId)}/`, { type: 'DP_DOM_COMMENT', text }, 'comentar');
}

export async function addCloseFriend(_userId: string) {
  throw new Error('«Mejores Amigos» está desactivado: Instagram solo permite gestionarlo desde su lista y por API cierra la sesión. Quita esa acción.');
}

// ───────────────────────────── bandeja de entrada ─────────────────────────────

/**
 * Instagram retiró de la web la API REST de mensajes (direct_v2 devuelve 404), así que la bandeja se
 * lee desde la propia página /direct/inbox/ en la ventana de trabajo.
 */
export async function getInbox(maxRows = 60): Promise<InboxThread[]> {
  const res = await runOnPage<{ ok: boolean; threads?: InboxThread[]; error?: string }>(`${IG}/direct/inbox/`, { type: 'DP_DOM_INBOX', maxRows });
  if (!res?.ok) throw new Error(res?.error ?? 'No se pudo leer la bandeja de mensajes.');
  return res.threads ?? [];
}
