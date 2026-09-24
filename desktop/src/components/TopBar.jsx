import { useEffect, useState } from 'react';
import { brand } from '../lib/brand.js';

const CAPTURABLE = {
  followers: 'seguidores',
  following: 'seguidos',
  likes: 'likes',
  comments: 'comentaristas',
  hashtag: 'autores',
};

const CONTEXT_LABELS = {
  profile: 'Perfil',
  direct: 'Mensajes',
  none: 'Instagram',
};

export function TopBar({ context, onCaptured }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    window.api.instagram.getUrl().then(setUrl);
    return window.api.instagram.onNavigated(setUrl);
  }, []);

  async function handleCapture() {
    setCapturing(true);
    setStatus('Capturando...');
    const result = await window.api.instagram.capture();
    setCapturing(false);
    setStatus(result.error ?? `+${result.added} nuevos · ${result.skipped} repetidos`);
    if (!result.error) onCaptured();
    setTimeout(() => setStatus(''), 6000);
  }

  const capturable = CAPTURABLE[context.kind];

  return (
    <header className="topbar">
      <div className="logo">
        <span className="logo-dot" />
        {brand.productName}
      </div>

      <button className="btn btn-icon" onClick={() => window.api.instagram.back()} title="Atrás">
        ←
      </button>
      <button className="btn btn-icon" onClick={() => window.api.instagram.reload()} title="Recargar">
        ↻
      </button>
      <button className="btn btn-icon" onClick={() => window.api.instagram.navigate('https://www.instagram.com/')} title="Inicio">
        ⌂
      </button>

      <div className="url-bar">
        <span>{url || 'cargando...'}</span>
      </div>

      <span className={`badge ${capturable ? '' : 'off'}`}>
        {capturable ? `● ${capturable} en pantalla` : CONTEXT_LABELS[context.kind] ?? 'Instagram'}
      </span>

      {status && <span className="muted">{status}</span>}

      <button className="btn btn-primary" onClick={handleCapture} disabled={!capturable || capturing}>
        {capturing ? <span className="spin">◌</span> : '📥'} Capturar
      </button>
    </header>
  );
}
