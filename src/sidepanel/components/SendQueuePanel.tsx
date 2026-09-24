import { useEffect, useState } from 'react';
import type { Lead, SendQueueState, Template } from '@/lib/types';
import { getSendQueue, onSendQueueChanged, saveSendQueue } from '@/lib/storage';
import { directMessageUrl } from '@/lib/instagramLinks';

interface Props {
  allLeads: Lead[];
  candidateLeads: Lead[];
  templates: Template[];
}

const BATCH_SIZES = [5, 15, 30];
const DONE_STATUSES = new Set(['contacted', 'converted', 'discarded']);

export function SendQueuePanel({ allLeads, candidateLeads, templates }: Props) {
  const [queue, setQueue] = useState<SendQueueState | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [batchSize, setBatchSize] = useState(5);

  useEffect(() => {
    getSendQueue().then(setQueue);
    return onSendQueueChanged(setQueue);
  }, []);

  const eligible = candidateLeads.filter((l) => !DONE_STATUSES.has(l.status));

  async function handleStart() {
    if (!templateId || eligible.length === 0) return;
    const batch = eligible.slice(0, batchSize);
    const newQueue: SendQueueState = {
      templateId,
      leadIds: batch.map((l) => l.id),
      currentIndex: 0,
      autoInsertPending: true,
    };
    await saveSendQueue(newQueue);
    setQueue(newQueue);
  }

  async function handleCancel() {
    await saveSendQueue(null);
    setQueue(null);
  }

  if (queue) {
    const currentLead = allLeads.find((l) => l.id === queue.leadIds[queue.currentIndex]);
    const template = templates.find((t) => t.id === queue.templateId);
    return (
      <div style={styles.card}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          📋 Cola en curso: {queue.currentIndex + 1} / {queue.leadIds.length}
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>Plantilla: {template?.name ?? '(eliminada)'}</div>
        {currentLead ? (
          <>
            <div style={{ fontSize: 13 }}>
              Lead actual: <strong>@{currentLead.username}</strong>
            </div>
            <a href={directMessageUrl(currentLead.username)} target="_blank" rel="noreferrer" style={styles.openLink}>
              ✉️ Abrir mensaje directo con @{currentLead.username} →
            </a>
            <div style={{ fontSize: 11, color: '#999' }}>
              Se abre el chat directo con este lead. Usa el botón flotante en Instagram para insertar la plantilla y avanzar.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#999' }}>Este lead ya no existe.</div>
        )}
        <button onClick={handleCancel} style={styles.cancelButton}>
          ✖️ Cancelar cola
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>📋 Envío guiado por plantilla</div>
      <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={styles.select}>
        <option value="">Elige una plantilla...</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 6 }}>
        {BATCH_SIZES.map((n) => (
          <button
            key={n}
            onClick={() => setBatchSize(n)}
            style={{ ...styles.batchButton, ...(batchSize === n ? styles.batchButtonActive : {}) }}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        onClick={handleStart}
        disabled={!templateId || eligible.length === 0}
        style={styles.startButton}
      >
        ▶️ Iniciar cola ({Math.min(batchSize, eligible.length)} leads)
      </button>
      <div style={{ fontSize: 11, color: '#999' }}>
        Te lleva lead por lead con la plantilla lista para insertar. Tú sigues pulsando "Enviar" en Instagram para cada uno.
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 10,
    padding: 12,
    margin: '0 16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  select: {
    padding: 8,
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 13,
  },
  batchButton: {
    flex: 1,
    padding: '6px 0',
    borderRadius: 6,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 13,
  },
  batchButtonActive: {
    background: '#0095f6',
    color: '#fff',
    border: 'none',
  },
  startButton: {
    padding: '8px 12px',
    borderRadius: 8,
    border: 'none',
    background: '#7b61ff',
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
  },
  openLink: {
    fontSize: 13,
    color: '#0095f6',
    fontWeight: 600,
  },
  cancelButton: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #ed4956',
    background: '#fff',
    color: '#ed4956',
    fontSize: 12,
  },
};
