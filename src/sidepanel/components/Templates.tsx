import { useState } from 'react';
import type { Template } from '@/lib/types';
import { saveTemplates } from '@/lib/storage';

interface Props {
  templates: Template[];
  setTemplates: (templates: Template[]) => void;
}

export function Templates({ templates, setTemplates }: Props) {
  const [name, setName] = useState('');
  const [body, setBody] = useState('');

  async function addTemplate() {
    if (!name.trim() || !body.trim()) return;
    const updated = [...templates, { id: `${Date.now()}`, name: name.trim(), body: body.trim() }];
    await saveTemplates(updated);
    setTemplates(updated);
    setName('');
    setBody('');
  }

  async function removeTemplate(id: string) {
    const updated = templates.filter((t) => t.id !== id);
    await saveTemplates(updated);
    setTemplates(updated);
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Nueva plantilla</h3>
        <input
          placeholder="Nombre (ej. Primer contacto)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', marginBottom: 8 }}
        />
        <textarea
          placeholder="Hola {nombre}, vi tu perfil y..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', resize: 'vertical' }}
        />
        <div style={{ fontSize: 11, color: '#999', margin: '4px 0' }}>Variables disponibles: {'{nombre}'}, {'{username}'}</div>
        <button onClick={addTemplate} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0095f6', color: '#fff', fontWeight: 600 }}>
          Guardar plantilla
        </button>
      </div>

      <div>
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Tus plantillas</h3>
        {templates.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Aún no tienes plantillas.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 13 }}>{t.name}</strong>
                <button onClick={() => removeTemplate(t.id)} style={{ fontSize: 11, color: '#ed4956', background: 'none', border: 'none' }}>
                  Eliminar
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4, whiteSpace: 'pre-wrap' }}>{t.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
