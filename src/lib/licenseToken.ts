// Verificación de la licencia firmada por el servidor de Alcanzia (api.alcanzia.co).
// Solo contiene la clave PÚBLICA: permite comprobar la firma, nunca crearla. Por eso
// no sirve editar el almacenamiento local ni sustituir la respuesta de /api/verify.

export const LICENSE_PUBLIC_KEY =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAED2z+QqSYzkj2ySXDDpO6/D00bfrTSTbPUdCnT99qx8cosCsQkVYLQYXg7fHKiLYpzhSfoRZIm7npvyuuDcd7Eg=='

export interface LicenseTokenPayload {
  v: number
  /** clave de la licencia */
  k: string
  /** producto (extensionId) */
  x: string
  /** equipo (deviceId) */
  d: string
  /** estado: ACTIVE, EXPIRED… */
  s: string
  /** vence (YYYY-MM-DD) */
  e: string
  /** correo */
  m: string
  /** nonce enviado al pedirlo */
  n: string | null
  iat: number
  /** el token deja de valer (máx. 72 h después de emitirse) */
  exp: number
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

let keyPromise: Promise<CryptoKey> | null = null
const publicKey = () =>
  (keyPromise ??= crypto.subtle.importKey('spki', b64ToBytes(LICENSE_PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']))

export const newNonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Devuelve el contenido si la firma es auténtica y corresponde a este equipo, producto
 * (y nonce, si se indica); si no, null. Por defecto también exige que el token esté
 * vigente y la licencia ACTIVE; con `allowExpired` solo comprueba la autenticidad.
 */
export async function verifyLicenseToken(
  token: unknown,
  opts: { extensionId: string; deviceId: string; nonce?: string; allowExpired?: boolean },
): Promise<LicenseTokenPayload | null> {
  try {
    if (typeof token !== 'string' || !token.includes('.')) return null
    const [body, sig] = token.split('.')
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(), b64ToBytes(sig), new TextEncoder().encode(body))
    if (!ok) return null
    const p = JSON.parse(new TextDecoder().decode(b64ToBytes(body))) as LicenseTokenPayload
    if (p.v !== 1 || p.x !== opts.extensionId || p.d !== opts.deviceId) return null
    if (opts.nonce !== undefined && p.n !== opts.nonce) return null
    if (!opts.allowExpired && (p.exp <= Date.now() || p.s !== 'ACTIVE')) return null
    return p
  } catch {
    return null
  }
}
