import { useEffect, useState } from 'react';
import { getSettings } from '@/lib/storage';
import { ACTION_LABELS, type ActionKind, type Settings } from '@/lib/types';
import { Button, Empty, Icon, Progress, bg, useToast, type IconName } from '../ui';
import { engineStatus, useActivity, useAutomationSettings, useCampaigns, useCounters, useLeads, useNav, useNow } from '../hooks';
import { useEngineToggle } from './EngineBar';
import { ActivityItem } from './ActivityLog';
import { STAGES } from '../crm';

const TODAY: Array<{ id: ActionKind; icon: IconName }> = [
  { id: 'dm', icon: 'send' },
  { id: 'follow', icon: 'userPlus' },
  { id: 'like', icon: 'heart' },
  { id: 'story', icon: 'eye' },
  { id: 'comment', icon: 'message' },
  { id: 'voice', icon: 'mic' },
  { id: 'closeFriends', icon: 'star' },
  { id: 'unfollow', icon: 'userMinus' },
];

const SETUP_KEY = 'dp-setup-hidden';

export function Home() {
  const nav = useNav();
  const toast = useToast();
  const { engine, toggle, busy } = useEngineToggle();
  const settings = useAutomationSettings();
  const counters = useCounters();
  const campaigns = useCampaigns();
  const leads = useLeads();
  const activity = useActivity();
  const now = useNow();
  const [aiSettings, setAiSettings] = useState<Settings | null>(null);
  const [setupHidden, setSetupHidden] = useState(() => {
    try {
      return localStorage.getItem(SETUP_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showAllToday, setShowAllToday] = useState(false);

  useEffect(() => {
    getSettings().then(setAiSettings);
  }, []);

  const st = engineStatus(engine, settings, now);
  const heroClass = st.mode === 'off' ? 'off' : st.mode === 'paused' || st.mode === 'offhours' ? 'paused' : '';

  const steps = [
    {
      done: !!engine.ownUserId,
      label: 'Conecta tu cuenta de Instagram',
      action: async () => {
        const r = await bg<{ ok: boolean; loggedIn?: boolean; error?: string }>({ type: 'DP_BG_SESSION' });
        toast(r.ok && r.loggedIn ? 'Cuenta de Instagram conectada' : (r.error ?? 'Inicia sesión en la ventana de Instagram que se abrió'), !(r.ok && r.loggedIn));
      },
      cta: 'Conectar',
    },
    {
      done: !!aiSettings?.groqApiKey && !!aiSettings?.aiOffer,
      label: 'Configura la IA y qué ofreces',
      action: () => nav({ page: 'settings' }),
      cta: 'Configurar',
    },
    { done: campaigns.length > 0, label: 'Crea tu primera campaña', action: () => nav({ page: 'campaigns', param: 'new' }), cta: 'Crear' },
    { done: engine.enabled, label: 'Enciende el motor', action: toggle, cta: 'Encender' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const showSetup = !setupHidden && doneCount < steps.length;

  const running = campaigns.filter((c) => c.status === 'running' || c.status === 'paused');
  const stageCounts = STAGES.map((s) => ({ ...s, n: leads.filter((l) => (l.stage ?? 'frio') === s.id).length }));
  const todayList = showAllToday ? TODAY : TODAY.slice(0, 4);

  return (
    <>
      <div className={`hero ${heroClass}`}>
        <div className="hero-row">
          <div className="hero-title">
            <small>Motor de automatización</small>
            <b>{st.title}</b>
            <span>{st.detail}</span>
          </div>
          <button className="power" onClick={toggle} disabled={busy} title={engine.enabled ? 'Apagar motor' : 'Encender motor'}>
            <Icon name={engine.enabled ? 'pause' : 'power'} size={24} stroke={2.4} />
          </button>
        </div>
        <div className="hero-row" style={{ gap: 6 }}>
          {st.mode === 'paused' && (
            <button className="btn sm glass" onClick={() => bg({ type: 'DP_BG_RESUME' })}>
              <Icon name="play" size={13} /> Reanudar ya
            </button>
          )}
          <button className="btn sm glass" onClick={() => bg({ type: 'DP_BG_SHOW_WORKER' })}>
            <Icon name="window" size={13} /> Ventana de trabajo
          </button>
          {engine.systemWork.length > 0 && (
            <span className="small" style={{ opacity: 0.9, marginLeft: 'auto' }}>
              {engine.systemWork.length} en cola automática
            </span>
          )}
        </div>
      </div>

      {showSetup && (
        <div className="card">
          <div className="card-head">
            <Icon name="rocket" size={18} />
            <h3>
              Primeros pasos <span className="sub">· {doneCount} de {steps.length}</span>
            </h3>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon="x"
              title="Ocultar"
              onClick={() => {
                setSetupHidden(true);
                try {
                  localStorage.setItem(SETUP_KEY, '1');
                } catch {
                  /* sin almacenamiento local */
                }
              }}
            />
          </div>
          <Progress value={doneCount} max={steps.length} tone="success" />
          <div>
            {steps.map((s) => (
              <div key={s.label} className={`todo${s.done ? ' done' : ''}`}>
                <div className="tc">{s.done && <Icon name="check" size={12} stroke={3} />}</div>
                <div className="tl">{s.label}</div>
                {!s.done && (
                  <Button size="sm" variant="soft" onClick={s.action}>
                    {s.cta}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-title">
        Hoy
        <button className="link btn ghost sm" style={{ height: 22 }} onClick={() => setShowAllToday((v) => !v)}>
          {showAllToday ? 'Ver menos' : 'Ver todo'}
        </button>
      </div>
      <div className="card">
        {todayList.map(({ id, icon }) => {
          const used = counters.counts[id] ?? 0;
          const limit = settings.dailyLimits[id];
          return (
            <div key={id} className="meter">
              <div className="meter-top">
                <Icon name={icon} size={14} />
                <span>{ACTION_LABELS[id]}</span>
                <b>
                  {used}
                  <span className="muted"> / {limit}</span>
                </b>
              </div>
              <Progress value={used} max={limit} />
            </div>
          );
        })}
      </div>

      <div className="section-title">
        Embudo
        <button className="link btn ghost sm" style={{ height: 22 }} onClick={() => nav({ page: 'leads' })}>
          {leads.length} leads →
        </button>
      </div>
      <div className="pipeline">
        {stageCounts.map((s) => (
          <button key={s.id} className="pipe" onClick={() => nav({ page: 'leads', param: s.id })}>
            <b>{s.n}</b>
            <span>{s.label}</span>
            <i style={{ background: s.color }} />
          </button>
        ))}
      </div>

      <div className="section-title">
        Campañas en curso
        <button className="link btn ghost sm" style={{ height: 22 }} onClick={() => nav({ page: 'campaigns' })}>
          Ver todas →
        </button>
      </div>
      {running.length === 0 ? (
        <div className="card">
          <Empty
            icon="rocket"
            title="Ninguna campaña en marcha"
            text="Elige de dónde sacar prospectos y qué hacer con ellos. Te guiamos paso a paso."
            action={<Button variant="brand" icon="plus" onClick={() => nav({ page: 'campaigns', param: 'new' })}>Crear campaña</Button>}
          />
        </div>
      ) : (
        <div className="list">
          {running.slice(0, 3).map((c) => (
            <button key={c.id} className="list-item" onClick={() => nav({ page: 'campaigns' })}>
              <div className="li-icon" style={{ background: c.status === 'running' ? 'var(--success-soft)' : 'var(--warning-soft)', color: c.status === 'running' ? 'var(--success)' : 'var(--warning)' }}>
                <Icon name={c.status === 'running' ? 'play' : 'pause'} size={15} />
              </div>
              <div className="li-main">
                <b className="ellipsis">{c.name}</b>
                <div style={{ marginTop: 5 }}>
                  <Progress value={c.stats.passed} max={c.maxLeads} tone="success" />
                </div>
              </div>
              <span className="muted">
                {c.stats.passed}/{c.maxLeads}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="section-title">
        Actividad reciente
        <button className="link btn ghost sm" style={{ height: 22 }} onClick={() => nav({ page: 'activity' })}>
          Ver todo →
        </button>
      </div>
      <div className="card flat">
        {activity.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: 8 }}>Aún no hay actividad.</div>
        ) : (
          <div className="timeline">
            {activity.slice(0, 5).map((e, i) => (
              <ActivityItem key={`${e.at}-${i}`} e={e} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
