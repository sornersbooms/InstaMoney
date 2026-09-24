import { useMemo, useState } from 'react';
import { LeadCard } from './LeadCard';
import { Filters, type FilterState } from './Filters';
import { SendQueuePanel } from './SendQueuePanel';
import type { Lead, Settings, Template } from '@/lib/types';
import { deleteLead, incrementContactedToday, saveLeads, saveSendQueue, updateLead } from '@/lib/storage';
import { downloadCsv } from '@/lib/csvExport';
import { scoreLeadsWithGroq } from '@/lib/groqScoring';

interface Props {
  leads: Lead[];
  setLeads: (leads: Lead[]) => void;
  settings: Settings;
  templates: Template[];
  onContacted: () => void;
}

export function LeadList({ leads, setLeads, settings, templates, onContacted }: Props) {
  const [filters, setFilters] = useState<FilterState>({ search: '', status: 'all', sortByScore: false });
  const [scoring, setScoring] = useState(false);
  const [scoringError, setScoringError] = useState('');
  const [confirmingWipe, setConfirmingWipe] = useState(false);

  const filtered = useMemo(() => {
    let result = leads;
    if (filters.status !== 'all') {
      result = result.filter((l) => l.status === filters.status);
    }
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (l) => l.username.toLowerCase().includes(q) || l.fullName?.toLowerCase().includes(q) || l.bio?.toLowerCase().includes(q),
      );
    }
    if (filters.sortByScore) {
      result = [...result].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    }
    return result;
  }, [leads, filters]);

  async function handleUpdate(id: string, patch: Partial<Lead>) {
    await updateLead(id, patch);
    setLeads(leads.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function handleDelete(id: string) {
    await deleteLead(id);
    setLeads(leads.filter((l) => l.id !== id));
  }

  async function handleMarkContacted() {
    await incrementContactedToday();
    onContacted();
  }

  async function handleDeleteAll() {
    if (!confirmingWipe) {
      setConfirmingWipe(true);
      setTimeout(() => setConfirmingWipe(false), 5000);
      return;
    }
    await saveLeads([]);
    await saveSendQueue(null);
    setLeads([]);
    setConfirmingWipe(false);
  }

  async function handleAnalyze() {
    setScoringError('');
    const pending = filtered.filter((l) => l.score === undefined);
    if (pending.length === 0) {
      setScoringError('Todos los leads visibles ya tienen score.');
      return;
    }
    setScoring(true);
    try {
      const results = await scoreLeadsWithGroq(pending, settings);
      const byUsername = new Map(results.map((r) => [r.username, r]));
      const updated = leads.map((l) => {
        const r = byUsername.get(l.username);
        return r ? { ...l, score: r.score, scoreReason: r.reason } : l;
      });
      await saveLeads(updated);
      setLeads(updated);
    } catch (err) {
      setScoringError(err instanceof Error ? err.message : 'Error al analizar con IA.');
    } finally {
      setScoring(false);
    }
  }

  return (
    <div>
      <Filters filters={filters} onChange={setFilters} />
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px' }}>
        <button
          onClick={handleAnalyze}
          disabled={scoring}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#7b61ff', color: '#fff', fontWeight: 600, fontSize: 13 }}
        >
          {scoring ? 'Analizando...' : '🤖 Analizar con IA (Groq)'}
        </button>
        <button
          onClick={() => downloadCsv(filtered)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13 }}
        >
          ⬇️ CSV
        </button>
        <button
          onClick={handleDeleteAll}
          disabled={leads.length === 0}
          title="Eliminar todos los leads guardados"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${confirmingWipe ? '#ed4956' : '#ddd'}`,
            background: confirmingWipe ? '#ed4956' : '#fff',
            color: confirmingWipe ? '#fff' : '#ed4956',
            fontSize: 13,
            fontWeight: confirmingWipe ? 700 : 400,
            whiteSpace: 'nowrap',
          }}
        >
          {confirmingWipe ? `¿Borrar ${leads.length}? Confirma` : '🗑️'}
        </button>
      </div>
      {scoringError && <div style={{ color: '#ed4956', fontSize: 12, padding: '0 16px 10px' }}>{scoringError}</div>}

      <SendQueuePanel allLeads={leads} candidateLeads={filtered} templates={templates} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px 16px' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 24 }}>
            No hay leads todavía. Ve a Instagram, abre la lista de seguidores o los comentarios de un post, y usa el botón flotante para capturar.
          </div>
        )}
        {filtered.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onMarkContacted={handleMarkContacted}
          />
        ))}
      </div>
    </div>
  );
}
