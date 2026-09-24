import { useState } from 'react';
import { brand } from '../lib/brand.js';

export function LicenseScreen({ initialMessage, onActivated }) {
  const [mode, setMode] = useState('key');
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialMessage ?? '');

  async function handleActivate() {
    if (!key.trim()) {
      setError('Escribe tu clave de licencia.');
      return;
    }
    setError('');
    setBusy(true);
    const result = await window.api.license.activate(key);
    setBusy(false);
    if (result.ok) onActivated(result.license);
    else setError(result.message);
  }

  async function handleTrial() {
    setError('');
    setBusy(true);
    const result = await window.api.license.trial({ email: email.trim(), phone: phone.trim() });
    setBusy(false);
    if (result.ok) onActivated(result.license);
    else setError(result.message);
  }

  function openWhatsApp() {
    const text = encodeURIComponent(`Hola, quiero comprar una licencia de ${brand.productName}.`);
    window.api.openExternal(`https://wa.me/${brand.whatsapp}?text=${text}`);
  }

  return (
    <div className="license-screen">
      <div className="license-card">
        <div className="logo" style={{ fontSize: 30 }}>
          <span className="logo-dot" />
          {brand.productName}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
          {brand.tagline}
        </p>

        <div className="tabs" style={{ padding: 0, border: 'none' }}>
          <button className={mode === 'key' ? 'active' : ''} onClick={() => setMode('key')}>
            Tengo licencia
          </button>
          <button className={mode === 'trial' ? 'active' : ''} onClick={() => setMode('trial')}>
            Prueba gratis
          </button>
        </div>

        {mode === 'key' ? (
          <>
            <div className="field">
              <label>Clave de licencia</label>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
                placeholder="XXXX-XXXX-XXXX"
                autoFocus
              />
            </div>
            <button className="btn btn-primary" onClick={handleActivate} disabled={busy}>
              {busy ? <span className="spin">◌</span> : '🔓'} Activar
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label>Tu correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Tu WhatsApp</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTrial()}
                placeholder="+57 300 000 0000"
              />
            </div>
            <button className="btn btn-ai" onClick={handleTrial} disabled={busy}>
              {busy ? <span className="spin">◌</span> : '🎁'} Empezar prueba de 3 días
            </button>
            <span className="muted">Una sola prueba por equipo.</span>
          </>
        )}

        {error && <div className="license-error">{error}</div>}

        <div className="divider" />
        <button className="btn" onClick={openWhatsApp}>
          💬 Comprar licencia por WhatsApp
        </button>
      </div>
    </div>
  );
}
