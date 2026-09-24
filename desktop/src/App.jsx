import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './components/TopBar.jsx';
import { BrowserSlot } from './components/BrowserSlot.jsx';
import { LeadList } from './components/LeadList.jsx';
import { Templates } from './components/Templates.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { StatsBar } from './components/StatsBar.jsx';
import { LicenseScreen } from './components/LicenseScreen.jsx';
import { RenewalBanner } from './components/RenewalBanner.jsx';
import { brand } from './lib/brand.js';

const TABS = [
  ['leads', 'Leads'],
  ['templates', 'Plantillas'],
  ['settings', 'Ajustes'],
];

export function App() {
  const [licenseState, setLicenseState] = useState(null);
  const [tab, setTab] = useState('leads');
  const [state, setState] = useState(null);
  const [context, setContext] = useState({ kind: 'none', label: '' });
  const lastEnrichedUrl = useRef('');

  const reload = useCallback(async () => {
    setState(await window.api.data.getAll());
  }, []);

  useEffect(() => {
    window.api.license.check().then(setLicenseState);
  }, []);

  const licensed = licenseState?.state === 'valid';

  useEffect(() => {
    if (licensed) reload();
  }, [licensed, reload]);

  // Qué hay en pantalla en la vista de Instagram, para saber qué se puede capturar.
  useEffect(() => {
    if (!licensed) return;
    let active = true;
    async function poll() {
      const result = await window.api.instagram.context();
      if (active && result && !result.error) setContext(result);
    }
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [licensed]);

  // Al visitar el perfil de alguien que ya está guardado, se completan sus datos.
  useEffect(() => {
    if (!licensed) return;
    return window.api.instagram.onNavigated(async (url) => {
      if (!/instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(url)) return;
      if (lastEnrichedUrl.current === url) return;
      lastEnrichedUrl.current = url;
      setTimeout(async () => {
        const updated = await window.api.instagram.enrichCurrentProfile();
        if (updated) reload();
      }, 1200);
    });
  }, [licensed, reload]);

  async function handleSignOut() {
    await window.api.license.signOut();
    setState(null);
    setLicenseState({ state: 'none' });
  }

  if (!licenseState) {
    return (
      <div className="license-screen">
        <div className="logo" style={{ fontSize: 26 }}>
          <span className="logo-dot" />
          {brand.productName}
        </div>
      </div>
    );
  }

  if (!licensed) {
    return (
      <LicenseScreen
        initialMessage={licenseState.message}
        onActivated={(license) => setLicenseState({ state: 'valid', license })}
      />
    );
  }

  if (!state) return null;

  return (
    <div className="app">
      <TopBar context={context} onCaptured={reload} />
      <RenewalBanner license={licenseState.license} offline={licenseState.offline} onSignOut={handleSignOut} />

      <div className="app-body">
        <BrowserSlot />

        <aside className="sidebar">
          <nav className="tabs">
            {TABS.map(([key, label]) => (
              <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>

          <div className="tab-content">
            {tab === 'leads' && (
              <>
                <StatsBar
                  leadCount={state.leads.length}
                  stats={state.todayStats}
                  limit={state.settings.dailyContactSoftLimit}
                />
                <LeadList state={state} reload={reload} />
              </>
            )}
            {tab === 'templates' && <Templates templates={state.templates} reload={reload} />}
            {tab === 'settings' && (
              <SettingsPanel
                settings={state.settings}
                reload={reload}
                license={licenseState.license}
                onSignOut={handleSignOut}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
