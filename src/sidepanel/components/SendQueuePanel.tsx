import { useEffect, useState } from 'react';
import type { Lead, SendQueueState, Template } from '@/lib/types';
import { getSendQueue, onSendQueueChanged, saveSendQueue } from '@/lib/storage';
import { directMessageUrl } from '@/lib/instagramLinks';
import { Button, Callout, Field, Icon, Progress, Segmented } from '../ui';

interface Props {
  allLeads: Lead[];
  candidateLeads: Lead[];
  templates: Template[];
}

const DONE_STATUSES = new Set(['contacted', 'converted', 'discarded']);

/** Modo manual: te lleva lead por lead con la plantilla lista; tú pulsas "Enviar" en Instagram. */
export function SendQueuePanel({ allLeads, candidateLeads, templates }: Props) {
  const [queue, setQueue] = useState<SendQueueState | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [batchSize, setBatchSize] = useState('5');

  useEffect(() => {
    getSendQueue().then(setQueue);
    return onSendQueueChanged(setQueue);
  }, []);

  const eligible = candidateLeads.filter((l) => !DONE_STATUSES.has(l.status));

  async function start() {
    if (!templateId || eligible.length === 0) return;
    await saveSendQueue({ templateId, leadIds: eligible.slice(0, Number(batchSize)).map((l) => l.id), currentIndex: 0, autoInsertPending: true });
  }

  if (queue) {
    const current = allLeads.find((l) => l.id === queue.leadIds[queue.currentIndex]);
    const template = templates.find((t) => t.id === queue.templateId);
    return (
      <div className="stack">
        <div className="row between small">
          <b>Cola en curso</b>
          <span className="muted">
            {queue.currentIndex + 1} / {queue.leadIds.length} · {template?.name ?? '(plantilla eliminada)'}
          </span>
        </div>
        <Progress value={queue.currentIndex} max={queue.leadIds.length} tone="success" />
        {current ? (
          <a className="btn primary block" href={directMessageUrl(current.username)} target="_blank" rel="noreferrer">
            <Icon name="send" size={15} /> Abrir chat con @{current.username}
          </a>
        ) : (
          <span className="muted">Este lead ya no existe.</span>
        )}
        <span className="muted small">En Instagram, el botón flotante inserta la plantilla y te deja pasar al siguiente.</span>
        <Button variant="danger-ghost" icon="x" onClick={() => saveSendQueue(null)}>Cancelar cola</Button>
      </div>
    );
  }

  if (templates.length === 0) return <Callout tone="warning">Crea una plantilla en Más → Plantillas y audios para usar este modo.</Callout>;

  return (
    <div className="stack">
      <Field label="Plantilla">
        <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Elige una plantilla…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Cuántos leads">
        <Segmented value={batchSize} onChange={setBatchSize} options={['5', '15', '30'].map((n) => ({ value: n, label: n }))} />
      </Field>
      <Button variant="primary" icon="play" block onClick={start} disabled={!templateId || eligible.length === 0}>
        Iniciar cola ({Math.min(Number(batchSize), eligible.length)} leads)
      </Button>
    </div>
  );
}
