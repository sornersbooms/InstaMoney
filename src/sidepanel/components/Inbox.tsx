import { useEffect, useMemo, useState } from 'react';
import { getLeads, saveLeads } from '@/lib/storage';
import { uid } from '@/lib/text';
import { matchLeadForThread, type InboxThread, type Lead, type LeadStage } from '@/lib/types';
import { Avatar, bg, Button, Callout, Chip, Empty, Icon, PageHead, SearchInput, timeAgo, useToast } from '../ui';
import { useLeads } from '../hooks';
import { setLeadStage, STAGES, stageOf } from '../crm';

const CACHE_KEY = 'dp-inbox-cache';

type Filter = LeadStage | 'all' | 'unread' | 'waiting';

/** CRM: chats de Instagram organizados por etapa del embudo. */
export function Inbox() {
  const toast = useToast();
  const leads = useLeads();
  const [threads, setThreads] = useState<InboxThread[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [linking, setLinking] = useState<string | null>(null);
  const [linkValue, setLinkValue] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const res = await bg<{ ok: boolean; threads?: InboxThread[]; error?: string }>({ type: 'DP_BG_INBOX' });
    setLoading(false);
    if (!res?.ok) return setError(res?.error ?? 'No se pudo leer la bandeja.');
    setThreads(res.threads ?? []);
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(res.threads ?? []));
    } catch {
      /* sin caché */
    }
  }

  useEffect(() => {
    if (threads.length === 0) load();
  }, []);

  /** Vincula un chat sin lead a un @usuario: crea el lead para poder etiquetarlo. */
  async function link(t: InboxThread) {
    const username = linkValue.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
    if (!username) return;
    const current = await getLeads();
    const existing = current.find((l) => l.username.toLowerCase() === username.toLowerCase());
    if (existing) {
      if (!existing.fullName) existing.fullName = t.name;
      await saveLeads(current);
    } else {
      const lead: Lead = {
        id: uid(`${username}-`),
        username,
        fullName: t.name !== username ? t.name : undefined,
        sourceType: 'inbox',
        sourceRef: 'bandeja',
        capturedAt: Date.now(),
        status: t.lastFromMe ? 'contacted' : 'replied',
        stage: 'tibio',
        tags: [],
        notes: '',
      };
      await saveLeads([lead, ...current]);
    }
    setLinking(null);
    setLinkValue('');
    toast(`Chat vinculado a @${username}`);
  }

  const rows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return threads
      .map((t) => ({ t, lead: matchLeadForThread(leads, t.name) }))
      .filter(({ t, lead }) => {
        if (q && !t.name.toLowerCase().includes(q) && !lead?.username.toLowerCase().includes(q)) return false;
        if (filter === 'all') return true;
        if (filter === 'unread') return t.unread;
        if (filter === 'waiting') return !t.lastFromMe;
        return lead ? (lead.stage ?? 'frio') === filter : false;
      });
  }, [threads, leads, filter, search]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { unread: 0, waiting: 0 };
    for (const t of threads) {
      if (t.unread) out.unread++;
      if (!t.lastFromMe) out.waiting++;
      const lead = matchLeadForThread(leads, t.name);
      if (lead) out[lead.stage ?? 'frio'] = (out[lead.stage ?? 'frio'] ?? 0) + 1;
    }
    return out;
  }, [threads, leads]);

  return (
    <>
      <PageHead
        title="Bandeja"
        subtitle={threads.length ? `${threads.length} conversaciones · ${counts.waiting} esperan tu respuesta` : 'Tus chats de Instagram con su etapa'}
        actions={
          <Button size="sm" variant="soft" icon="refresh" onClick={load} disabled={loading}>
            {loading ? 'Leyendo…' : 'Actualizar'}
          </Button>
        }
      />
      {loading && <Callout tone="info" icon="window">Leyendo tu bandeja en la ventana de trabajo de Instagram…</Callout>}
      {error && <Callout tone="danger">{error}</Callout>}

      {threads.length > 0 && (
        <>
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar conversación" />
          <div className="chips">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={threads.length}>Todas</Chip>
            <Chip active={filter === 'waiting'} onClick={() => setFilter('waiting')} count={counts.waiting} color="var(--primary)">Por responder</Chip>
            <Chip active={filter === 'unread'} onClick={() => setFilter('unread')} count={counts.unread} color="var(--danger)">Sin leer</Chip>
            {STAGES.map((s) => (
              <Chip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)} count={counts[s.id] ?? 0} color={s.color}>
                {s.label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {!loading && threads.length === 0 && !error && (
        <div className="card">
          <Empty icon="inbox" title="Sin conversaciones" text="Pulsa Actualizar para leer tu bandeja de Instagram." />
        </div>
      )}
      {threads.length > 0 && rows.length === 0 && <Empty icon="search" title="Nada en este filtro" />}

      <div className="stack">
        {rows.map(({ t, lead }) => {
          const stage = lead ? stageOf(lead) : null;
          return (
            <div key={t.name} className="card tight" style={{ borderLeft: `3px solid ${stage?.color ?? 'var(--border)'}` }}>
              <div className="row">
                <Avatar src={lead?.profilePicUrl} name={t.name} />
                <div className="grow">
                  <div className="row" style={{ gap: 6 }}>
                    <b className="ellipsis" style={{ fontSize: 13, fontWeight: t.unread ? 800 : 600 }}>{t.name}</b>
                    {t.unread && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--primary)', flexShrink: 0 }} />}
                  </div>
                  <div className="muted ellipsis" style={{ color: t.unread ? 'var(--text)' : undefined }}>
                    {t.lastFromMe ? 'Tú: ' : ''}
                    {t.lastText}
                  </div>
                </div>
                <span className="muted small" style={{ whiteSpace: 'nowrap' }}>{timeAgo(t.lastAt)}</span>
              </div>

              {lead ? (
                <div className="row" style={{ gap: 6 }}>
                  <div className="chips grow">
                    {STAGES.map((s) => (
                      <button
                        key={s.id}
                        className="chip"
                        style={{ height: 24, fontSize: 11, ...((lead.stage ?? 'frio') === s.id ? { background: s.color, borderColor: s.color, color: '#fff' } : {}) }}
                        onClick={() => setLeadStage(lead, s.id)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <a className="btn sm icon" href={`https://www.instagram.com/${lead.username}/`} target="_blank" rel="noreferrer" title="Abrir chat">
                    <Icon name="external" size={14} />
                  </a>
                </div>
              ) : linking === t.name ? (
                <div className="row">
                  <input className="input" autoFocus value={linkValue} onChange={(e) => setLinkValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && link(t)} placeholder="@usuario de esta persona" />
                  <Button size="sm" variant="primary" onClick={() => link(t)}>Vincular</Button>
                  <Button size="sm" variant="ghost" iconOnly icon="x" title="Cancelar" onClick={() => setLinking(null)} />
                </div>
              ) : (
                <div className="row">
                  <span className="muted small grow">Aún no es un lead</span>
                  <Button size="sm" variant="soft" icon="link" onClick={() => { setLinking(t.name); setLinkValue(''); }}>Vincular a @usuario</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {threads.length > 0 && (
        <div className="muted small" style={{ textAlign: 'center' }}>
          Las horas son aproximadas: Instagram solo muestra «hace 2 h», «3 sem»…
        </div>
      )}
    </>
  );
}
