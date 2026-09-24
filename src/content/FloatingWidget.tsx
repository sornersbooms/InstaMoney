import { useEffect, useRef, useState } from 'react';
import { captureVisibleCommenters, captureVisibleFollowers } from './capture';
import { fillTemplate, insertTemplateIntoComposeBox } from './dmHelper';
import { directMessageUrl } from '@/lib/instagramLinks';
import { getDmComposeBox, isDirectThreadPage, isFollowersModalOpen, isPostPage } from './selectors';
import { sendMessage } from '@/lib/messaging';
import { getLeads, getSendQueue, getTemplates, incrementContactedToday, saveSendQueue, updateLead } from '@/lib/storage';
import type { Lead, SendQueueState, Template } from '@/lib/types';

type Mode = 'followers' | 'post' | 'direct' | null;

function detectMode(): Mode {
  if (isFollowersModalOpen()) return 'followers';
  if (isPostPage()) return 'post';
  if (isDirectThreadPage()) return 'direct';
  return null;
}

export function FloatingWidget() {
  const [mode, setMode] = useState<Mode>(detectMode());
  const [status, setStatus] = useState<string>('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [queue, setQueue] = useState<SendQueueState | null>(null);
  const [queueLead, setQueueLead] = useState<Lead | null>(null);
  const [queueTemplate, setQueueTemplate] = useState<Template | null>(null);
  const autoInsertedForLead = useRef<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setMode(detectMode()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (mode === 'direct') {
      getTemplates().then(setTemplates);
    }
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const q = await getSendQueue();
      if (cancelled) return;
      setQueue(q);
      if (q) {
        const [leads, allTemplates] = await Promise.all([getLeads(), getTemplates()]);
        if (cancelled) return;
        setQueueLead(leads.find((l) => l.id === q.leadIds[q.currentIndex]) ?? null);
        setQueueTemplate(allTemplates.find((t) => t.id === q.templateId) ?? null);
      } else {
        setQueueLead(null);
        setQueueTemplate(null);
      }
    }
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleQueueInsert() {
    if (!queueTemplate || !queueLead) return;
    const ok = insertTemplateIntoComposeBox(
      fillTemplate(queueTemplate.body, { nombre: queueLead.fullName ?? queueLead.username, username: queueLead.username }),
    );
    setStatus(ok ? 'Plantilla insertada. Revisa y pulsa Enviar tú mismo.' : 'No se encontró la caja de mensaje.');
  }

  // Inserta la plantilla sola al abrir el chat del lead en curso. Nunca envía: la persona
  // revisa el texto y pulsa "Enviar" de Instagram.
  useEffect(() => {
    if (mode !== 'direct' || !queue?.autoInsertPending || !queueLead || !queueTemplate) return;
    if (autoInsertedForLead.current === queueLead.id) return;

    const box = getDmComposeBox();
    if (!box) return;

    autoInsertedForLead.current = queueLead.id;
    if ((box.textContent ?? '').trim().length === 0) {
      insertTemplateIntoComposeBox(
        fillTemplate(queueTemplate.body, {
          nombre: queueLead.fullName ?? queueLead.username,
          username: queueLead.username,
        }),
      );
      setStatus('Plantilla insertada. Revisa y pulsa Enviar tú mismo.');
    }
    saveSendQueue({ ...queue, autoInsertPending: false });
  }, [mode, queue, queueLead, queueTemplate]);

  async function handleQueueAdvance(markContacted: boolean) {
    if (!queue || !queueLead) return;
    if (markContacted) {
      await updateLead(queueLead.id, { status: 'contacted' });
      await incrementContactedToday();
    }
    const nextIndex = queue.currentIndex + 1;
    if (nextIndex >= queue.leadIds.length) {
      await saveSendQueue(null);
      setStatus('🎉 Cola completada.');
      return;
    }
    const updatedQueue: SendQueueState = { ...queue, currentIndex: nextIndex, autoInsertPending: true };
    await saveSendQueue(updatedQueue);
    const leads = await getLeads();
    const nextLead = leads.find((l) => l.id === updatedQueue.leadIds[nextIndex]);
    if (nextLead) {
      location.href = directMessageUrl(nextLead.username);
    }
  }

  async function handleQueueCancel() {
    await saveSendQueue(null);
    setQueue(null);
    setQueueLead(null);
    setQueueTemplate(null);
  }

  if (!mode && !queue) return null;

  async function handleCaptureFollowers() {
    const profiles = captureVisibleFollowers();
    if (profiles.length === 0) {
      setStatus('No se detectaron perfiles visibles.');
      return;
    }
    const seedMatch = /\/([^/]+)\//.exec(location.pathname);
    const sourceRef = seedMatch?.[1] ?? location.pathname;
    setStatus(`Capturando ${profiles.length} perfiles...`);
    const result = (await sendMessage({
      type: 'CAPTURE_PROFILES',
      profiles,
      sourceType: 'followers_list',
      sourceRef,
    })) as { added: number; skipped: number };
    setStatus(`Capturados ${result.added} nuevos (${result.skipped} ya existían).`);
  }

  async function handleCaptureCommenters() {
    const profiles = captureVisibleCommenters();
    if (profiles.length === 0) {
      setStatus('No se detectaron comentarios visibles.');
      return;
    }
    setStatus(`Capturando ${profiles.length} perfiles...`);
    const result = (await sendMessage({
      type: 'CAPTURE_PROFILES',
      profiles,
      sourceType: 'post_comments',
      sourceRef: location.href,
    })) as { added: number; skipped: number };
    setStatus(`Capturados ${result.added} nuevos (${result.skipped} ya existían).`);
  }

  function handleInsertTemplate(t: Template) {
    const ok = insertTemplateIntoComposeBox(fillTemplate(t.body, {}));
    setStatus(ok ? 'Plantilla insertada. Revisa y pulsa Enviar tú mismo.' : 'No se encontró la caja de mensaje.');
    setShowTemplates(false);
  }

  return (
    <div style={styles.container}>
      {mode === 'followers' && (
        <button style={styles.button} onClick={handleCaptureFollowers}>
          📥 Capturar seguidores visibles
        </button>
      )}
      {mode === 'post' && (
        <button style={styles.button} onClick={handleCaptureCommenters}>
          💬 Capturar comentaristas visibles
        </button>
      )}
      {mode === 'direct' && (
        <div style={{ position: 'relative' }}>
          <button style={styles.button} onClick={() => setShowTemplates((v) => !v)}>
            ✉️ Insertar plantilla
          </button>
          {showTemplates && (
            <div style={styles.dropdown}>
              {templates.length === 0 && <div style={styles.dropdownItem}>Sin plantillas — crea una en el panel.</div>}
              {templates.map((t) => (
                <div key={t.id} style={styles.dropdownItem} onClick={() => handleInsertTemplate(t)}>
                  {t.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {queue && queueLead && (
        <div style={styles.queueBar}>
          <div style={{ fontWeight: 700 }}>
            📋 Cola: {queue.currentIndex + 1}/{queue.leadIds.length} — @{queueLead.username}
          </div>
          {mode === 'direct' ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={styles.queueButton} onClick={handleQueueInsert}>
                ✉️ Insertar
              </button>
              <button style={{ ...styles.queueButton, background: '#00a400' }} onClick={() => handleQueueAdvance(true)}>
                ✅ Contactado, siguiente
              </button>
              <button style={{ ...styles.queueButton, background: '#8e8e8e' }} onClick={() => handleQueueAdvance(false)}>
                ⏭️ Saltar
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 11 }}>
              Si no llegaste directo al chat, abre este perfil y pulsa "Enviar mensaje" para continuar la cola.
            </div>
          )}
          <button style={styles.queueCancelButton} onClick={handleQueueCancel}>
            ✖️ Cancelar cola
          </button>
        </div>
      )}
      {status && <div style={styles.status}>{status}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: '50%',
    right: 20,
    transform: 'translateY(-50%)',
    zIndex: 999999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
    fontFamily: 'system-ui, sans-serif',
  },
  button: {
    background: '#0095f6',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  },
  status: {
    background: 'white',
    color: '#333',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 12,
    maxWidth: 240,
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  dropdown: {
    position: 'absolute',
    bottom: '110%',
    right: 0,
    background: 'white',
    borderRadius: 8,
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    minWidth: 200,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: '10px 14px',
    fontSize: 13,
    color: '#333',
    cursor: 'pointer',
    borderBottom: '1px solid #eee',
  },
  queueBar: {
    background: 'white',
    color: '#333',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 12,
    maxWidth: 260,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  },
  queueButton: {
    background: '#0095f6',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  queueCancelButton: {
    background: 'none',
    border: 'none',
    color: '#ed4956',
    fontSize: 11,
    cursor: 'pointer',
    alignSelf: 'flex-start',
    padding: 0,
  },
};
