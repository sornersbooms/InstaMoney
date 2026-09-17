import { useEffect, useState } from 'react';
import { captureVisibleCommenters, captureVisibleFollowers } from './capture';
import { fillTemplate, insertTemplateIntoComposeBox } from './dmHelper';
import { isDirectThreadPage, isFollowersModalOpen, isPostPage } from './selectors';
import { sendMessage } from '@/lib/messaging';
import { getTemplates } from '@/lib/storage';
import type { Template } from '@/lib/types';

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

  useEffect(() => {
    const interval = setInterval(() => setMode(detectMode()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (mode === 'direct') {
      getTemplates().then(setTemplates);
    }
  }, [mode]);

  if (!mode) return null;

  async function handleCaptureFollowers() {
    const profiles = captureVisibleFollowers();
    if (profiles.length === 0) {
      setStatus('No se detectaron perfiles visibles.');
      return;
    }
    const seedMatch = /\/([^/]+)\//.exec(location.pathname);
    const sourceRef = seedMatch?.[1] ?? location.pathname;
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
      {status && <div style={styles.status}>{status}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 24,
    right: 24,
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
};
