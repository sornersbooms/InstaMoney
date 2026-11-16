import { useState } from 'react';
import { Badge, bg, Switch, useToast } from '../ui';
import { engineStatus, useAutomationSettings, useEngine, useNow } from '../hooks';

/** Activa/desactiva el motor comprobando antes que haya sesión de Instagram. */
export function useEngineToggle() {
  const engine = useEngine();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      if (!engine.enabled) {
        const res = await bg<{ ok: boolean; loggedIn?: boolean; error?: string }>({ type: 'DP_BG_SESSION' });
        if (!res.ok || !res.loggedIn) {
          toast(res.error ?? 'Inicia sesión en Instagram en la ventana que se abrió y vuelve a intentarlo.', true);
          return;
        }
      }
      await bg({ type: 'DP_BG_ENGINE', enabled: !engine.enabled });
      toast(engine.enabled ? 'Motor apagado' : 'Motor encendido');
    } finally {
      setBusy(false);
    }
  }
  return { engine, toggle, busy };
}

/** Cabecera fija: marca + estado del motor + interruptor. */
export function TopBar() {
  const { engine, toggle, busy } = useEngineToggle();
  const settings = useAutomationSettings();
  const now = useNow();
  const st = engineStatus(engine, settings, now);
  const tone = st.mode === 'off' ? undefined : st.mode === 'paused' || st.mode === 'offhours' ? 'warning' : 'success';
  return (
    <header className="topbar">
      <div className="logo">
        {/* Mismo dibujo que public/icons/logo.svg: burbuja de mensaje con "$". */}
        <svg width="20" height="20" viewBox="25 22 78 82" aria-hidden="true">
          <path d="M64 26c-22 0-39 15-39 34 0 10 5 19 13 25l-3 15c-.4 2 1.6 3.4 3.3 2.4L52 94c4 1 8 1.5 12 1.5 22 0 39-15 39-34.5S86 26 64 26z" fill="#fff" />
          <text x="64" y="82" textAnchor="middle" fontFamily="Arial Black, Segoe UI, Arial" fontWeight="900" fontSize="54" fill="#c93fc9">$</text>
        </svg>
      </div>
      <div className="topbar-title">
        <b>InstaMoney</b>
        <span>Prospección en Instagram</span>
      </div>
      <Badge tone={tone} pulse={st.mode === 'working' || st.mode === 'waiting'}>
        {st.mode === 'off' ? 'Apagado' : st.mode === 'paused' ? 'En pausa' : st.mode === 'offhours' ? 'Fuera de horario' : 'Activo'}
      </Badge>
      <div style={{ opacity: busy ? 0.5 : 1 }}>
        <Switch checked={engine.enabled} onChange={() => !busy && toggle()} label="Encender o apagar el motor" />
      </div>
    </header>
  );
}
