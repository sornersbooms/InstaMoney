const crypto = require('node:crypto');
const os = require('node:os');
const store = require('./store');
const brand = require('./active-brand.json');

const API_BASE = process.env.ALCANZIA_API_BASE || 'https://api.alcanzia.co/api';
const PRODUCT_ID = brand.productId;
const PRODUCT_NAME = brand.productName;

// Margen para seguir trabajando si el servidor de licencias no responde (corte de internet,
// mantenimiento). Pasado ese plazo sin poder validar, la app pide licencia otra vez.
const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Identificador estable del equipo. El panel lo usa para atar una licencia a un dispositivo
 * y para impedir que el mismo equipo genere varias pruebas gratis.
 */
function deviceId() {
  const saved = store.get('deviceId');
  if (saved) return saved;
  const cpu = os.cpus()[0]?.model ?? 'cpu';
  const raw = [os.hostname(), os.platform(), os.arch(), cpu, os.totalmem()].join('|');
  const id = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  store.set('deviceId', id);
  return id;
}

function daysLeft(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function decorate(license) {
  if (!license) return null;
  return { ...license, daysLeft: daysLeft(license.expiresAt), isTrial: String(license.key).startsWith('TRIAL-') };
}

async function verify(key) {
  const url = `${API_BASE}/verify?key=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(deviceId())}`;
  let response;
  try {
    response = await fetch(url);
  } catch {
    return { ok: false, offline: true, message: 'Sin conexión con el servidor de licencias.' };
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    return { ok: false, message: `Respuesta inesperada del servidor (${response.status}).` };
  }

  if (data.valid) {
    const license = {
      key,
      status: data.status,
      expiresAt: data.expiresAt,
      email: data.email,
      verifiedAt: Date.now(),
    };
    store.set('license', license);
    return { ok: true, license: decorate(license) };
  }

  return { ok: false, message: data.message || `No se pudo validar la licencia (${response.status}).` };
}

async function registerTrial({ email, phone }) {
  if (!email || !phone) return { ok: false, message: 'Necesitas indicar tu correo y tu WhatsApp.' };
  let response;
  try {
    response = await fetch(`${API_BASE}/licenses/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        phone,
        extensionId: PRODUCT_ID,
        extensionName: PRODUCT_NAME,
        deviceId: deviceId(),
      }),
    });
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor de licencias.' };
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    return { ok: false, message: `Respuesta inesperada del servidor (${response.status}).` };
  }

  if (!response.ok || !data.key) {
    return { ok: false, message: data.error || 'No se pudo crear la prueba gratuita.' };
  }
  return verify(data.key);
}

/** Estado al arrancar: 'none' (pedir licencia), 'valid' o 'invalid'. */
async function check() {
  const saved = store.get('license');
  if (!saved?.key) return { state: 'none' };

  const result = await verify(saved.key);
  if (result.ok) return { state: 'valid', license: result.license };

  if (result.offline) {
    const age = Date.now() - (saved.verifiedAt ?? 0);
    if (age < OFFLINE_GRACE_MS) {
      return { state: 'valid', license: decorate(saved), offline: true };
    }
    return {
      state: 'invalid',
      message: 'Llevas varios días sin conexión al servidor de licencias. Conéctate para volver a validarla.',
    };
  }

  store.set('license', null);
  return { state: 'invalid', message: result.message };
}

/** Marca la licencia como conectada, para que se vea "en línea" en el panel. */
async function heartbeat() {
  const saved = store.get('license');
  if (!saved?.key) return;
  try {
    await fetch(`${API_BASE}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: saved.key }),
    });
  } catch {
    // Sin conexión: se reintenta en el siguiente latido.
  }
}

function signOut() {
  store.set('license', null);
}

function current() {
  return decorate(store.get('license'));
}

module.exports = { check, verify, registerTrial, heartbeat, signOut, current, deviceId, PRODUCT_ID, PRODUCT_NAME };
