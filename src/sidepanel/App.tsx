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

export function App() {
  const [route, setRoute] = useState<Route>(() => {
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
            {route.page === 'home' && <Home />}
            {route.page === 'campaigns' && <Campaigns startNew={route.param === 'new'} />}
            {route.page === 'leads' && <LeadList initialStage={route.param} />}
            {route.page === 'inbox' && <Inbox />}
            {route.page === 'more' && <MorePage />}
            {route.page === 'auto' && <AutomationsPanel />}
            {route.page === 'templates' && <Templates />}
            {route.page === 'activity' && <ActivityLog />}
            {route.page === 'settings' && <SettingsPanel />}
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
