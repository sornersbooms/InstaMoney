/**
 * Licencias de InstaMoney — conectadas al Panel Maestro de Alcanzia (api.alcanzia.co).
 *
 * - Prueba gratis de 3 días a cambio de correo + WhatsApp (POST /api/licenses/register).
 * - Activación con clave (GET /api/verify) atada a este equipo (deviceId).
 * - La respuesta del servidor va FIRMADA (ECDSA); aquí solo está la clave pública
 *   (licenseToken.ts), así que no sirve editar el almacenamiento ni falsear la respuesta.
 * - Sin internet solo vale el token firmado mientras siga vigente (máx. 72 h).
 *
 * Producto en el panel: `instagram-money` (el mismo que la app de escritorio).
 */
import { newNonce, verifyLicenseToken, type LicenseTokenPayload } from './licenseToken';

export const API_BASE = 'https://api.alcanzia.co/api';
export const PRODUCT_ID = 'instagram-money';
export const PRODUCT_NAME = 'InstaMoney';
export const SUPPORT_WHATSAPP = '573176116145';

const STORE_KEY = 'license_info';
const DEVICE_KEY = 'deviceId';

export interface StoredLicense {
  key: string;
  email: string;
  expiresAt: string;
  lastCheck: number;
  token: string;
}

export type LicenseState = 'active' | 'none' | 'expired' | 'invalid' | 'device_mismatch' | 'tampered';

export interface LicenseStatus {
  state: LicenseState;
  key?: string;
  email?: string;
  expiresAt?: string;
  daysLeft?: number;
  offline?: boolean;
  message?: string;
  /** No se pudo comprobar ahora (servidor saturado o caído, sin internet): se puede reintentar. */
  transient?: boolean;
}

// ───────────────────────────── equipo ─────────────────────────────

function canvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-ctx';
    canvas.width = 200;
    canvas.height = 50;
    ctx.textBaseline = 'alphabetic';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('INSTAMONEY', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('123456789', 4, 17);
    return canvas.toDataURL();
  } catch {
    return 'canvas-error';
  }
}

/** ID de equipo persistente (huella del navegador), guardado en chrome.storage.local. */
export async function getDeviceId(): Promise<string | null> {
  const cached = (await chrome.storage.local.get(DEVICE_KEY))[DEVICE_KEY] as string | undefined;
  if (cached && cached.startsWith('FP-')) return cached;
  // El service worker no tiene `document`: el ID lo crea siempre el panel.
  if (typeof document === 'undefined') return null;
  const raw = [
    navigator.userAgent,
    navigator.language,
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 'na'),
    canvasFingerprint(),
  ].join('||');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash &= hash;
  }
  const id = 'FP-' + Math.abs(hash).toString(36).toUpperCase();
  await chrome.storage.local.set({ [DEVICE_KEY]: id });
  return id;
}

// ───────────────────────────── almacenamiento firmado ─────────────────────────────

const fromToken = (p: LicenseTokenPayload, token: string): StoredLicense => ({ key: p.k, email: p.m, expiresAt: p.e, lastCheck: p.iat, token });

async function saveStored(lic: StoredLicense) {
  await chrome.storage.local.set({ [STORE_KEY]: lic });
}

async function loadStored(): Promise<{ lic: StoredLicense | null; payload: LicenseTokenPayload | null; tampered: boolean }> {
  const data = await chrome.storage.local.get([STORE_KEY, DEVICE_KEY]);
  const raw = data[STORE_KEY] as StoredLicense | undefined;
  if (!raw) return { lic: null, payload: null, tampered: false };
  const deviceId = data[DEVICE_KEY] as string | undefined;
  const payload = deviceId ? await verifyLicenseToken(raw.token, { extensionId: PRODUCT_ID, deviceId, allowExpired: true }) : null;
  if (!payload) return { lic: raw.key ? { ...raw, token: '' } : null, payload: null, tampered: !!raw.token };
  return { lic: fromToken(payload, raw.token), payload, tampered: false };
}

export async function clearLicense(): Promise<void> {
  await chrome.storage.local.remove(STORE_KEY);
}

export function onLicenseChanged(cb: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[STORE_KEY]) cb();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Días que quedan: la licencia vale hasta el final del día de vencimiento. */
export function daysUntil(expiresAt: string): number {
  const end = new Date(`${expiresAt}T23:59:59`).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

// ───────────────────────────── servidor ─────────────────────────────

interface VerifyResponse {
  valid: boolean;
  status?: string;
  expiresAt?: string;
  email?: string;
  message?: string;
  token?: string;
}

async function verifyRemote(key: string) {
  const deviceId = await getDeviceId();
  if (!deviceId) return { status: 0, data: null as VerifyResponse | null, payload: null as LicenseTokenPayload | null };
  const nonce = newNonce();
  try {
    const res = await fetch(`${API_BASE}/verify?key=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(deviceId)}&nonce=${nonce}`);
    const data = (await res.json().catch(() => null)) as VerifyResponse | null;
    const payload = data?.valid ? await verifyLicenseToken(data.token, { extensionId: PRODUCT_ID, deviceId, nonce }) : null;
    return { status: res.status, data, payload: payload && payload.k === key ? payload : null };
  } catch {
    return { status: 0, data: null, payload: null };
  }
}

/** Crea la prueba gratis de 3 días. Devuelve la clave generada. */
export async function registerTrial(email: string, phone: string): Promise<{ ok: boolean; key?: string; error?: string }> {
  const deviceId = await getDeviceId();
  try {
    const res = await fetch(`${API_BASE}/licenses/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, extensionId: PRODUCT_ID, deviceId }),
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean; key?: string; error?: string } | null;
    if (res.ok && data?.success && data.key) return { ok: true, key: data.key };
    return { ok: false, error: data?.error || 'No se pudo crear la prueba gratis.' };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor. Revisa tu internet.' };
  }
}

/** Activa una clave: la verifica con el servidor y guarda la licencia firmada. */
export async function activate(key: string): Promise<LicenseStatus> {
  const clean = key.trim().toUpperCase();
  if (!clean) return { state: 'invalid', message: 'Escribe tu clave de licencia.' };
  const res = await verifyRemote(clean);
  if (res.status === 0 || !res.data) return { state: 'invalid', message: 'Sin conexión con el servidor. Inténtalo de nuevo.' };
  if (res.payload) {
    const lic = fromToken(res.payload, res.data.token!);
    await saveStored(lic);
    return { state: 'active', key: lic.key, email: lic.email, expiresAt: lic.expiresAt, daysLeft: daysUntil(lic.expiresAt) };
  }
  if (res.data.valid) return { state: 'invalid', message: 'Esta clave no es de InstaMoney o la respuesta no es auténtica.' };
  if (res.status === 403) return { state: 'device_mismatch', message: 'Esta licencia ya está en uso en otro equipo.' };
  if (res.status === 404) return { state: 'invalid', message: 'No encontramos esa clave. Revísala.' };
  return { state: 'expired', message: res.data.message ? `Licencia no válida: ${res.data.message.toLowerCase()}.` : 'La licencia venció.' };
}

/** Al abrir el panel: valida la licencia guardada con el servidor (o, sin red, con el token firmado). */
/** Si la última comprobación es más reciente que esto, al abrir el panel no se consulta al servidor. */
const RECHECK_AFTER_MS = 6 * 3_600_000;

/**
 * ¿El servidor dijo CLARAMENTE que la licencia ya no vale? Solo entonces se saca al usuario.
 * Un 429 (límite de peticiones compartido por todas las apps), un 5xx o una respuesta sin token
 * verificable NO son un rechazo: se sigue con la licencia firmada guardada.
 */
function definitiveRejection(status: number, data: VerifyResponse | null): LicenseStatus['state'] | null {
  if (status === 403) return 'device_mismatch';
  if (status === 404) return 'invalid';
  if (status === 200 && data && data.valid === false) return 'expired';
  return null;
}

/** Al abrir el panel: valida la licencia guardada con el servidor (o, si no responde, con el token firmado). */
export async function checkLicense(opts: { force?: boolean } = {}): Promise<LicenseStatus> {
  const { lic, payload, tampered } = await loadStored();
  if (tampered) {
    await clearLicense();
    return { state: 'tampered', message: 'Los datos de la licencia se alteraron. Vuelve a activarla.' };
  }
  if (!lic) return { state: 'none' };

  const tokenValid = !!payload && payload.exp > Date.now() && payload.s === 'ACTIVE';
  const activeLocal = (offline: boolean): LicenseStatus => ({
    state: 'active',
    key: lic.key,
    email: lic.email,
    expiresAt: lic.expiresAt,
    daysLeft: daysUntil(lic.expiresAt),
    offline,
  });

  // Comprobación reciente y token vigente: no hace falta molestar al servidor.
  if (!opts.force && tokenValid && Date.now() - lic.lastCheck < RECHECK_AFTER_MS) return activeLocal(false);

  const res = await verifyRemote(lic.key);
  if (res.payload && res.data?.token) {
    const updated = fromToken(res.payload, res.data.token);
    await saveStored(updated);
    return { state: 'active', key: updated.key, email: updated.email, expiresAt: updated.expiresAt, daysLeft: daysUntil(updated.expiresAt) };
  }

  const rejected = definitiveRejection(res.status, res.data);
  if (rejected === 'device_mismatch') return { state: rejected, key: lic.key, email: lic.email, message: 'Esta licencia está en uso en otro equipo.' };
  if (rejected === 'invalid') return { state: rejected, key: lic.key, email: lic.email, message: 'Esta clave ya no existe en el panel.' };
  if (rejected === 'expired') {
    const why = (res.data?.message ?? '').toLowerCase();
    return {
      state: 'expired',
      key: lic.key,
      email: lic.email,
      expiresAt: lic.expiresAt,
      message: why.includes('expirada') || !why ? 'Tu licencia venció.' : `Tu licencia no está activa (${why}).`,
    };
  }

  // Fallo momentáneo (sin internet, servidor saturado o caído): vale la licencia firmada guardada.
  if (tokenValid) return activeLocal(true);
  return {
    state: 'expired',
    key: lic.key,
    email: lic.email,
    transient: true,
    message:
      res.status === 429
        ? 'El servidor de licencias está ocupado. Espera un minuto y pulsa «Reintentar».'
        : 'No pudimos comprobar tu licencia ahora mismo. Revisa tu internet y pulsa «Reintentar».',
  };
}

/**
 * Para el motor (service worker): 'active' si hay licencia válida (token firmado vigente o recién
 * renovado), 'unknown' si el servidor no respondió y el token ya caducó (el motor espera sin apagarse),
 * 'none' si no hay licencia o el servidor la rechazó.
 */
export async function licenseForEngine(): Promise<'active' | 'unknown' | 'none'> {
  const { lic, payload } = await loadStored();
  if (!lic) return 'none';
  if (payload && payload.exp > Date.now() && payload.s === 'ACTIVE') return 'active';
  const status = await checkLicense({ force: true });
  if (status.state === 'active') return 'active';
  return status.transient ? 'unknown' : 'none';
}

export function whatsappLink(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

export function renewalLink(email?: string): string {
  return whatsappLink(`Hola, quiero ${email ? 'renovar' : 'comprar'} mi licencia de ${PRODUCT_NAME}.${email ? ` Mi correo es ${email}.` : ''}`);
}
