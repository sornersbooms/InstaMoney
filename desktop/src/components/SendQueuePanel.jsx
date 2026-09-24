import { useState } from 'react';
import { directMessageUrl } from '../lib/links.js';

const BATCH_SIZES = [5, 15, 30];
const DONE = new Set(['contacted', 'converted', 'discarded']);

export function SendQueuePanel({ state, reload }) {
  const { sendQueue: queue, templates, leads } = state;
  const [templateId, setTemplateId] = useState('');
  const [batchSize, setBatchSize] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const eligible = leads.filter((l) => !DONE.has(l.status));

  async function goToLead(lead) {
    if (lead) await window.api.instagram.navigate(directMessageUrl(lead.username));
  }

  async function startQueue() {
    if (!templateId) return;
    const batch = eligible.slice(0, batchSize);
    if (batch.length === 0) return;
    await window.api.data.setSendQueue({ templateId, leadIds: batch.map((l) => l.id), currentIndex: 0 });
    await reload();
    await goToLead(batch[0]);
  }

  async function cancelQueue() {
    await window.api.data.setSendQueue(null);
    reload();
  }

  if (!queue) {
    return (
      <div className="card">
        <div className="card-title">📋 Envío guiado</div>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Elige una plantilla...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="chips">
          {BATCH_SIZES.map((n) => (
            <button
              key={n}
              className={`chip ${batchSize === n ? 'active' : ''}`}
              style={batchSize === n ? { background: '#00f0ff', boxShadow: '0 0 16px rgba(0,240,255,.45)' } : undefined}
              onClick={() => setBatchSize(n)}
            >
              {n} leads
            </button>
          ))}
        </div>
        <button className="btn btn-ai" disabled={!templateId || eligible.length === 0} onClick={startQueue}>
          ▶️ Iniciar cola ({Math.min(batchSize, eligible.length)})
        </button>
        <span className="muted">
          Te lleva lead por lead con el mensaje listo. Tú pulsas "Enviar" en Instagram para cada uno.
        </span>
      </div>
    );
  }

  const currentLead = leads.find((l) => l.id === queue.leadIds[queue.currentIndex]);
  const template = templates.find((t) => t.id === queue.templateId);
  const progress = ((queue.currentIndex + 1) / queue.leadIds.length) * 100;

  async function insertMessage({ withAi }) {
    if (!currentLead) return;
    setError('');
    setBusy(true);
    let text = (template?.body ?? '').replace(/\{(\w+)\}/g, (_, key) =>
      key === 'nombre'
        ? currentLead.fullName ?? currentLead.username
        : key === 'username'
          ? currentLead.username
          : `{${key}}`,
    );
    if (withAi) {
      const result = await window.api.groq.personalize(currentLead, template?.body ?? '');
      if (result.error) {
        setBusy(false);
        setError(result.error);
        return;
      }
      text = result.message;
    }
    const inserted = await window.api.instagram.insertTemplate(text);
    setBusy(false);
    if (!inserted?.ok) {
      setError(
        inserted?.reason === 'not-empty'
          ? 'Ya hay texto escrito en el chat; bórralo primero.'
          : 'No se encontró la caja de mensaje. Abre el chat del lead.',
      );
    }
  }

  async function advance(markContacted) {
    if (markContacted && currentLead) {
      await window.api.data.updateLead(currentLead.id, { status: 'contacted' });
      await window.api.data.incrementContacted();
    }
    const nextIndex = queue.currentIndex + 1;
    if (nextIndex >= queue.leadIds.length) {
      await window.api.data.setSendQueue(null);
      await reload();
      return;
    }
    await window.api.data.setSendQueue({ ...queue, currentIndex: nextIndex });
    const next = leads.find((l) => l.id === queue.leadIds[nextIndex]);
    await reload();
    await goToLead(next);
  }

  return (
    <div className="card card-accent">
      <div className="card-title">
        📋 Cola {queue.currentIndex + 1} / {queue.leadIds.length}
      </div>

      <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg,#00f0ff,#a855f7,#ff2d95)',
            boxShadow: '0 0 12px rgba(168,85,247,.7)',
            transition: 'width .3s ease',
          }}
        />
      </div>

      <span className="muted">Plantilla: {template?.name ?? '(eliminada)'}</span>

      {currentLead ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 600 }}>@{currentLead.username}</div>
          <div className="row" style={{ padding: 0 }}>
            <button className="btn" onClick={() => goToLead(currentLead)}>
              ✉️ Abrir chat
            </button>
            <button className="btn" disabled={busy} onClick={() => insertMessage({ withAi: false })}>
              Insertar
            </button>
            <button className="btn btn-ai" disabled={busy} onClick={() => insertMessage({ withAi: true })}>
              {busy ? <span className="spin">◌</span> : '🤖 Con IA'}
            </button>
          </div>
          <div className="row" style={{ padding: 0 }}>
            <button className="btn btn-go" style={{ flex: 1 }} onClick={() => advance(true)}>
              ✅ Contactado, siguiente
            </button>
            <button className="btn" onClick={() => advance(false)}>
              ⏭️
            </button>
          </div>
          <span className="muted">Revisa el texto y pulsa "Enviar" en Instagram antes de avanzar.</span>
        </>
      ) : (
        <span className="muted">Este lead ya no existe.</span>
      )}

      {error && <span style={{ color: '#ff6b9d', fontSize: 12 }}>{error}</span>}
      <button className="btn btn-danger" onClick={cancelQueue}>
        ✖️ Cancelar cola
      </button>
    </div>
  );
}
