import { useEffect, useState } from 'react';
import { getAutomations, getVoiceNotes, saveAutomations } from '@/lib/storage';
import { uid } from '@/lib/text';
import { DEFAULT_AUTOMATIONS, type Automations, type KeywordRule, type VoiceNote } from '@/lib/types';
import { bg, Button, Callout, ConfirmButton, Field, Icon, NumberInput, PageHead, Switch, useToast } from '../ui';
import { useNav } from '../hooks';

export function AutomationsPanel() {
  const nav = useNav();
  const toast = useToast();
  const [a, setA] = useState<Automations>(DEFAULT_AUTOMATIONS);
  const [voices, setVoices] = useState<VoiceNote[]>([]);
  const [dirty, setDirty] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getAutomations().then(setA);
    getVoiceNotes().then(setVoices);
  }, []);

  const update = (next: Automations) => {
    setA(next);
    setDirty(true);
  };
  const setRule = (id: string, patch: Partial<KeywordRule>) => update({ ...a, keywordRules: a.keywordRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  async function save() {
    await saveAutomations(a);
    setDirty(false);
    toast('Automatizaciones guardadas');
  }

  async function checkNow() {
    if (dirty) await save();
    setChecking(true);
    const res = await bg({ type: 'DP_BG_MONITOR_NOW' });
    setChecking(false);
    toast(res?.ok ? 'Revisión hecha · mira Actividad' : (res?.error ?? 'No se pudo revisar'), !res?.ok);
  }

  return (
    <>
      <PageHead
        title="Automatizaciones"
        subtitle="Funcionan solas mientras el motor esté encendido"
        onBack={() => nav({ page: 'more' })}
        actions={<Button size="sm" variant="soft" icon="refresh" onClick={checkNow} disabled={checking}>{checking ? 'Revisando…' : 'Revisar ahora'}</Button>}
      />

      <div className="card">
        <div className="card-head">
          <div className="li-icon" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--success-soft)', color: 'var(--success)' }}>
            <Icon name="userPlus" size={17} />
          </div>
          <h3>
            Bienvenida a nuevos seguidores
            <span className="sub" style={{ display: 'block' }}>DM automático a quien empiece a seguirte</span>
          </h3>
          <Switch checked={a.welcome.enabled} onChange={(v) => update({ ...a, welcome: { ...a.welcome, enabled: v } })} label="Activar bienvenida" />
        </div>
        {a.welcome.enabled && (
          <>
            <Field hint={<>Variables: <code>{'{primer_nombre}'}</code> <code>{'{nombre}'}</code> <code>{'{username}'}</code> · variantes: <code>{'{Hola|Buenas}'}</code></>}>
              <textarea className="textarea" value={a.welcome.text} onChange={(e) => update({ ...a, welcome: { ...a.welcome, text: e.target.value } })} />
            </Field>
            {voices.length > 0 && (
              <Field label="Nota de voz (opcional)">
                <select className="select" value={a.welcome.voiceNoteId ?? ''} onChange={(e) => update({ ...a, welcome: { ...a.welcome, voiceNoteId: e.target.value || undefined } })}>
                  <option value="">Sin nota de voz</option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>🎤 {v.name}</option>
                  ))}
                </select>
              </Field>
            )}
            <Callout tone="info">Tus seguidores actuales no reciben nada: solo quienes te sigan desde que la activas.</Callout>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary-text)' }}>
            <Icon name="key" size={17} />
          </div>
          <h3>
            DM por palabra clave
            <span className="sub" style={{ display: 'block' }}>Comentan «INFO» en tu reel → les llega el DM</span>
          </h3>
        </div>
        {a.keywordRules.length === 0 && <div className="muted">Aún no tienes reglas. Ideal para reels con «comenta X y te lo envío».</div>}
        {a.keywordRules.map((r) => (
          <div key={r.id} className="card flat tight" style={{ background: 'var(--surface-2)', border: 'none' }}>
            <div className="row">
              <Switch checked={r.enabled} onChange={(v) => setRule(r.id, { enabled: v })} label="Regla activa" />
              <input className="input" style={{ fontWeight: 700, textTransform: 'uppercase' }} value={r.keyword} onChange={(e) => setRule(r.id, { keyword: e.target.value })} placeholder="PALABRA" />
              <ConfirmButton size="sm" onConfirm={() => update({ ...a, keywordRules: a.keywordRules.filter((x) => x.id !== r.id) })} confirmLabel="¿Quitar?" />
            </div>
            <Field label="Mensaje directo">
              <textarea className="textarea" value={r.dmText} onChange={(e) => setRule(r.id, { dmText: e.target.value })} placeholder="¡Hola {primer_nombre}! Aquí tienes la info que pediste: …" />
            </Field>
            <Field label="Respuesta pública (opcional)">
              <input className="input" value={r.publicReply ?? ''} onChange={(e) => setRule(r.id, { publicReply: e.target.value })} placeholder="¡Te escribí al DM! 📩" />
            </Field>
            <Field label="Solo en estas publicaciones (opcional)" hint="Enlaces separados por coma. Vacío = tus publicaciones recientes.">
              <input className="input" value={r.posts} onChange={(e) => setRule(r.id, { posts: e.target.value })} placeholder="https://www.instagram.com/reel/…" />
            </Field>
          </div>
        ))}
        <Button variant="soft" icon="plus" block onClick={() => update({ ...a, keywordRules: [...a.keywordRules, { id: uid('k'), keyword: '', enabled: true, dmText: '', publicReply: '', posts: '' }] })}>
          Añadir regla
        </Button>
        <Field label="Publicaciones recientes a vigilar">
          <NumberInput value={a.keywordPostsToWatch} min={1} max={24} onChange={(v) => update({ ...a, keywordPostsToWatch: v ?? 6 })} />
        </Field>
      </div>

      <div className="card">
        <div className="card-head">
          <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--info-soft)', color: 'var(--info)' }}>
            <Icon name="inbox" size={17} />
          </div>
          <h3>
            Detectar respuestas
            <span className="sub" style={{ display: 'block' }}>Marca «Respondió» y corta los seguimientos</span>
          </h3>
          <Switch checked={a.inboxSync} onChange={(v) => update({ ...a, inboxSync: v })} label="Detectar respuestas" />
        </div>
      </div>

      {dirty && (
        <div className="sticky-footer">
          <span className="muted grow" style={{ alignSelf: 'center' }}>Tienes cambios sin guardar</span>
          <Button variant="primary" icon="check" onClick={save}>Guardar</Button>
        </div>
      )}
    </>
  );
}
