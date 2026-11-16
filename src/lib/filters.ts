import { detectLanguage, splitList } from './text';
import type { SegmentFilter } from './types';

export interface FilterableProfile {
  bio?: string;
  fullName?: string;
  followerCount?: number;
  followingCount?: number;
  mediaCount?: number;
  isPrivate: boolean;
  isVerified: boolean;
  /** undefined = desconocido (la web ya no lo muestra): no se descarta por ello. */
  isBusiness?: boolean;
  followedByViewer: boolean;
  followsViewer: boolean;
  lastPostAt?: number;
  captions: string[];
}

function strip(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Aplica los filtros de segmentación. Devuelve el motivo del descarte o null si pasa. */
export function rejectReason(p: FilterableProfile, f: SegmentFilter): string | null {
  if (f.skipPrivate && p.isPrivate) return 'cuenta privada';
  if (f.skipVerified && p.isVerified) return 'cuenta verificada';
  if (f.onlyBusiness && p.isBusiness === false) return 'no es cuenta profesional';
  if (f.skipAlreadyConnected && (p.followedByViewer || p.followsViewer)) return 'ya conectado contigo';

  const followers = p.followerCount ?? 0;
  const following = p.followingCount ?? 0;
  if (f.minFollowers != null && followers < f.minFollowers) return `pocos seguidores (${followers})`;
  if (f.maxFollowers != null && followers > f.maxFollowers) return `demasiados seguidores (${followers})`;
  if (f.minFollowing != null && following < f.minFollowing) return `sigue a pocos (${following})`;
  if (f.maxFollowing != null && following > f.maxFollowing) return `sigue a demasiados (${following})`;
  if (f.minPosts != null && (p.mediaCount ?? 0) < f.minPosts) return `pocas publicaciones (${p.mediaCount ?? 0})`;

  if (f.activeWithinDays != null) {
    if (p.mediaCount === 0) return 'sin publicaciones';
    // Fecha desconocida (no se pudo leer la última publicación): no se descarta.
    if (p.lastPostAt) {
      const days = (Date.now() - p.lastPostAt) / 86_400_000;
      if (days > f.activeWithinDays) return `inactivo (${Math.round(days)} días sin publicar)`;
    }
  }

  const haystack = strip(`${p.bio ?? ''} ${p.fullName ?? ''}`);
  const include = splitList(f.bioInclude).map(strip);
  if (include.length && !include.some((w) => haystack.includes(w))) return 'bio sin palabras clave';
  const exclude = splitList(f.bioExclude).map(strip);
  const hit = exclude.find((w) => haystack.includes(w));
  if (hit) return `bio contiene "${hit}"`;

  if (f.languages.length) {
    const lang = detectLanguage(`${p.bio ?? ''} ${p.captions.join(' ')}`);
    if (!lang || !f.languages.includes(lang)) return `idioma ${lang ?? 'desconocido'}`;
  }
  return null;
}
