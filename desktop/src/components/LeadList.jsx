import { useMemo, useState } from 'react';
import { LeadCard } from './LeadCard.jsx';
import { SendQueuePanel } from './SendQueuePanel.jsx';
import { downloadCsv } from '../lib/csv.js';
import { profileUrl } from '../lib/links.js';

const STATUS_OPTIONS = [
  ['all', 'Todos los estados'],
  ['new', 'Nuevo'],
  ['contacted', 'Contactado'],
  ['replied', 'Respondió'],
  ['converted', 'Convertido'],
  ['discarded', 'Descartado'],
];

export function LeadList({ state, reload }) {
  const { leads } = state;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sortByScore, setSortByScore] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState('');
  const [confirmingWipe, setConfirmingWipe] = useState(false);

  const filtered = useMemo(() => {
    let result = leads;
    if (status !== 'all') result = result.filter((l) => l.status === status);
    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((l) =>
        [l.username, l.fullName, l.bio].some((field) => field?.toLowerCase().includes(query)),
      );
    }
    if (sortByScore) result = [...result].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return result;
  }, [leads, search, status, sortByScore]);

  async function handleUpdate(id, patch) {
    await window.api.data.updateLead(id, patch);
    reload();
  }

  async function handleDelete(id) {
    await window.api.data.setLeads(leads.filter((l) => l.id !== id));
    reload();
  }

  async function handleDeleteAll() {
    if (!confirmingWipe) {
      setConfirmingWipe(true);
      setTimeout(() => setConfirmingWipe(false), 5000);
      return;
    }
    await window.api.data.setLeads([]);
    await window.api.data.setSendQueue(null);
    setConfirmingWipe(false);
    reload();
  }

  async function handleAnalyze() {
    setError('');
    const pending = filtered.filter((l) => l.score === undefined);
    if (pending.length === 0) {
      setError('Todos los leads visibles ya tienen score.');
      return;
    }
    setScoring(true);
    const result = await window.api.groq.score(pending);
    setScoring(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const byUsername = new Map(result.results.map((r) => [r.username, r]));
    const updated = leads.map((lead) => {
      const scored = byUsername.get(lead.username);
      return scored ? { ...lead, score: scored.score, scoreReason: scored.reason } : lead;
    });
    await window.api.data.setLeads(updated);
    reload();
  }

  return (
    <div>
      <div className="row">
        <input
          placeholder="Buscar username, nombre o bio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 150 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} />
          Por score
        </label>
      </div>

      <div className="row">
        <button className="btn btn-ai" style={{ flex: 1 }} onClick={handleAnalyze} disabled={scoring}>
          {scoring ? (
            <>
              <span className="spin">◌</span> Analizando...
            </>
          ) : (
            '🤖 Analizar con IA'
          )}
        </button>
        <button className="btn" onClick={() => downloadCsv(filtered)}>
          ⬇️ CSV
        </button>
        <button
          className={`btn btn-danger ${confirmingWipe ? 'confirming' : ''}`}
          onClick={handleDeleteAll}
          disabled={leads.length === 0}
        >
          {confirmingWipe ? `¿Borrar ${leads.length}?` : '🗑️'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      <div style={{ padding: '0 16px 12px' }}>
        <SendQueuePanel state={state} reload={reload} />
      </div>

      <div className="lead-list">
        {filtered.length === 0 && (
          <div className="empty">
            <div className="empty-icon">🛰️</div>
            Sin leads todavía.
            <br />
            Navega a una lista de seguidores, likes o comentarios y pulsa <strong>Capturar</strong>.
          </div>
        )}
        {filtered.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onOpen={(l) => window.api.instagram.navigate(profileUrl(l.username))}
          />
        ))}
      </div>
    </div>
  );
}
