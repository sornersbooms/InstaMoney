/**
 * Instagram no expone selectores estables: sus clases son hashes generados en cada build.
 * En vez de depender de clases, extraemos datos por estructura (enlaces de perfil + atributos
 * aria-label/alt, que Instagram sí mantiene por accesibilidad). Si Instagram cambia el markup,
 * este es el único archivo que hay que revisar.
 */

const PROFILE_HREF_RE = /^\/([A-Za-z0-9_.]+)\/?$/;

// Rutas reservadas de Instagram que calzan con el patrón /segmento/ pero no son perfiles.
const RESERVED_PATHS = new Set([
  'p', 'explore', 'reel', 'reels', 'stories', 'direct', 'accounts', 'about',
  'legal', 'developer', 'ads', 'tv', 'challenge', 'emails',
]);

export interface ExtractedProfile {
  username: string;
  fullName?: string;
  profilePicUrl?: string;
}

function matchUsername(href: string): string | null {
  const match = PROFILE_HREF_RE.exec(href);
  if (!match) return null;
  const username = match[1];
  if (RESERVED_PATHS.has(username.toLowerCase())) return null;
  return username;
}

/** Encuentra el <a> de perfil dentro de un nodo (el que enlaza a /username/). */
function findProfileLink(root: HTMLElement): HTMLAnchorElement | null {
  const anchors = root.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
  for (const a of anchors) {
    if (matchUsername(a.getAttribute('href') ?? '')) return a;
  }
  return null;
}

function countDistinctUsernames(el: HTMLElement): number {
  const anchors = el.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
  const usernames = new Set<string>();
  anchors.forEach((a) => {
    const username = matchUsername(a.getAttribute('href') ?? '');
    if (username) usernames.add(username);
  });
  return usernames.size;
}

/**
 * Instagram renderiza listas (seguidores, comentarios) como filas repetidas dentro de un
 * contenedor, pero la profundidad de anidación de divs de una fila a otra varía según la
 * sección. En vez de fijar una profundidad exacta, subimos desde el enlace de perfil hasta
 * encontrar el primer ancestro cuyo padre tenga varios hijos "de un solo usuario" (para no
 * confundir, por ejemplo, la cabecera del post con la columna completa de comentarios) y al
 * menos dos de esos hijos tengan usernames distintos: ese ancestro es "una fila" de la lista.
 */
function findRepeatingRow(anchor: HTMLAnchorElement, root: HTMLElement, maxDepth = 14): HTMLElement | null {
  let node: HTMLElement = anchor;
  for (let i = 0; i < maxDepth && node.parentElement && node !== root; i++) {
    const parent = node.parentElement;
    if (parent.children.length > 1) {
      const usernames = new Set<string>();
      for (const sibling of Array.from(parent.children) as HTMLElement[]) {
        if (countDistinctUsernames(sibling) !== 1) continue;
        const link = findProfileLink(sibling);
        const username = link && matchUsername(link.getAttribute('href') ?? '');
        if (username) usernames.add(username);
      }
      if (usernames.size > 1) return node;
    }
    node = parent;
  }
  return null;
}

/** Filas únicas (una por perfil) encontradas dentro de `root`, sin depender de <li> ni de clases. */
function collectProfileRows(root: HTMLElement): HTMLElement[] {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')).filter((a) =>
    matchUsername(a.getAttribute('href') ?? ''),
  );
  const rows: HTMLElement[] = [];
  const seenRows = new Set<HTMLElement>();
  for (const anchor of anchors) {
    const row = findRepeatingRow(anchor, root);
    if (row && !seenRows.has(row)) {
      seenRows.add(row);
      rows.push(row);
    }
  }

  // El heurístico de arriba a veces también acierta con elementos sueltos (la cabecera del
  // post, una mención en el pie de foto) que no pertenecen a la lista real. Nos quedamos solo
  // con las filas que comparten el contenedor padre más frecuente, que es la lista verdadera.
  if (rows.length < 2) return rows;
  const parentCounts = new Map<Element, number>();
  for (const row of rows) {
    const parent = row.parentElement;
    if (parent) parentCounts.set(parent, (parentCounts.get(parent) ?? 0) + 1);
  }
  let dominantParent: Element | null = null;
  let dominantCount = 0;
  for (const [parent, count] of parentCounts) {
    if (count > dominantCount) {
      dominantParent = parent;
      dominantCount = count;
    }
  }
  if (dominantParent && dominantCount >= 2) {
    return rows.filter((row) => row.parentElement === dominantParent);
  }
  return rows;
}

export function extractProfileFromRow(row: HTMLElement): ExtractedProfile | null {
  const link = findProfileLink(row);
  if (!link) return null;
  const username = matchUsername(link.getAttribute('href') ?? '');
  if (!username) return null;

  const img = row.querySelector<HTMLImageElement>('img[alt]');
  const profilePicUrl = img?.src;

  // Solo nodos "hoja" (sin hijos elemento): así su textContent es su propio texto y no la
  // concatenación de todos sus descendientes (username + nombre + botón juntos).
  const NON_NAME_TEXT = new Set(['seguir', 'follow', 'siguiendo', 'following', 'verificado', 'verified']);
  const textNodes = Array.from(row.querySelectorAll<HTMLElement>('span, div'))
    .filter((el) => el.children.length === 0)
    .map((el) => el.textContent?.trim())
    .filter((t): t is string => !!t && t.length > 0 && t !== username);
  const fullName = textNodes.find((t) => !NON_NAME_TEXT.has(t.toLowerCase()));

  return { username, fullName, profilePicUrl };
}

/** Filas visibles dentro del modal de "Seguidores"/"Followers" actualmente abierto. */
export function getFollowersModalRows(): HTMLElement[] {
  const dialog = document.querySelector<HTMLElement>('div[role="dialog"]');
  if (!dialog) return [];
  return collectProfileRows(dialog);
}

export function isFollowersModalOpen(): boolean {
  const dialog = document.querySelector<HTMLElement>('div[role="dialog"]');
  if (!dialog) return false;
  const heading = dialog.textContent?.toLowerCase() ?? '';
  return heading.includes('seguidores') || heading.includes('followers');
}

/** Filas de comentarios visibles en la página de un post abierto. */
export function getCommentRows(): HTMLElement[] {
  const root = document.querySelector<HTMLElement>('article') ?? document.body;
  return collectProfileRows(root);
}

export function isPostPage(): boolean {
  return /\/p\/[^/]+\/?/.test(location.pathname) || /\/reel\/[^/]+\/?/.test(location.pathname);
}

export function isDirectThreadPage(): boolean {
  return location.pathname.startsWith('/direct/');
}

/** Caja de redacción del DM (contenteditable). */
export function getDmComposeBox(): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>('div[contenteditable="true"][role="textbox"]');
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}
