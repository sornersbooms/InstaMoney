import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/types';
import { getSettings, saveSettings } from '@/lib/storage';
import { fetchGroqModels } from '@/lib/groqScoring';
import { PacingSettings, WebhookSettings } from './AutomationSettingsPanel';
import { Badge, Button, Callout, Field, Fold, NumberInput, PageHead, useToast } from '../ui';
import { useNav } from '../hooks';

export function SettingsPanel() {
  const nav = useNav();
  const toast = useToast();
  const [local, setLocal] = useState<Settings>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setLocal({ ...DEFAULT_SETTINGS, ...s }));
  }, []);

  const set = (patch: Partial<Settings>) => {
    setLocal({ ...local, ...patch });
    setDirty(true);
  };

  async function save() {
    await saveSettings(local);
    setDirty(false);
    toast('Ajustes de IA guardados');
  }

  async function loadModels() {
    if (!local.groqApiKey) return toast('Pega tu API key de Groq primero', true);
    setLoadingModels(true);
    try {
      const fetched = await fetchGroqModels(local.groqApiKey);
      setModels(fetched.map((m) => m.id));
      toast(fetched.length ? `${fetched.length} modelos disponibles` : 'Groq no devolvió modelos', !fetched.length);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al consultar Groq', true);
    } finally {
      setLoadingModels(false);
    }
  }

  const aiReady = !!local.groqApiKey && !!local.aiOffer;

  return (
    <>
      <PageHead title="Ajustes" subtitle="IA, ritmo del motor e integraciones" onBack={() => nav({ page: 'more' })} />

      <Fold icon="sparkles" title="Inteligencia artificial" sub="Mensajes, comentarios y puntuación de leads" defaultOpen={!aiReady}>
        <div className="row">
          <span className="grow muted">Estado</span>
          <Badge tone={aiReady ? 'success' : 'warning'}>{aiReady ? 'Lista' : 'Falta configurar'}</Badge>
        </div>
        <Field label="Qué ofreces" hint="La IA lo usa para que cada mensaje conecte con lo que vendes.">
          <textarea className="textarea" value={local.aiOffer ?? ''} onChange={(e) => set({ aiOffer: e.target.value })} placeholder="Ej. Soy coach de nutrición y ayudo a mamás a bajar de peso con un plan de 8 semanas." />
        </Field>
        <Field label="Tu cliente ideal" hint="Sirve para puntuar leads de 0 a 100.">
          <input className="input" value={local.icpKeywords} onChange={(e) => set({ icpKeywords: e.target.value })} placeholder="Ej. emprendedoras fitness, dueños de gimnasios" />
        </Field>
        <Field label="API key de Groq" hint={<>Gratis en <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com</a>. Se guarda solo en tu navegador.</>}>
          <div className="row">
            <input className="input" type={showKey ? 'text' : 'password'} value={local.groqApiKey ?? ''} onChange={(e) => set({ groqApiKey: e.target.value.trim() })} placeholder="gsk_…" />
            <Button iconOnly icon="eye" title={showKey ? 'Ocultar' : 'Mostrar'} onClick={() => setShowKey((v) => !v)} />
          </div>
        </Field>
        <Field label="Modelo" hint="Si ves «model_not_found», pulsa Ver modelos y elige uno actual.">
          <div className="row">
            {models.length > 0 ? (
              <select className="select" value={local.groqModel} onChange={(e) => set({ groqModel: e.target.value })}>
                {!models.includes(local.groqModel) && <option value={local.groqModel}>{local.groqModel}</option>}
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input className="input" value={local.groqModel} onChange={(e) => set({ groqModel: e.target.value })} />
            )}
            <Button icon="refresh" onClick={loadModels} disabled={loadingModels}>{loadingModels ? '…' : 'Ver modelos'}</Button>
          </div>
        </Field>
        <Field label="Meta diaria de contactos" hint="Solo informativa: aparece en la pantalla de Leads.">
          <NumberInput value={local.dailyContactSoftLimit} min={1} onChange={(v) => set({ dailyContactSoftLimit: v ?? 15 })} />
        </Field>
        <Button variant="primary" icon="check" block onClick={save} disabled={!dirty}>
          {dirty ? 'Guardar ajustes de IA' : 'Guardado'}
        </Button>
      </Fold>

      <Fold icon="shield" title="Ritmo y seguridad" sub="Pausas, horario y límites diarios">
        <PacingSettings />
      </Fold>

      <Fold icon="link" title="Integraciones" sub="Webhooks hacia CRM, email o WhatsApp">
        <WebhookSettings />
      </Fold>

      <Callout tone="warning">
        <b>Úsalo con criterio.</b> Automatizar acciones va contra las normas de Instagram y puede causar bloqueos o la pérdida de la
        cuenta. Usa pausas largas, límites bajos en cuentas nuevas y mensajes personalizados. Escribir en masa a desconocidos puede
        considerarse spam según la ley de cada país.
      </Callout>
    </>
  );
}
