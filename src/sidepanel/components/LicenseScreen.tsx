import { useState, type FormEvent } from 'react';
import { activate, checkLicense, registerTrial, renewalLink, whatsappLink, type LicenseStatus } from '@/lib/license';
import { Callout, Icon, Segmented } from '../ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Logo() {
  return (
    <div className="auth-logo">
      <svg width="30" height="30" viewBox="25 22 78 82" aria-hidden="true">
        <path d="M64 26c-22 0-39 15-39 34 0 10 5 19 13 25l-3 15c-.4 2 1.6 3.4 3.3 2.4L52 94c4 1 8 1.5 12 1.5 22 0 39-15 39-34.5S86 26 64 26z" fill="#fff" />
        <text x="64" y="82" textAnchor="middle" fontFamily="Arial Black, Segoe UI, Arial" fontWeight="900" fontSize="54" fill="#c93fc9">
          $
        </text>
      </svg>
    </div>
  );
}

/** Pantalla mientras se comprueba la licencia al abrir el panel. */
export function LicenseSplash() {
  return (
    <div className="auth">
      <div className="auth-card" style={{ alignItems: 'center', padding: '30px 22px' }}>
        <Logo />
        <span className="spinner dark" />
        <span className="muted">Verificando tu licencia…</span>
      </div>
    </div>
  );
}

type Mode = 'trial' | 'key';

/**
 * Acceso a InstaMoney: prueba gratis de 3 días (correo + WhatsApp) o activar una licencia.
 * Se muestra al abrir el panel cuando no hay una licencia activa.
 */
export function LicenseScreen({ status, onActivated }: { status: LicenseStatus; onActivated: (s: LicenseStatus) => void }) {
  const transient = !!status.transient;
  const expired = !transient && (status.state === 'expired' || status.state === 'device_mismatch');
  const [mode, setMode] = useState<Mode>(expired || transient || status.state === 'tampered' ? 'key' : 'trial');
  const [email, setEmail] = useState(status.email ?? '');
  const [phone, setPhone] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(status.state === 'none' ? '' : (status.message ?? ''));

  async function startTrial(e: FormEvent) {
    e.preventDefault();
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    const digits = phone.replace(/\D/g, '');
    if (!EMAIL_RE.test(cleanEmail)) return setError('Escribe un correo válido.');
    if (digits.length < 10) return setError('Escribe tu WhatsApp completo, con indicativo (ej. 57 300 123 4567).');
    setBusy(true);
    const reg = await registerTrial(cleanEmail, `+${digits}`);
    if (!reg.ok || !reg.key) {
      setBusy(false);
      return setError(reg.error ?? 'No se pudo crear la prueba.');
    }
    const res = await activate(reg.key);
    setBusy(false);
    if (res.state === 'active') onActivated(res);
    else setError(res.message ?? 'No se pudo activar la prueba.');
  }

  async function retry() {
    setError('');
    setBusy(true);
    const res = await checkLicense({ force: true });
    setBusy(false);
    if (res.state === 'active') onActivated(res);
    else setError(res.message ?? 'No se pudo comprobar la licencia.');
  }

  async function activateKey(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await activate(key);
    setBusy(false);
    if (res.state === 'active') onActivated(res);
    else setError(res.message ?? 'No se pudo activar la licencia.');
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-head">
          <Logo />
          <h1>InstaMoney</h1>
          <p>
            {transient
              ? 'No pudimos comprobar tu licencia en este momento.'
              : expired
                ? 'Tu acceso terminó. Renueva para seguir prospectando.'
                : 'Prospección inteligente en Instagram'}
          </p>
        </div>

        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
          }}
          options={[
            { value: 'trial', label: '3 días gratis', icon: 'gift' },
            { value: 'key', label: 'Tengo licencia', icon: 'key' },
          ]}
        />

        {mode === 'trial' ? (
          <form className="stack" style={{ gap: 10 }} onSubmit={startTrial}>
            <div className="auth-field">
              <Icon name="mail" size={16} />
              <input className="input" type="email" autoComplete="email" placeholder="Tu correo" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </div>
            <div className="auth-field">
              <Icon name="phone" size={16} />
              <input className="input" type="tel" autoComplete="tel" placeholder="Tu WhatsApp (ej. +57 300 123 4567)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <button className="btn brand lg block" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : <Icon name="sparkles" size={16} />}
              {busy ? 'Creando tu prueba…' : 'Empezar mis 3 días gratis'}
            </button>
            <div className="auth-perks">
              <span><Icon name="check" size={12} stroke={3} /> Sin tarjeta</span>
              <span><Icon name="check" size={12} stroke={3} /> Todo incluido</span>
              <span><Icon name="check" size={12} stroke={3} /> Clave al correo</span>
            </div>
          </form>
        ) : (
          <form className="stack" style={{ gap: 10 }} onSubmit={activateKey}>
            <div className="auth-field">
              <Icon name="key" size={16} />
              <input className="input mono" placeholder="Tu clave de licencia" value={key} onChange={(e) => setKey(e.target.value)} autoFocus spellCheck={false} />
            </div>
            <button className="btn primary lg block" type="submit" disabled={busy || !key.trim()}>
              {busy ? <span className="spinner" /> : <Icon name="lock" size={16} />}
              {busy ? 'Verificando…' : 'Activar licencia'}
            </button>
            <a className="btn soft block" href={renewalLink(status.email)} target="_blank" rel="noreferrer">
              <Icon name="message" size={15} /> {expired ? 'Renovar por WhatsApp' : 'Comprar licencia por WhatsApp'}
            </a>
          </form>
        )}

        {error && <Callout tone={transient ? 'warning' : 'danger'}>{error}</Callout>}

        {transient && (
          <button className="btn primary lg block" onClick={retry} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="refresh" size={16} />}
            {busy ? 'Comprobando…' : 'Reintentar'}
          </button>
        )}

        <div className="auth-foot">
          ¿Necesitas ayuda?{' '}
          <a href={whatsappLink('Hola, necesito ayuda con InstaMoney.')} target="_blank" rel="noreferrer">
            Escríbenos por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
