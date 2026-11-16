/**
 * Ventana de trabajo: una ventana de Chrome con Instagram abierto donde el motor ejecuta sus acciones.
 * Va en una ventana aparte (sin foco) para no secuestrar la pestaña en la que el usuario navega.
 * Conviene dejarla abierta y sin minimizar: minimizada, Chrome frena los temporizadores de la página.
 *
 * Todo lo que usa la pestaña pasa por un turno (`withWorker`): así una lectura de la bandeja no
 * navega a otra página mientras se está leyendo un perfil (antes eso dejaba la pestaña "sin responder").
 */

const WORKER_KEY = 'workerTabId';
/**
 * Tamaño de escritorio: con menos de ~1000 px de ancho Instagram muestra su versión móvil, que tiene
 * otra estructura (p. ej. la caja de comentario no aparece hasta pulsar el icono).
 */
const WORKER_WIDTH = 1280;
const WORKER_HEIGHT = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Instagram pide verificación o limitó la cuenta: el motor debe pausarse. */
export class IgBlockError extends Error {}

// ───────────────────────────── turno de uso de la pestaña ─────────────────────────────

let queue: Promise<unknown> = Promise.resolve();

/** Ejecuta `fn` con la pestaña de trabajo en exclusiva. `fn` solo debe usar las funciones internas (sin turno). */
function withWorker<T>(fn: () => Promise<T>): Promise<T> {
  // Si una tarea se colgara, a los 3 min se libera el turno para no bloquear el motor.
  const guarded = () =>
    Promise.race([fn(), new Promise<T>((_, reject) => setTimeout(() => reject(new Error('La ventana de trabajo tardó demasiado en responder.')), 180_000))]);
  const run = queue.then(guarded);
  queue = run.catch(() => undefined);
  return run;
}

// ───────────────────────────── pestaña ─────────────────────────────

async function tabAlive(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return !!tab.id && !!tab.url && /^https:\/\/(www\.)?instagram\.com\//.test(tab.url);
  } catch {
    return false;
  }
}

async function ping(tabId: number): Promise<boolean> {
  try {
    const res = (await chrome.tabs.sendMessage(tabId, { type: 'DP_PING' })) as { ok?: boolean } | undefined;
    return !!res?.ok;
  } catch {
    return false;
  }
}

/** Espera a que la pestaña empiece a navegar (si se indica) y luego a que termine de cargar. */
function waitForLoad(tabId: number, expectNavigation: boolean, timeoutMs = 40000): Promise<void> {
  return new Promise((resolve) => {
    let started = !expectNavigation;
    const timer = setTimeout(done, timeoutMs);
    const startTimer = expectNavigation ? setTimeout(() => (started = true), 6000) : undefined;
    function done() {
      clearTimeout(timer);
      if (startTimer) clearTimeout(startTimer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    function listener(id: number, info: chrome.tabs.TabChangeInfo) {
      if (id !== tabId) return;
      if (info.status === 'loading' || info.url) started = true;
      if (started && info.status === 'complete') done();
    }
    chrome.tabs.onUpdated.addListener(listener);
    if (!expectNavigation) chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done()).catch(done);
  });
}

/** Explica en qué página se quedó la pestaña cuando no responde. */
async function describeStuckTab(tabId: number): Promise<Error> {
  let url = '';
  try {
    const tab = await chrome.tabs.get(tabId);
    url = tab.url ?? tab.pendingUrl ?? '';
    if (tab.discarded) return new Error('Chrome suspendió la ventana de trabajo para ahorrar memoria. Se reintentará en el próximo turno.');
  } catch {
    return new Error('Se cerró la ventana de trabajo de Instagram. Se abrirá otra en el próximo turno.');
  }
  if (/\/accounts\/login/.test(url)) return new Error('La sesión de Instagram está cerrada: inicia sesión en la ventana de trabajo.');
  if (/\/challenge\/|\/accounts\/suspended|\/checkpoint/.test(url)) return new IgBlockError('Instagram pide verificar la cuenta (checkpoint). Ábrela en la ventana de trabajo y complétalo.');
  if (!/^https:\/\/(www\.)?instagram\.com\//.test(url)) return new Error(`La ventana de trabajo quedó fuera de Instagram (${url || 'página vacía'}).`);
  return new Error(`La página de Instagram no terminó de cargar (${url.replace('https://www.instagram.com', '')}). Se reintentará.`);
}

/**
 * Comprueba que el script de la extensión está activo en la página; si Chrome no lo cargó
 * (pestaña suspendida, extensión recargada…), lo inyecta a mano.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  for (let i = 0; i < 10; i++) {
    if (await ping(tabId)) return;
    await sleep(800);
  }
  try {
    const files = chrome.runtime.getManifest().content_scripts?.[0]?.js ?? [];
    if (files.length) await chrome.scripting.executeScript({ target: { tabId }, files });
  } catch {
    /* página no inyectable (error de Chrome, fuera de Instagram…) */
  }
  for (let i = 0; i < 15; i++) {
    if (await ping(tabId)) return;
    await sleep(1000);
  }
  throw await describeStuckTab(tabId);
}

/** Si la ventana de trabajo quedó estrecha (versión móvil de Instagram), la ensancha y recarga. */
async function ensureDesktopSize(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const win = await chrome.windows.get(tab.windowId);
    if (win.state === 'minimized' || (win.width ?? 0) < 1000) {
      await chrome.windows.update(tab.windowId, { state: 'normal', width: WORKER_WIDTH, height: WORKER_HEIGHT });
      await chrome.tabs.reload(tabId);
      await waitForLoad(tabId, true);
    }
  } catch {
    /* ventana sin acceso: se sigue igual */
  }
}

async function openWorkerWindow(): Promise<number> {
  const win = await chrome.windows.create({ url: 'https://www.instagram.com/', focused: false, width: WORKER_WIDTH, height: WORKER_HEIGHT, type: 'normal' });
  const tabId = win?.tabs?.[0]?.id;
  if (!tabId) throw new Error('No se pudo abrir la ventana de trabajo de Instagram.');
  await chrome.storage.session.set({ [WORKER_KEY]: tabId });
  return tabId;
}

/** Pestaña lista (abierta, con Instagram cargado y el script respondiendo). Sin turno: uso interno. */
async function readyTab(): Promise<number> {
  const stored = (await chrome.storage.session.get(WORKER_KEY))[WORKER_KEY] as number | undefined;
  let tabId = stored && (await tabAlive(stored)) ? stored : undefined;
  if (!tabId) {
    tabId = await openWorkerWindow();
    await waitForLoad(tabId, false);
  }
  // Que Chrome no la suspenda por ahorro de memoria.
  chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => undefined);
  await ensureDesktopSize(tabId);
  await ensureContentScript(tabId);
  return tabId;
}

async function navigate(url: string): Promise<number> {
  const tabId = await readyTab();
  await chrome.tabs.update(tabId, { url });
  await waitForLoad(tabId, true);
  await ensureContentScript(tabId);
  return tabId;
}

async function send<T>(tabId: number, message: Record<string, unknown>): Promise<T> {
  let res: unknown;
  try {
    res = await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // La página cambió en mitad del mensaje: un reintento tras comprobar el script.
    await ensureContentScript(tabId);
    res = await chrome.tabs.sendMessage(tabId, message);
  }
  if ((res as { sessionLost?: boolean } | undefined)?.sessionLost) {
    // Pausa el motor (no seguir intentando acciones sin sesión).
    throw new IgBlockError('Instagram cerró la sesión en la ventana de trabajo. Inicia sesión de nuevo en esa ventana y pulsa «Reanudar ya».');
  }
  return res as T;
}

// ───────────────────────────── API pública (con turno) ─────────────────────────────

export function getWorkerTab(): Promise<number> {
  return withWorker(readyTab);
}

/** Envía un mensaje a la página que esté abierta (peticiones a la API con la sesión). */
export function sendToWorker<T = unknown>(message: Record<string, unknown>): Promise<T> {
  return withWorker(async () => send<T>(await readyTab(), message));
}

/** Abre `url` en la pestaña de trabajo y le envía `message`, sin que nada se cuele entre medias. */
export function runOnPage<T = unknown>(url: string, message: Record<string, unknown>, before?: (tabId: number) => Promise<void>): Promise<T> {
  return withWorker(async () => {
    const tabId = await navigate(url);
    if (before) await before(tabId);
    return send<T>(tabId, message);
  });
}


/**
 * Prepara la nota de voz: sustituye getUserMedia en la página (mundo MAIN) para que, la próxima vez
 * que Instagram pida el micrófono, reciba el audio pregrabado en lugar del micrófono real.
 */
export async function primeVoiceNote(tabId: number, dataUrl: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [dataUrl],
    func: (audioDataUrl: string) => {
      const w = window as unknown as { __dpOrigGUM?: typeof navigator.mediaDevices.getUserMedia; __dpVoice?: string | null };
      if (!w.__dpOrigGUM) w.__dpOrigGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      w.__dpVoice = audioDataUrl;
      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const pending = w.__dpVoice;
        if (!constraints?.audio || !pending) return w.__dpOrigGUM!(constraints);
        w.__dpVoice = null;
        const base64 = pending.slice(pending.indexOf(',') + 1);
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const ctx = new AudioContext();
        await ctx.resume().catch(() => undefined);
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const dest = ctx.createMediaStreamDestination();
        source.connect(dest);
        source.start(ctx.currentTime + 0.15);
        return dest.stream;
      };
    },
  });
}
