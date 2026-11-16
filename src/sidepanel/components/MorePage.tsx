import { Icon, PageHead, type IconName } from '../ui';
import { useNav, type Page } from '../hooks';

const ITEMS: Array<{ page: Page; icon: IconName; title: string; desc: string; color: string; bg: string }> = [
  { page: 'auto', icon: 'zap', title: 'Automatizaciones', desc: 'Bienvenida a nuevos seguidores y DM por palabra clave', color: 'var(--primary-text)', bg: 'var(--primary-soft)' },
  { page: 'templates', icon: 'file', title: 'Plantillas y audios', desc: 'Mensajes reutilizables y notas de voz', color: 'var(--info)', bg: 'var(--info-soft)' },
  { page: 'activity', icon: 'activity', title: 'Actividad', desc: 'Historial de todo lo que hizo el motor', color: 'var(--success)', bg: 'var(--success-soft)' },
  { page: 'settings', icon: 'sliders', title: 'Ajustes', desc: 'IA, ritmo y límites, horario e integraciones', color: 'var(--warning)', bg: 'var(--warning-soft)' },
];

export function MorePage() {
  const nav = useNav();
  return (
    <>
      <PageHead title="Más" subtitle="Herramientas y configuración" />
      <div className="list">
        {ITEMS.map((it) => (
          <button key={it.page} className="list-item" onClick={() => nav({ page: it.page })}>
            <div className="li-icon" style={{ background: it.bg, color: it.color }}>
              <Icon name={it.icon} size={17} />
            </div>
            <div className="li-main">
              <b>{it.title}</b>
              <span>{it.desc}</span>
            </div>
            <Icon name="chevronRight" size={16} />
          </button>
        ))}
      </div>
      <div className="muted" style={{ textAlign: 'center', marginTop: 8 }}>
        InstaMoney v{chrome.runtime?.getManifest?.().version ?? ''}
      </div>
    </>
  );
}
