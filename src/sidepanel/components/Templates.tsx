import { useEffect, useState } from 'react';
import type { Template } from '@/lib/types';
import { getTemplates, saveTemplates } from '@/lib/storage';
import { renderMessage } from '@/lib/text';
import { VoiceNotes } from './VoiceNotes';
import { Button, ConfirmButton, Empty, Field, Icon, PageHead, Segmented, useToast } from '../ui';
import { useNav } from '../hooks';

const VARS = ['{primer_nombre}', '{nombre}', '{username}', '{Hola|Buenas|Qué tal}'];

export function Templates() {
  const nav = useNav();
  const toast = useToast();
  const [tab, setTab] = useState<'text' | 'voice'>('text');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);

  useEffect(() => {
    getTemplates().then(setTemplates);
  }, []);

  async function persist(next: Template[]) {
    await saveTemplates(next);
    setTemplates(next);
  }

  async function saveEditing() {
    if (!editing || !editing.name.trim() || !editing.body.trim()) return toast('Pon un nombre y un texto', true);
    const exists = templates.some((t) => t.id === editing.id);
    await persist(exists ? templates.map((t) => (t.id === editing.id ? editing : t)) : [...templates, editing]);
    setEditing(null);
    toast('Plantilla guardada');
  }

  return (
    <>
      <PageHead title="Plantillas y audios" subtitle="Mensajes y notas de voz reutilizables" onBack={() => nav({ page: 'more' })} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'text', label: `Mensajes (${templates.length})`, icon: 'file' },
          { value: 'voice', label: 'Notas de voz', icon: 'mic' },
        ]}
      />

      {tab === 'voice' && <VoiceNotes />}

      {tab === 'text' && editing && (
        <div className="card">
          <Field label="Nombre">
            <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ej. Primer contacto" autoFocus />
          </Field>
          <Field label="Mensaje">
            <textarea className="textarea" style={{ minHeight: 110 }} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="{Hola|Buenas} {primer_nombre}, vi tu perfil y…" />
          </Field>
          <div className="row wrap" style={{ gap: 5 }}>
            {VARS.map((v) => (
              <button key={v} className="chip" style={{ height: 24, fontSize: 11 }} onClick={() => setEditing({ ...editing, body: `${editing.body}${v}` })}>
                + {v}
              </button>
            ))}
          </div>
          {editing.body && (
            <div className="callout primary">
              <Icon name="eye" size={15} />
              <div>
                <b>Vista previa</b>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{renderMessage(editing.body, { username: 'ana.fit', fullName: 'Ana López' })}</div>
              </div>
            </div>
          )}
          <div className="row">
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <div className="grow">
              <Button variant="primary" block icon="check" onClick={saveEditing}>Guardar plantilla</Button>
            </div>
          </div>
        </div>
      )}

      {tab === 'text' && !editing && (
        <>
          <Button variant="brand" icon="plus" block onClick={() => setEditing({ id: `${Date.now()}`, name: '', body: '' })}>Nueva plantilla</Button>
          {templates.length === 0 ? (
            <Empty icon="file" title="Sin plantillas" text="Crea mensajes con variables y variantes para que cada envío suene distinto. Si usas IA en tus campañas, no las necesitas." />
          ) : (
            <div className="stack">
              {templates.map((t) => (
                <div key={t.id} className="card tight">
                  <div className="row">
                    <b className="grow ellipsis">{t.name}</b>
                    <Button size="sm" variant="ghost" iconOnly icon="edit" title="Editar" onClick={() => setEditing(t)} />
                    <ConfirmButton size="sm" onConfirm={() => persist(templates.filter((x) => x.id !== t.id))} confirmLabel="¿Borrar?" />
                  </div>
                  <div className="muted" style={{ whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.body}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
