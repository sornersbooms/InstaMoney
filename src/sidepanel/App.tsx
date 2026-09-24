import { useEffect, useState } from 'react';
import { LeadList } from './components/LeadList';
import { Templates } from './components/Templates';
import { SettingsPanel } from './components/SettingsPanel';
import { StatsBar } from './components/StatsBar';
import { getLeads, getSettings, getTemplates, getTodayStats, onLeadsChanged } from '@/lib/storage';
import { DEFAULT_SETTINGS, type DailyStats, type Lead, type Settings, type Template } from '@/lib/types';

type Tab = 'leads' | 'templates' | 'settings';

export function App() {
  const [tab, setTab] = useState<Tab>('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<DailyStats>({ date: '', contactedCount: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([getLeads(), getSettings(), getTemplates(), getTodayStats()]).then(([l, s, t, st]) => {
      setLeads(l);
      setSettings(s);
      setTemplates(t);
      setStats(st);
      setLoaded(true);
    });
    return onLeadsChanged(setLeads);
  }, []);

  async function refreshStats() {
    setStats(await getTodayStats());
  }

  if (!loaded) return null;

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid #eee', background: '#fff' }}>
        {(['leads', 'templates', 'settings'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '12px 0',
              border: 'none',
              background: 'none',
              fontWeight: tab === t ? 700 : 400,
              borderBottom: tab === t ? '2px solid #0095f6' : '2px solid transparent',
              color: tab === t ? '#0095f6' : '#666',
            }}
          >
            {t === 'leads' ? 'Leads' : t === 'templates' ? 'Plantillas' : 'Ajustes'}
          </button>
        ))}
      </div>

      {tab === 'leads' && (
        <>
          <StatsBar stats={stats} settings={settings} leadCount={leads.length} />
          <LeadList leads={leads} setLeads={setLeads} settings={settings} templates={templates} onContacted={refreshStats} />
        </>
      )}
      {tab === 'templates' && <Templates templates={templates} setTemplates={setTemplates} />}
      {tab === 'settings' && <SettingsPanel settings={settings} setSettings={setSettings} />}
    </div>
  );
}
