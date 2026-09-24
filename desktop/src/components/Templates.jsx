import { useState } from 'react';

export function Templates({ templates, reload }) {
  const [name, setName] = useState('');
  const [body, setBody] = useState('');

  async function addTemplate() {
    if (!name.trim() || !body.trim()) return;
    await window.api.data.setTemplates([...templates, { id: String(Date.now()), name: name.trim(), body: body.trim() }]);
    setName('');
    setBody('');
    reload();
  }

  async function removeTemplate(id) {
    await window.api.data.setTemplates(templates.filter((t) => t.id !== id));
    reload();
  }

  return (
    <div className="panel">
      <div className="card">
        <div className="card-title">✨ Nueva plantilla</div>
        <input placeholder="Nombre (ej. Primer contacto)" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          placeholder="Hola {nombre}, vi tu perfil y..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          style={{ resize: 'vertical' }}
        />
        <span className="muted">
          Variables: <strong>{'{nombre}'}</strong> · <strong>{'{username}'}</strong>
        </span>
        <button className="btn btn-primary" onClick={addTemplate}>
          Guardar plantilla
        </button>
      </div>

      <div className="divider" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {templates.length === 0 && <div className="empty">Aún no tienes plantillas.</div>}
        {templates.map((template) => (
          <div key={template.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title">{template.name}</span>
              <button className="btn-ghost" onClick={() => removeTemplate(template.id)}>
                Eliminar
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
              {template.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
