/**
 * Código que se evalúa dentro de la vista de Instagram.
 *
 * Se define como una función normal y se serializa con toString(), así se escribe y se lee
 * como JavaScript de verdad en vez de como una cadena con escapes. Todo lo que hace es leer
 * lo que ya está renderizado en pantalla: no hace scroll, ni paginación, ni llamadas a
 * endpoints internos de Instagram.
 */
function instagramHelpers() {
  const PROFILE_HREF_RE = /^\/([A-Za-z0-9_.]+)\/?$/;
  const RESERVED_PATHS = new Set([
    'p', 'explore', 'reel', 'reels', 'stories', 'direct', 'accounts', 'about',
    'legal', 'developer', 'ads', 'tv', 'challenge', 'emails',
  ]);
  const NON_NAME_TEXT = new Set([
    'seguir', 'follow', 'siguiendo', 'following', 'verificado', 'verified',
    'eliminar', 'remove', 'enviar mensaje', 'message',
  ]);

  function matchUsername(href) {
    const match = PROFILE_HREF_RE.exec(href || '');
    if (!match) return null;
    if (RESERVED_PATHS.has(match[1].toLowerCase())) return null;
    return match[1];
  }

  function findProfileLink(root) {
    const anchors = root.querySelectorAll('a[href^="/"]');
    for (const anchor of anchors) {
      if (matchUsername(anchor.getAttribute('href'))) return anchor;
    }
    return null;
  }

  function countDistinctUsernames(el) {
    const usernames = new Set();
    el.querySelectorAll('a[href^="/"]').forEach((a) => {
      const username = matchUsername(a.getAttribute('href'));
      if (username) usernames.add(username);
    });
    return usernames.size;
  }

  /**
   * Instagram no expone clases estables (son hashes por build) y anida cada fila a una
   * profundidad distinta según la sección. Subimos desde el enlace de perfil hasta el primer
   * ancestro cuyo padre tenga varios hijos "de un solo usuario" con usernames distintos: ese
   * ancestro es una fila de la lista.
   */
  function findRepeatingRow(anchor, root, maxDepth) {
    let node = anchor;
    for (let i = 0; i < (maxDepth || 14) && node.parentElement && node !== root; i++) {
      const parent = node.parentElement;
      if (parent.children.length > 1) {
        const usernames = new Set();
        for (const sibling of Array.from(parent.children)) {
          if (countDistinctUsernames(sibling) !== 1) continue;
          const link = findProfileLink(sibling);
          const username = link && matchUsername(link.getAttribute('href'));
          if (username) usernames.add(username);
        }
        if (usernames.size > 1) return node;
      }
      node = parent;
    }
    return null;
  }

  function collectProfileRows(root) {
    const anchors = Array.from(root.querySelectorAll('a[href^="/"]')).filter((a) =>
      matchUsername(a.getAttribute('href')),
    );
    let rows = [];
    const seen = new Set();
    for (const anchor of anchors) {
      const row = findRepeatingRow(anchor, root);
      if (row && !seen.has(row)) {
        seen.add(row);
        rows.push(row);
      }
    }
    if (rows.length < 2) return rows;

    // Descarta coincidencias sueltas (cabecera del post, menciones del pie de foto) quedándose
    // solo con las filas que cuelgan del contenedor padre más frecuente: la lista real.
    const parentCounts = new Map();
    for (const row of rows) {
      const parent = row.parentElement;
      if (parent) parentCounts.set(parent, (parentCounts.get(parent) || 0) + 1);
    }
    let dominantParent = null;
    let dominantCount = 0;
    for (const [parent, count] of parentCounts) {
      if (count > dominantCount) {
        dominantParent = parent;
        dominantCount = count;
      }
    }
    if (dominantParent && dominantCount >= 2) {
      rows = rows.filter((row) => row.parentElement === dominantParent);
    }
    return rows;
  }

  function leafTexts(root) {
    return Array.from(root.querySelectorAll('span, div, h1, h2'))
      .filter((el) => el.children.length === 0)
      .map((el) => (el.textContent || '').trim())
      .filter((text) => text.length > 0);
  }

  function extractProfileFromRow(row) {
    const link = findProfileLink(row);
    if (!link) return null;
    const username = matchUsername(link.getAttribute('href'));
    if (!username) return null;
    const img = row.querySelector('img[alt]');
    const fullName = leafTexts(row).find(
      (text) => text !== username && !NON_NAME_TEXT.has(text.toLowerCase()),
    );
    return { username, fullName, profilePicUrl: img ? img.src : undefined };
  }

  function openDialog() {
    return document.querySelector('div[role="dialog"]');
  }

  /** Qué hay ahora mismo en pantalla, para saber qué se puede capturar. */
  function detectContext() {
    const path = location.pathname;
    const dialog = openDialog();
    if (dialog) {
      const text = (dialog.textContent || '').toLowerCase();
      if (text.includes('seguidores') || text.includes('followers')) {
        return { kind: 'followers', label: 'seguidores', seed: path.split('/')[1] || '' };
      }
      if (text.includes('seguidos') || text.includes('siguiendo') || text.includes('following')) {
        return { kind: 'following', label: 'seguidos', seed: path.split('/')[1] || '' };
      }
      if (text.includes('me gusta') || text.includes('likes')) {
        return { kind: 'likes', label: 'likes del post', seed: location.href };
      }
    }
    if (/^\/(p|reel)\//.test(path)) {
      return { kind: 'comments', label: 'comentaristas', seed: location.href };
    }
    if (/^\/explore\/tags\//.test(path)) {
      return { kind: 'hashtag', label: 'autores del hashtag', seed: path };
    }
    if (path.startsWith('/direct/')) {
      return { kind: 'direct', label: 'mensaje directo', seed: '' };
    }
    const username = matchUsername(path);
    if (username) return { kind: 'profile', label: 'perfil', seed: username };
    return { kind: 'none', label: '', seed: '' };
  }

  /** Captura los perfiles ya visibles en pantalla según el contexto actual. */
  function captureVisible() {
    const context = detectContext();
    let root = null;
    if (context.kind === 'followers' || context.kind === 'following' || context.kind === 'likes') {
      root = openDialog();
    } else if (context.kind === 'comments') {
      root = document.querySelector('article') || document.body;
    } else if (context.kind === 'hashtag') {
      root = document.querySelector('main') || document.body;
    }
    if (!root) return { context, profiles: [] };

    const seen = new Set();
    const profiles = [];
    for (const row of collectProfileRows(root)) {
      const extracted = extractProfileFromRow(row);
      if (!extracted || seen.has(extracted.username)) continue;
      seen.add(extracted.username);
      // En comentarios y likes solo interesa el perfil, no el texto del comentario.
      if (context.kind === 'comments' || context.kind === 'likes') {
        profiles.push({ username: extracted.username, profilePicUrl: extracted.profilePicUrl });
      } else {
        profiles.push(extracted);
      }
    }
    return { context, profiles };
  }

  function parseCount(text) {
    if (!text) return undefined;
    const clean = text.replace(/ /g, ' ').toLowerCase();
    const match = /([\d.,]+)\s*(mil|millones|millón|million|k|m)?/.exec(clean);
    if (!match) return undefined;
    const suffix = match[2];
    let raw = match[1];
    let value;
    if (suffix) {
      // Con sufijo el separador final es decimal: "38,4 mil" / "38.4K".
      value = parseFloat(raw.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
      if (suffix === 'mil' || suffix === 'k') value *= 1000;
      if (suffix === 'm' || suffix === 'millones' || suffix === 'millón' || suffix === 'million') value *= 1000000;
    } else {
      value = parseInt(raw.replace(/[.,]/g, ''), 10);
    }
    return Number.isFinite(value) ? Math.round(value) : undefined;
  }

  /** Lee los datos del perfil que está abierto: bio, seguidores, si es negocio y link externo. */
  function extractProfileDetails() {
    const username = matchUsername(location.pathname);
    if (!username) return null;
    const header = document.querySelector('header') || document.querySelector('main') || document.body;
    const texts = leafTexts(header);

    let followerCount;
    let followingCount;
    for (const text of texts) {
      const lower = text.toLowerCase();
      if (followerCount === undefined && (lower.includes('seguidores') || lower.includes('followers'))) {
        followerCount = parseCount(text);
      }
      if (followingCount === undefined && (lower.includes('seguidos') || lower.includes('following'))) {
        followingCount = parseCount(text);
      }
    }

    const externalLink = Array.from(header.querySelectorAll('a[href^="http"]'))
      .map((a) => a.getAttribute('href'))
      .find((href) => href && !href.includes('instagram.com'));

    const noise = /(publicaciones|posts|seguidores|followers|seguidos|following|verificado|verified|enviar mensaje|message|seguir|follow|siguiendo|más|more)/i;
    const bio = texts
      .filter((text) => text !== username && !noise.test(text) && text.length > 2)
      .slice(0, 6)
      .join(' ')
      .slice(0, 400);

    const isBusiness = texts.some((t) => /^(negocio|business|creador|creator|empresa)/i.test(t));

    return {
      username,
      bio: bio || undefined,
      followerCount,
      followingCount,
      externalLink: externalLink || undefined,
      isBusiness,
      enrichedAt: Date.now(),
    };
  }

  /**
   * Escribe el texto en la caja de mensaje como si se hubiera tecleado, para que React lo
   * registre. NUNCA envía: el envío lo hace la persona pulsando "Enviar" en Instagram.
   */
  function insertTemplate(text) {
    const boxes = document.querySelectorAll('div[contenteditable="true"][role="textbox"]');
    const box = boxes.length > 0 ? boxes[boxes.length - 1] : null;
    if (!box) return { ok: false, reason: 'no-box' };
    if ((box.textContent || '').trim().length > 0) return { ok: false, reason: 'not-empty' };

    box.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(box);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      box.textContent = text;
      box.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }
    return { ok: true };
  }

  return { detectContext, captureVisible, extractProfileDetails, insertTemplate };
}

/** Construye la expresión a evaluar dentro de la vista de Instagram. */
function call(fnName, ...args) {
  const serializedArgs = args.map((arg) => JSON.stringify(arg)).join(', ');
  return `(() => {
    try {
      const H = (${instagramHelpers.toString()})();
      return H.${fnName}(${serializedArgs});
    } catch (err) {
      return { error: String(err && err.message ? err.message : err) };
    }
  })()`;
}

module.exports = { call };
