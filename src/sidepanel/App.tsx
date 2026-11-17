import { useEffect, useState } from 'react';
import { TopBar } from './components/EngineBar';
import { Home } from './components/Home';
import { Campaigns } from './components/Campaigns';
import { LeadList } from './components/LeadList';
import { Inbox } from './components/Inbox';
import { MorePage } from './components/MorePage';
import { AutomationsPanel } from './components/AutomationsPanel';
import { Templates } from './components/Templates';
import { ActivityLog } from './components/ActivityLog';
import { SettingsPanel } from './components/SettingsPanel';
import { LicenseScreen, LicenseSplash } from './components/LicenseScreen';
import { checkLicense, onLicenseChanged, renewalLink, type LicenseStatus } from '@/lib/license';
import { Icon, ToastProvider, type IconName } from './ui';
import { NavCtx, useCampaigns, type Page, type Route } from './hooks';

const NAV: Array<{ page: Page; label: string; icon: IconName; group: Page[] }> = [
  { page: 'home', label: 'Inicio', icon: 'home', group: ['home'] },
  { page: 'campaigns', label: 'Campañas', icon: 'rocket', group: ['campaigns'] },
  { page: 'leads', label: 'Leads', icon: 'users', group: ['leads'] },
  { page: 'inbox', label: 'Bandeja', icon: 'inbox', group: ['inbox'] },
  { page: 'more', label: 'Más', icon: 'grid', group: ['more', 'auto', 'templates', 'activity', 'settings'] },
];

const ROUTE_KEY = 'dp-route';

/** Puerta de acceso: sin licencia activa solo se ve la pantalla de prueba gratis / activación. */
export function App() {
  const [license, setLicense] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    checkLicense().then(setLicense);
    // Si se borra la licencia (Ajustes → Cambiar licencia) vuelve a pedirla.
    return onLicenseChanged(() => checkLicense().then(setLicense));
  }, []);

  // Solo en desarrollo (npm run dev / vista previa): ?demo salta la licencia para hacer capturas.
  // En la versión compilada import.meta.env.DEV es false y este bloque se elimina.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
    return <MainApp license={{ state: 'active', email: 'demo@instamoney.co', expiresAt: '2027-12-31', daysLeft: 30 }} />;
  }
  if (!license) return <LicenseSplash />;
  if (license.state !== 'active') return <LicenseScreen status={license} onActivated={setLicense} />;
  return <MainApp license={license} />;
}

function RenewalBanner({ license }: { license: LicenseStatus }) {
  const [hidden, setHidden] = useState(() => sessionStorage.getItem('dp-renew-hidden') === '1');
  if (hidden || license.daysLeft == null || license.daysLeft > 3) return null;
  const text = license.daysLeft <= 0 ? 'Tu licencia vence hoy' : `Tu licencia vence en ${license.daysLeft} día${license.daysLeft === 1 ? '' : 's'}`;
  return (
    <div className="callout warning" style={{ alignItems: 'center' }}>
      <Icon name="clock" size={16} />
      <span className="grow">
        <b>{text}.</b>{' '}
        <a href={renewalLink(license.email)} target="_blank" rel="noreferrer">Renovar por WhatsApp</a>
      </span>
      <button className="btn ghost sm icon" title="Cerrar" onClick={() => { sessionStorage.setItem('dp-renew-hidden', '1'); setHidden(true); }}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function MainApp({ license }: { license: LicenseStatus }) {
  const [route, setRoute] = useState<Route>(() => {
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(location.search);
      if (q.get('page')) return { page: q.get('page') as Page, param: q.get('param') ?? undefined };
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(ROUTE_KEY) ?? 'null') as Route | null;
      return saved && !saved.param ? saved : { page: 'home' };
    } catch {
      return { page: 'home' };
    }
  });
  const campaigns = useCampaigns();
  const running = campaigns.filter((c) => c.status === 'running').length;

  useEffect(() => {
    try {
      sessionStorage.setItem(ROUTE_KEY, JSON.stringify({ page: route.page }));
    } catch {
      /* sin almacenamiento */
    }
    window.scrollTo({ top: 0 });
  }, [route]);

  return (
    <ToastProvider>
      <NavCtx.Provider value={setRoute}>
        <div className="app">
          <TopBar />
          <main className="content" key={`${route.page}-${route.param ?? ''}`}>
            <RenewalBanner license={license} />
            {route.page === 'home' && <Home />}
            {route.page === 'campaigns' && <Campaigns startNew={route.param === 'new'} />}
            {route.page === 'leads' && <LeadList initialStage={route.param} />}
            {route.page === 'inbox' && <Inbox />}
            {route.page === 'more' && <MorePage />}
            {route.page === 'auto' && <AutomationsPanel />}
            {route.page === 'templates' && <Templates />}
            {route.page === 'activity' && <ActivityLog />}
            {route.page === 'settings' && <SettingsPanel license={license} />}
          </main>
          <nav className="bottomnav" aria-label="Navegación principal">
            {NAV.map((n) => (
              <button key={n.page} className={`navbtn${n.group.includes(route.page) ? ' active' : ''}`} onClick={() => setRoute({ page: n.page })}>
                <Icon name={n.icon} size={20} />
                {n.label}
                {n.page === 'campaigns' && running > 0 && <span className="dot" style={{ background: 'var(--success)' }}>{running}</span>}
              </button>
            ))}
          </nav>
        </div>
      </NavCtx.Provider>
    </ToastProvider>
  );
}
