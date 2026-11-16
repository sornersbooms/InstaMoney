/**
 * Ejecutor del motor de automatización dentro de instagram.com.
 *
 * El service worker no puede hablar con Instagram con la sesión del usuario, así que delega aquí:
 *  - Peticiones a la API web de Instagram (mismo origen → viajan las cookies de la sesión).
 *  - Acciones de interfaz que Instagram no expone por API de forma estable: escribir y enviar un DM,
 *    grabar una nota de voz y ver/reaccionar historias.
 */
import { getDmComposeBox } from './selectors';

const IG_APP_ID = '936619743392459';

function cookie(name: string): string | undefined {
  const m = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : undefined;
}

interface IgRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string>;
  form?: Record<string, string>;
}

async function igRequest(req: IgRequest) {
  const url = new URL(req.path, 'https://www.instagram.com');
  if (req.query) for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    'x-ig-app-id': IG_APP_ID,
    'x-requested-with': 'XMLHttpRequest',
    'x-asbd-id': '129477',
    'x-ig-www-claim': sessionStorage.getItem('www-claim-v2') ?? '0',
    'x-csrftoken': cookie('csrftoken') ?? '',
  };
  let body: string | undefined;
  if (req.method === 'POST') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(req.form ?? {}).toString();
  }
  const res = await fetch(url.toString(), { method: req.method, headers, body, credentials: 'include' });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* HTML (login, checkpoint...) */
  }
  return { ok: res.ok, status: res.status, data, text: data ? undefined : text.slice(0, 300), url: res.url, loggedIn: !!cookie('ds_user_id') };
}

// ───────────────────────────── utilidades DOM ─────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera a que `fn` devuelva algo, usando MutationObserver (no se frena en pestañas en segundo plano). */
function waitFor<T>(fn: () => T | null | undefined | false, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const first = fn();
    if (first) return resolve(first);
    const obs = new MutationObserver(() => {
      const v = fn();
      if (v) {
        obs.disconnect();
        clearTimeout(timer);
        resolve(v);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const timer = setTimeout(() => {
      obs.disconnect();
      resolve(fn() || null);
    }, timeoutMs);
  });
}

function norm(s: string | null | undefined) {
  return (s ?? '').trim().toLowerCase();
}

/** Botón (role=button o <button>) cuyo texto o aria-label (propio o de su svg) coincida. */
function findButton(labels: string[], root: ParentNode = document): HTMLElement | null {
  const wanted = labels.map((l) => l.toLowerCase());
  const svgs = root.querySelectorAll<SVGElement>('svg[aria-label]');
  for (const svg of svgs) {
    if (wanted.includes(norm(svg.getAttribute('aria-label')))) {
      const btn = svg.closest<HTMLElement>('[role="button"], button, a');
      if (btn) return btn;
    }
  }
  const buttons = root.querySelectorAll<HTMLElement>('[role="button"], button');
  for (const b of buttons) {
    // Texto VISIBLE (innerText): textContent incluye las etiquetas ocultas de los iconos, p. ej.
    // "Siguiendo" + "Icono de comilla angular hacia abajo".
    const visible = norm(b.innerText || b.textContent);
    if (wanted.includes(norm(b.getAttribute('aria-label'))) || wanted.includes(visible)) return b;
  }
  return null;
}

function realClick(el: HTMLElement) {
  el.scrollIntoView({ block: 'center' });
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

/** Cierra popups típicos ("Activar notificaciones" → "Ahora no"). */
function dismissPopups() {
  const btn = findButton(['ahora no', 'not now']);
  if (btn) realClick(btn);
}

function typeInto(box: HTMLElement, text: string) {
  box.focus();
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  // Cada línea se inserta por separado con Shift+Enter entre medias (Enter solo enviaría).
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (i > 0) document.execCommand('insertLineBreak');
    if (line) {
      const ok = document.execCommand('insertText', false, line);
      if (!ok) box.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: line }));
    }
  });
}

function pressEnter(el: HTMLElement) {
  const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keypress', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
}

// ───────────────────────────── acciones de interfaz ─────────────────────────────

/**
 * Abre el chat. En un perfil pulsa su botón "Enviar mensaje" (se abre como ventana flotante sobre el
 * perfil); en /direct/t/… el chat ya está abierto.
 */
async function openChat(): Promise<HTMLElement | null> {
  await sleep(1500);
  dismissPopups();
  if (!location.pathname.startsWith('/direct/')) {
    const header = await waitFor(() => document.querySelector<HTMLElement>('main header'), 15000);
    if (!header) return null;
    await sleep(800);
    const msgBtn = findButton(['enviar mensaje', 'message'], header);
    if (!msgBtn) return null;
    realClick(msgBtn);
  }
  const box = await waitFor(() => getDmComposeBox(), 15000);
  dismissPopups();
  return box;
}

async function domSendDm(text: string) {
  const box = await openChat();
  if (!box) return { ok: false, error: 'No se pudo abrir el chat (sin botón «Enviar mensaje»: cuenta privada o con mensajes cerrados).' };
  dismissPopups();
  await sleep(600 + Math.random() * 900);
  typeInto(box, text);
  await sleep(700 + Math.random() * 800);
  const sendBtn = findButton(['enviar', 'send']);
  if (sendBtn) realClick(sendBtn);
  else pressEnter(box);
  const cleared = await waitFor(() => norm(getDmComposeBox()?.textContent) === '' && 'yes', 8000);
  if (!cleared) return { ok: false, error: 'El texto quedó en la caja: Instagram no aceptó el envío.' };
  const threadMatch = /\/direct\/t\/([^/]+)/.exec(location.pathname);
  return { ok: true, threadId: threadMatch?.[1] };
}

async function domSendVoice(durationMs: number) {
  const box = await openChat();
  if (!box) return { ok: false, error: 'No apareció el chat para la nota de voz.' };
  const mic = findButton(['clip de voz', 'voice clip', 'grabar clip de voz', 'record voice clip', 'mensaje de voz', 'voice message']);
  if (!mic) return { ok: false, error: 'No se encontró el botón de micrófono en el chat.' };
  realClick(mic);
  await sleep(durationMs + 600);
  const send = await waitFor(() => findButton(['enviar', 'send', 'enviar clip de voz', 'send voice clip']), 5000);
  if (!send) return { ok: false, error: 'No apareció el botón para enviar la nota de voz.' };
  realClick(send);
  await sleep(2500);
  return { ok: true };
}

async function domViewStories(maxStories: number, react: boolean, viewSecs: number) {
  await sleep(2000);
  // Solo las historias de ESTA persona: al acabarlas, Instagram salta sola a las de la siguiente cuenta.
  const own = /^\/stories\/[^/]+\//.exec(location.pathname)?.[0];
  const stillOwn = () => !!own && location.pathname.startsWith(own);
  if (!stillOwn()) return { ok: true, viewed: 0, reacted: false, note: 'Sin historias activas.' };
  const viewBtn = await waitFor(() => findButton(['ver historia', 'view story', 'ver historias', 'view stories']), 6000);
  if (viewBtn) realClick(viewBtn);
  let viewed = 0;
  let reacted = false;
  for (let i = 0; i < maxStories; i++) {
    if (!stillOwn()) break;
    await sleep((viewSecs + Math.random() * 3) * 1000);
    if (!stillOwn()) break;
    viewed++;
    if (react && !reacted) {
      const like = findButton(['me gusta', 'like']);
      if (like) {
        realClick(like);
        reacted = true;
        await sleep(800);
      }
    }
    if (i === maxStories - 1) break;
    const next = findButton(['siguiente', 'next']);
    if (next) realClick(next);
    else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, bubbles: true }));
  }
  return { ok: true, viewed, reacted };
}

/** "hace 8 semanas", "2 h", "3 sem", "5d", "ahora"… → milisegundos de antigüedad aproximada. */
function parseAgo(text: string): number {
  const t = text.toLowerCase();
  if (/ahora|now|justo/.test(t)) return 0;
  const m = /(\d+)\s*(seg|s\b|min|m\b|h|d|sem|w|mes|a|y)/.exec(t);
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2];
  const MIN = 60_000;
  const map: Record<string, number> = { seg: 1000, s: 1000, min: MIN, m: MIN, h: 60 * MIN, d: 1440 * MIN, sem: 10080 * MIN, w: 10080 * MIN, mes: 43200 * MIN, a: 525600 * MIN, y: 525600 * MIN };
  return n * (map[unit] ?? 0);
}

/**
 * Lee la lista de conversaciones de /direct/inbox/. Instagram ya no ofrece la API REST de mensajes
 * en la web, así que se lee lo que pinta la página: nombre, último mensaje, hora y si está sin leer.
 */
async function domReadInbox(maxRows: number) {
  const list = await waitFor(() => document.querySelector<HTMLElement>('[aria-label="Lista de conversaciones"], [aria-label="Conversation list"], [aria-label="Thread list"]'), 20000);
  if (!list) return { ok: false, error: 'No se encontró la lista de conversaciones (¿sesión cerrada?).' };
  await sleep(2500);
  const scroller = [...list.querySelectorAll<HTMLElement>('*')].find((e) => e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
  const seen = new Map<string, unknown>();
  for (let round = 0; round < 8 && seen.size < maxRows; round++) {
    const rows = [...list.querySelectorAll<HTMLElement>('div[role="button"]')].filter((r) => r.querySelector('img'));
    for (const row of rows) {
      const leafs = [...row.querySelectorAll<HTMLElement>('span')].filter((e) => e.children.length === 0 && (e.textContent ?? '').trim());
      const timeEl = row.querySelector<HTMLElement>('abbr[aria-label], [aria-label^="hace"], [aria-label$="ago"]');
      if (!timeEl || leafs.length < 2) continue; // cabeceras como "Tu nota"
      const name = leafs[0].textContent!.trim();
      const snippetRaw = leafs[1].textContent!.trim();
      const lastFromMe = /^(tú|tu|you):\s*/i.test(snippetRaw);
      const unread = leafs.slice(0, 2).some((l) => Number(getComputedStyle(l).fontWeight) >= 600);
      const ago = parseAgo(timeEl.getAttribute('aria-label') ?? timeEl.textContent ?? '');
      if (!seen.has(name))
        seen.set(name, { name, lastText: snippetRaw.replace(/^(tú|tu|you):\s*/i, ''), lastFromMe, unread, lastAt: Date.now() - ago });
    }
    if (!scroller) break;
    scroller.scrollTop = scroller.scrollHeight;
    await sleep(1500);
  }
  return { ok: true, threads: [...seen.values()].slice(0, maxRows) };
}

// ───────────────────────────── perfiles y publicaciones (por la página) ─────────────────────────────
//
// Instagram retiró de la web la API REST de perfiles (/users/web_profile_info), feeds, hashtags y
// ubicaciones (404). Esos datos se leen ahora de la propia página, que es lo que ve cualquier visitante.

/** "686M", "8,648", "32K", "1.234", "12,5 mil", "1,2 M" → número. */
function parseCount(raw: string): number | undefined {
  const m = /([\d.,]+)\s*(k|mil|m|mill|millones|b)?\b/i.exec(raw.trim());
  if (!m) return undefined;
  const suffix = (m[2] ?? '').toLowerCase();
  let num = m[1];
  if (suffix) {
    num = num.replace(',', '.');
    const mult = suffix === 'k' || suffix === 'mil' ? 1e3 : suffix === 'b' ? 1e9 : 1e6;
    return Math.round(parseFloat(num) * mult);
  }
  return Number(num.replace(/[.,\s]/g, '')) || 0;
}

function countBefore(text: string, words: string[]): number | undefined {
  const re = new RegExp(`([\\d.,]+\\s*(?:K|M|B|mil|millones)?)\\s*(?:${words.join('|')})`, 'i');
  const m = re.exec(text);
  return m ? parseCount(m[1]) : undefined;
}

function shortcodesOnPage(root: ParentNode = document): string[] {
  const codes: string[] = [];
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]')) {
    const m = /\/(?:p|reel)\/([A-Za-z0-9_-]+)/.exec(a.getAttribute('href') ?? '');
    if (m && !codes.includes(m[1])) codes.push(m[1]);
  }
  return codes;
}

async function domReadProfile(username: string) {
  const header = await waitFor(() => document.querySelector<HTMLElement>('main header'), 15000);
  const html = document.documentElement.innerHTML;
  if (!header) {
    if (/Esta página no está disponible|Sorry, this page isn't available/i.test(document.body.innerText)) return { ok: false, error: `@${username} no existe o no está disponible.` };
    return { ok: false, error: 'No se pudo leer el perfil (¿sesión cerrada?).' };
  }
  await sleep(1200);
  const meta = (p: string) => document.querySelector<HTMLMetaElement>(`meta[property="${p}"]`)?.content ?? '';
  const desc = meta('og:description') || document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || '';
  const userId = /"profile_id":"(\d+)"/.exec(html)?.[1];
  const title = meta('og:title');
  const fullName = /^(.*?)\s*\(@/.exec(title)?.[1]?.trim() || undefined;

  // Textos de la cabecera en orden: usuario, nombre, contadores, bio…, enlace, botones, destacadas.
  const buttonsText = new Set(['seguir', 'follow', 'siguiendo', 'following', 'enviar mensaje', 'message', 'solicitado', 'requested', 'seguir también', 'follow back']);
  const leafs = [...header.querySelectorAll<HTMLElement>('span, h1, h2, div')]
    .filter((e) => e.children.length === 0 && (e.innerText ?? '').trim())
    .map((e) => ({ el: e, text: e.innerText.trim() }));
  const countIdx = leafs.reduce((last, l, i) => (/^[\d.,]+\s*(K|M|B|mil)?$/i.test(l.text) ? i : last), -1);
  const bioParts: string[] = [];
  for (const l of leafs.slice(countIdx + 1)) {
    // La bio va dentro de un botón ("ver más"), así que solo se corta en enlaces, botones de acción o
    // el resumen de enlaces externos ("web.com y 2 más").
    const inButton = !!l.el.closest('button, [role="button"]');
    const looksLikeLinks = /[a-z0-9-]+\.[a-z]{2,}/i.test(l.text) && /\s(y|and)\s\d+\s(más|more)$|^[^\s]+\.[a-z]{2,}/i.test(l.text);
    if (l.el.closest('a') || buttonsText.has(l.text.toLowerCase()) || (inButton && looksLikeLinks)) break;
    if (l.text === username || l.text === fullName) continue;
    bioParts.push(l.text);
  }
  const btnTexts = [...header.querySelectorAll<HTMLElement>('button, [role="button"]')].map((b) => norm(b.innerText));
  const mainText = document.querySelector('main')?.textContent ?? '';
  const codes = shortcodesOnPage(document.querySelector('main') ?? document).slice(0, 6);
  const captions = codes.map((c) => document.querySelector<HTMLImageElement>(`main a[href*="/${c}/"] img`)?.alt ?? '');

  return {
    ok: true,
    profile: {
      userId,
      username,
      fullName,
      bio: bioParts.join('\n') || undefined,
      profilePicUrl: header.querySelector<HTMLImageElement>('img')?.src,
      followerCount: countBefore(desc, ['seguidores', 'followers']),
      followingCount: countBefore(desc, ['siguiendo', 'seguidos', 'following']),
      mediaCount: countBefore(desc, ['publicaciones', 'posts']),
      isPrivate: /Esta cuenta es privada|This account is private/i.test(mainText),
      isVerified: !!header.querySelector('svg[aria-label="Verificado"], svg[aria-label="Verified"]'),
      followedByViewer: btnTexts.some((t) => ['siguiendo', 'following', 'solicitado', 'requested'].includes(t)),
      followsViewer: btnTexts.some((t) => ['seguir también', 'follow back'].includes(t)),
      shortcodes: codes,
      captions,
    },
  };
}

/** Cuadrícula de /explore/tags/… o /explore/locations/…: devuelve shortcodes tras hacer scroll. */
async function domReadGrid(scrolls: number) {
  const main = await waitFor(() => document.querySelector<HTMLElement>('main'), 15000);
  if (!main) return { ok: false, error: 'No cargó la página.' };
  await waitFor(() => shortcodesOnPage(main).length > 0 && 'yes', 12000);
  for (let i = 0; i < scrolls; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(1800 + Math.random() * 1200);
  }
  return { ok: true, shortcodes: shortcodesOnPage(main) };
}

/**
 * Corazón de la PUBLICACIÓN. En la página hay muchos "Me gusta": uno por comentario (16 px) y el de
 * la publicación (24 px). Se elige el más grande para no dar like a un comentario por error.
 */
function postHeart(labels: string[]): HTMLElement | null {
  const wanted = labels.map((l) => l.toLowerCase());
  const svgs = [...document.querySelectorAll<SVGElement>('main svg[aria-label]')].filter((s) => wanted.includes(norm(s.getAttribute('aria-label'))));
  const size = (s: SVGElement) => Number(s.getAttribute('width')) || s.getBoundingClientRect().width;
  const biggest = svgs.sort((a, b) => size(b) - size(a))[0];
  if (!biggest || size(biggest) < 20) return null;
  return biggest.closest<HTMLElement>('[role="button"], button') ?? (biggest.parentElement as HTMLElement | null);
}

async function domLikePost() {
  await waitFor(() => document.querySelector('main article, main [role="presentation"], main section'), 15000);
  await sleep(1000);
  if (postHeart(['ya no me gusta', 'unlike'])) return { ok: true, already: true };
  const btn = await waitFor(() => postHeart(['me gusta', 'like']), 8000);
  if (!btn) return { ok: false, error: 'No se encontró el botón Me gusta de la publicación.' };
  realClick(btn);
  const done = await waitFor(() => postHeart(['ya no me gusta', 'unlike']) && 'yes', 5000);
  return done ? { ok: true } : { ok: false, error: 'Instagram no registró el me gusta.' };
}

const COMMENT_BOX = 'textarea[aria-label^="Añade un comentario"], textarea[aria-label^="Add a comment"], form textarea';

const commentBox = () => document.querySelector<HTMLTextAreaElement>(COMMENT_BOX);

/** Escribe en la textarea de React (setter nativo + evento input, que es lo que React escucha). */
function setTextareaValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  el.focus();
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function domCommentPost(text: string) {
  await waitFor(() => document.querySelector('main'), 15000);
  let box = await waitFor(commentBox, 6000);
  if (!box) {
    // Versión móvil o caja oculta: el icono "Comentar" la muestra.
    const icon = findButton(['comentar', 'comment']);
    if (icon) {
      realClick(icon);
      box = await waitFor(commentBox, 10000);
    }
  }
  if (!box) return { ok: false, error: 'Los comentarios están cerrados o no cargó la publicación.' };

  // Recién cargada, Instagram sustituye la caja inicial por la interactiva: hay que esperar y volver a
  // buscarla en cada paso (antes el texto acababa en una caja que ya no estaba en pantalla).
  await sleep(2500);
  let written = false;
  for (let attempt = 0; attempt < 3 && !written; attempt++) {
    const current = commentBox();
    if (!current) break;
    realClick(current);
    await sleep(500);
    const fresh = commentBox() ?? current;
    setTextareaValue(fresh, text);
    await sleep(800);
    written = commentBox()?.value === text;
  }
  if (!written) return { ok: false, error: 'No se pudo escribir el comentario en la caja.' };

  await sleep(500 + Math.random() * 700);
  const form = commentBox()?.closest('form') ?? document;
  const publish = await waitFor(() => findButton(['publicar', 'post'], form), 4000);
  if (publish) realClick(publish);
  else pressEnter(commentBox()!);

  // Publicado = la caja queda vacía o el comentario aparece en la lista.
  const snippet = text.slice(0, 25);
  const done = await waitFor(() => ((commentBox()?.value ?? '') === '' || (document.querySelector('main')?.innerText ?? '').includes(snippet)) && 'yes', 12000);
  return done ? { ok: true } : { ok: false, error: 'Instagram no publicó el comentario (el texto quedó en la caja).' };
}

async function domFollow() {
  const header = await waitFor(() => document.querySelector<HTMLElement>('main header'), 15000);
  if (!header) return { ok: false, error: 'No cargó el perfil.' };
  await sleep(800);
  if (findButton(['siguiendo', 'following', 'solicitado', 'requested'], header)) return { ok: true, already: true };
  const btn = findButton(['seguir', 'follow', 'seguir también', 'follow back'], header);
  if (!btn) return { ok: false, error: 'No se encontró el botón Seguir.' };
  realClick(btn);
  const done = await waitFor(() => findButton(['siguiendo', 'following', 'solicitado', 'requested'], header) && 'yes', 6000);
  return done ? { ok: true } : { ok: false, error: 'Instagram no registró el seguimiento.' };
}

async function domUnfollow() {
  const header = await waitFor(() => document.querySelector<HTMLElement>('main header'), 15000);
  if (!header) return { ok: false, error: 'No cargó el perfil.' };
  await sleep(800);
  const followLabels = ['seguir', 'follow', 'seguir también', 'follow back'];
  if (findButton(followLabels, header)) return { ok: true, already: true };
  const btn = findButton(['siguiendo', 'following', 'solicitado', 'requested'], header);
  if (!btn) return { ok: false, error: 'No se encontró el botón Siguiendo.' };
  realClick(btn);
  const option = await waitFor(() => findButton(['dejar de seguir', 'unfollow', 'cancelar solicitud']), 6000);
  if (!option) return { ok: false, error: 'No apareció la opción «Dejar de seguir».' };
  realClick(option);
  // Algunas cuentas piden confirmar en un segundo diálogo.
  const confirm = await waitFor(() => document.querySelector('[role="dialog"]') && findButton(['dejar de seguir', 'unfollow']), 2500);
  if (confirm) realClick(confirm);
  const done = await waitFor(() => findButton(followLabels, header) && 'yes', 6000);
  return done ? { ok: true } : { ok: false, error: 'Instagram no registró que dejaste de seguir.' };
}

// ───────────────────────────── puente de mensajes ─────────────────────────────

type ExecMessage =
  | { type: 'DP_PING' }
  | { type: 'DP_SESSION' }
  | ({ type: 'DP_IG' } & IgRequest)
  | { type: 'DP_DOM_DM'; text: string }
  | { type: 'DP_DOM_VOICE'; durationMs: number }
  | { type: 'DP_DOM_STORY'; maxStories: number; react: boolean; viewSecs: number }
  | { type: 'DP_DOM_INBOX'; maxRows: number }
  | { type: 'DP_DOM_PROFILE'; username: string }
  | { type: 'DP_DOM_GRID'; scrolls: number }
  | { type: 'DP_DOM_LIKE' }
  | { type: 'DP_DOM_COMMENT'; text: string }
  | { type: 'DP_DOM_FOLLOW' }
  | { type: 'DP_DOM_UNFOLLOW' };

/** ¿Instagram muestra la página sin sesión ("Inicia sesión", "Continúa como…")? */
function sessionLost(): boolean {
  // La cookie ds_user_id se queda aunque Instagram cierre la sesión: se mira lo que muestra la página
  // (enlace "Entrar" a /accounts/login o el diálogo "Continúa como …").
  if (!cookie('ds_user_id') || document.documentElement.classList.contains('not-logged-in')) return true;
  if (document.querySelector('a[href^="/accounts/login"]')) return true;
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((d) => /Continúa como|Continue as/i.test(d.innerText));
}

/** Tu usuario: el enlace de la foto de perfil de la barra lateral ("Foto del perfil de …" → /usuario/). */
function ownUsername(): string | undefined {
  const img = [...document.querySelectorAll<HTMLImageElement>('a[href] img[alt]')].find((i) => /foto del perfil de|profile picture/i.test(i.alt));
  const href = img?.closest('a')?.getAttribute('href') ?? '';
  const fromLink = /^\/([A-Za-z0-9_.]+)\/$/.exec(href)?.[1];
  return fromLink ?? /"username":"([A-Za-z0-9_.]+)"/.exec(document.documentElement.innerHTML)?.[1];
}

async function handle(msg: ExecMessage): Promise<unknown> {
  // Antes de cualquier acción: si la sesión se cerró, no se intenta nada (el motor se pausará).
  if ((msg.type.startsWith('DP_DOM_') || msg.type === 'DP_IG') && sessionLost()) {
    return { ok: false, sessionLost: true, error: 'La sesión de Instagram se cerró en la ventana de trabajo.' };
  }
  switch (msg.type) {
    case 'DP_PING':
      return { ok: true, url: location.href };
    case 'DP_SESSION':
      return {
        ok: true,
        userId: cookie('ds_user_id'),
        loggedIn: !!cookie('ds_user_id'),
        username: ownUsername(),
      };
    case 'DP_IG':
      return igRequest(msg);
    case 'DP_DOM_DM':
      return domSendDm(msg.text);
    case 'DP_DOM_VOICE':
      return domSendVoice(msg.durationMs);
    case 'DP_DOM_STORY':
      return domViewStories(msg.maxStories, msg.react, msg.viewSecs);
    case 'DP_DOM_INBOX':
      return domReadInbox(msg.maxRows);
    case 'DP_DOM_PROFILE':
      return domReadProfile(msg.username);
    case 'DP_DOM_GRID':
      return domReadGrid(msg.scrolls);
    case 'DP_DOM_LIKE':
      return domLikePost();
    case 'DP_DOM_COMMENT':
      return domCommentPost(msg.text);
    case 'DP_DOM_FOLLOW':
      return domFollow();
    case 'DP_DOM_UNFOLLOW':
      return domUnfollow();
    default:
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string' || !message.type.startsWith('DP_')) return false;
  handle(message as ExecMessage)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true;
});
