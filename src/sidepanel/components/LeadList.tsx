import { useEffect, useMemo, useState } from 'react';
import { LeadCard } from './LeadCard';
import { SendQueuePanel } from './SendQueuePanel';
import type { LeadStage, LeadStatus, Settings, Template } from '@/lib/types';
import { deleteLead, getSettings, getTemplates, getTodayStats, incrementContactedToday, saveLeads, saveSendQueue, updateLead } from '@/lib/storage';
import { downloadCsv } from '@/lib/csvExport';
import { scoreLeadsWithGroq } from '@/lib/groqScoring';
import { Button, Chip, Empty, Icon, Menu, PageHead, SearchInput, Segmented, useToast } from '../ui';
import { useLeads, useNav } from '../hooks';
import { STAGES, STATUS_INFO } from '../crm';

type Sort = 'recent' | 'score' | 'followers';

const PAGE = 40;

export function LeadList({ initialStage }: { initialStage?: string }) {
  const nav = useNav();
  const toast = useToast();
  const leads = useLeads();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');
  const [stage, setStage] = useState<LeadStage | 'all'>((initialStage as LeadStage) ?? 'all');
  const [sort, setSort] = useState<Sort>('recent');
  const [scoring, setScoring] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [contactedToday, setContactedToday] = useState(0);

  useEffect(() => {
    getSettings().then(setSettings);
    getTemplates().then(setTemplates);
    getTodayStats().then((s) => setContactedToday(s.contactedCount));
  }, [leads]);

  const filtered = useMemo(() => {
    let r = leads;
    if (status !== 'all') r = r.filter((l) => l.status === status);
    if (stage !== 'all') r = r.filter((l) => (l.stage ?? 'frio') === stage);
    if (search.trim()) {
      const q = search.toLowerCase().replace(/^@/, '');
      r = r.filter((l) => l.username.toLowerCase().includes(q) || l.fullName?.toLowerCase().includes(q) || l.bio?.toLowerCase().includes(q) || l.tags.some((t) => t.toLowerCase().includes(q)));
    }
    if (sort === 'score') r = [...r].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    if (sort === 'followers') r = [...r].sort((a, b) => (b.followerCount ?? -1) - (a.followerCount ?? -1));
    return r;
  }, [leads, status, stage, search, sort]);

  const statusCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of leads) out[l.status] = (out[l.status] ?? 0) + 1;
    return out;
  }, [leads]);

  async function handleAnalyze() {
    const pending = filtered.filter((l) => l.score === undefined).slice(0, 40);
    if (!settings) return;
    if (pending.length === 0) return toast('Todos los leads visibles ya tienen puntuación');
    setScoring(true);
    try {
      const results = await scoreLeadsWithGroq(pending, settings);
      const byUsername = new Map(results.map((r) => [r.username, r]));
      await saveLeads(leads.map((l) => {
        const r = byUsername.get(l.username);
        return r ? { ...l, score: r.score, scoreReason: r.reason } : l;
      }));
      toast(`${results.length} leads puntuados con IA`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al analizar con IA', true);
    } finally {
      setScoring(false);
    }
  }

  async function wipeAll() {
    await saveLeads([]);
    await saveSendQueue(null);
    setWiping(false);
    toast('Leads eliminados');
  }

  const softLimit = settings?.dailyContactSoftLimit ?? 15;

  return (
    <>
      <PageHead
        title="Leads"
        subtitle={`${leads.length} guardados · ${contactedToday}/${softLimit} contactados hoy`}
        actions={
          <>
            <Button size="sm" variant="soft" icon="sparkles" onClick={handleAnalyze} disabled={scoring || leads.length === 0}>
              {scoring ? 'Analizando…' : 'Puntuar'}
            </Button>
            <Menu
              items={[
                { label: 'Exportar CSV', icon: 'download', onClick: () => downloadCsv(filtered) },
                { label: 'Borrar todos los leads', icon: 'trash', danger: true, onClick: () => setWiping(true) },
              ]}
            />
          </>
        }
      />

      {wiping && (
        <div className="callout danger" style={{ alignItems: 'center' }}>
          <span className="grow">¿Borrar los {leads.length} leads? No se puede deshacer.</span>
          <Button size="sm" onClick={() => setWiping(false)}>No</Button>
          <Button size="sm" variant="danger" onClick={wipeAll}>Borrar</Button>
        </div>
      )}

      <SearchInput value={search} onChange={(v) => { setSearch(v); setLimit(PAGE); }} placeholder="Buscar por usuario, nombre, bio o etiqueta" />
      <div className="chips">
        <Chip active={status === 'all'} onClick={() => setStatus('all')} count={leads.length}>Todos</Chip>
        {(Object.keys(STATUS_INFO) as LeadStatus[]).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)} count={statusCounts[s] ?? 0}>
            {STATUS_INFO[s].label}
          </Chip>
        ))}
      </div>
      <div className="chips">
        <Chip active={stage === 'all'} onClick={() => setStage('all')}>Cualquier etapa</Chip>
        {STAGES.map((s) => (
          <Chip key={s.id} active={stage === s.id} onClick={() => setStage(s.id)} color={s.color}>
            {s.label}
          </Chip>
        ))}
      </div>
      <Segmented
        value={sort}
        onChange={setSort}
        options={[
          { value: 'recent', label: 'Recientes' },
          { value: 'score', label: 'Puntuación IA' },
          { value: 'followers', label: 'Seguidores' },
        ]}
      />

      {leads.length === 0 ? (
        <div className="card">
          <Empty
            icon="users"
            title="Aún no hay leads"
            text="Crea una campaña para captarlos automáticamente, o abre en Instagram una lista de seguidores y usa el botón flotante para capturar."
            action={<Button variant="brand" icon="rocket" onClick={() => nav({ page: 'campaigns', param: 'new' })}>Crear campaña</Button>}
          />
        </div>
      ) : filtered.length === 0 ? (
        <Empty icon="search" title="Sin resultados" text="Prueba con otro filtro o búsqueda." />
      ) : (
        <div className="stack">
          {filtered.slice(0, limit).map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onUpdate={(id, patch) => updateLead(id, patch)}
              onDelete={async (id) => {
                await deleteLead(id);
                toast('Lead eliminado');
              }}
              onMarkContacted={async () => {
                const s = await incrementContactedToday();
                setContactedToday(s.contactedCount);
              }}
            />
          ))}
          {filtered.length > limit && (
            <Button block onClick={() => setLimit((l) => l + PAGE)}>
              Mostrar más ({filtered.length - limit} restantes)
            </Button>
          )}
        </div>
      )}

      {leads.length > 0 && (
        <details className="fold">
          <summary>
            <Icon name="send" size={16} />
            <span className="grow">
              Envío manual guiado
              <span className="muted" style={{ display: 'block', fontWeight: 400 }}>Recorre los leads filtrados y envías tú cada mensaje</span>
            </span>
            <Icon name="chevronRight" size={16} className="chev" />
          </summary>
          <div className="fold-body">
            <SendQueuePanel allLeads={leads} candidateLeads={filtered} templates={templates} />
          </div>
        </details>
      )}
    </>
  );
}
