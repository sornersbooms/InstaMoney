import { useEffect, useState } from 'react';
import { getAutomationSettings, getWebhooks, saveAutomationSettings, saveWebhooks } from '@/lib/storage';
import { uid } from '@/lib/text';
import { ACTION_LABELS, DEFAULT_AUTOMATION, WEBHOOK_EVENTS, type ActionKind, type AutomationSettings, type Webhook } from '@/lib/types';
import { Button, Callout, Check, ConfirmButton, Empty, Field, NumberInput, Segmented, Switch, useToast } from '../ui';

type Pace = 'safe' | 'balanced' | 'intense' | 'custom';

const PACES: Record<Exclude<Pace, 'custom'>, Partial<AutomationSettings> & { dm: number; follow: number; like: number }> = {
  safe: { minDelaySec: 120, maxDelaySec: 300, restEveryActions: 10, restMinutes: 45, dm: 15, follow: 25, like: 50 },
  balanced: { minDelaySec: 60, maxDelaySec: 180, restEveryActions: 15, restMinutes: 30, dm: 25, follow: 40, like: 80 },
  intense: { minDelaySec: 40, maxDelaySec: 110, restEveryActions: 25, restMinutes: 20, dm: 45, follow: 70, like: 140 },
};

function detectPace(a: AutomationSettings): Pace {
  for (const [id, p] of Object.entries(PACES)) {
    if (a.minDelaySec === p.minDelaySec && a.maxDelaySec === p.maxDelaySec && a.dailyLimits.dm === p.dm && a.dailyLimits.follow === p.follow) return id as Pace;
  }
  return 'custom';
}

/** Ritmo del motor: pausas, descansos, horario y límites diarios. */
export function PacingSettings() {
  const toast = useToast();
  const [a, setA] = useState<AutomationSettings>(DEFAULT_AUTOMATION);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getAutomationSettings().then(setA);
  }, []);

  const update = (next: AutomationSettings) => {
    setA(next);
    setDirty(true);
  };

  function applyPace(p: Pace) {
    if (p === 'custom') return;
    const { dm, follow, like, ...rest } = PACES[p];
    update({ ...a, ...rest, dailyLimits: { ...a.dailyLimits, dm, follow, unfollow: follow, like, story: like, comment: Math.round(dm * 0.8), voice: Math.round(dm * 0.4) } });
  }

  async function save() {
    const fixed = { ...a, maxDelaySec: Math.max(a.maxDelaySec, a.minDelaySec) };
    await saveAutomationSettings(fixed);
    setA(fixed);
    setDirty(false);
    toast('Ritmo guardado');
  }

  const pace = detectPace(a);
  const setLimit = (k: ActionKind, v?: number) => update({ ...a, dailyLimits: { ...a.dailyLimits, [k]: v ?? 0 } });

  return (
    <>
      <Field label="Perfil de ritmo" hint="Cuentas nuevas o poco activas: empieza en Prudente y sube poco a poco.">
        <Segmented
          value={pace}
          onChange={applyPace}
          options={[
            { value: 'safe', label: 'Prudente' },
            { value: 'balanced', label: 'Equilibrado' },
            { value: 'intense', label: 'Intenso' },
            ...(pace === 'custom' ? [{ value: 'custom' as Pace, label: 'Propio' }] : []),
          ]}
        />
      </Field>
      <div className="grid2">
        <Field label="Pausa mínima (s)">
          <NumberInput value={a.minDelaySec} min={20} onChange={(v) => update({ ...a, minDelaySec: v ?? 60 })} />
        </Field>
        <Field label="Pausa máxima (s)">
          <NumberInput value={a.maxDelaySec} min={20} onChange={(v) => update({ ...a, maxDelaySec: v ?? 180 })} />
        </Field>
        <Field label="Descansar cada (acciones)">
          <NumberInput value={a.restEveryActions} onChange={(v) => update({ ...a, restEveryActions: v ?? 0 })} />
        </Field>
        <Field label="Descanso (min)">
          <NumberInput value={a.restMinutes} min={1} onChange={(v) => update({ ...a, restMinutes: v ?? 30 })} />
        </Field>
        <Field label="Activo desde (h)">
          <NumberInput value={a.activeFromHour} min={0} max={23} onChange={(v) => update({ ...a, activeFromHour: v ?? 9 })} />
        </Field>
        <Field label="Hasta (h)">
          <NumberInput value={a.activeToHour} min={0} max={23} onChange={(v) => update({ ...a, activeToHour: v ?? 21 })} />
        </Field>
        <Field label="Pausa si hay bloqueo (h)">
          <NumberInput value={a.blockCooldownHours} min={1} onChange={(v) => update({ ...a, blockCooldownHours: v ?? 6 })} />
        </Field>
        <Field label="Revisar bandeja cada (min)">
          <NumberInput value={a.monitorEveryMinutes} min={3} onChange={(v) => update({ ...a, monitorEveryMinutes: v ?? 10 })} />
        </Field>
      </div>
      <div className="divider" />
      <b style={{ fontSize: 12.5 }}>Límites diarios</b>
      <div className="grid2">
        {(Object.keys(ACTION_LABELS) as ActionKind[]).map((k) => (
          <Field key={k} label={ACTION_LABELS[k]}>
            <NumberInput value={a.dailyLimits[k]} onChange={(v) => setLimit(k, v)} />
          </Field>
        ))}
      </div>
      <Button variant="primary" icon="check" block onClick={save} disabled={!dirty}>{dirty ? 'Guardar ritmo y límites' : 'Guardado'}</Button>
    </>
  );
}

/** Webhooks hacia herramientas externas. */
export function WebhookSettings() {
  const toast = useToast();
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getWebhooks().then(setHooks);
  }, []);

  const setHook = (id: string, patch: Partial<Webhook>) => {
    setHooks(hooks.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    setDirty(true);
  };

  async function persist(next: Webhook[]) {
    const valid = next.filter((h) => h.enabled && /^https?:\/\/.+/.test(h.url));
    let granted = true;
    try {
      const origins = [...new Set(valid.map((h) => `${new URL(h.url).origin}/*`))];
      if (origins.length) granted = await chrome.permissions.request({ origins });
    } catch {
      return toast('Alguna URL no es válida', true);
    }
    await saveWebhooks(next);
    setHooks(next);
    setDirty(false);
    toast(granted ? 'Webhooks guardados' : 'Guardados, pero Chrome no dio permiso para esos dominios', !granted);
  }

  async function test(h: Webhook) {
    try {
      const res = await fetch(h.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(h.secret ? { 'X-InstaMoney-Secret': h.secret } : {}) },
        body: JSON.stringify({ event: 'test', at: new Date().toISOString(), lead: { username: 'prueba', fullName: 'Lead de prueba' } }),
      });
      toast(`Prueba enviada · respuesta ${res.status}`, !res.ok);
    } catch {
      toast('No se pudo enviar. ¿Guardaste y diste permiso?', true);
    }
  }

  return (
    <>
      <div className="muted">Envía leads y eventos (POST JSON) a Make, Zapier, n8n, tu CRM, email marketing o WhatsApp.</div>
      {hooks.length === 0 && <Empty icon="link" title="Sin webhooks" />}
      {hooks.map((h) => (
        <div key={h.id} className="card flat tight" style={{ background: 'var(--surface-2)', border: 'none' }}>
          <div className="row">
            <Switch checked={h.enabled} onChange={(v) => setHook(h.id, { enabled: v })} label="Activo" />
            <input className="input" value={h.url} onChange={(e) => setHook(h.id, { url: e.target.value.trim() })} placeholder="https://hook.make.com/…" />
            <ConfirmButton size="sm" onConfirm={() => persist(hooks.filter((x) => x.id !== h.id))} confirmLabel="¿Quitar?" />
          </div>
          <input className="input" value={h.secret ?? ''} onChange={(e) => setHook(h.id, { secret: e.target.value })} placeholder="Secreto opcional (cabecera X-InstaMoney-Secret)" />
          <div className="stack" style={{ gap: 5 }}>
            {WEBHOOK_EVENTS.map((ev) => (
              <Check key={ev.id} checked={h.events.includes(ev.id)} onChange={(v) => setHook(h.id, { events: v ? [...h.events, ev.id] : h.events.filter((x) => x !== ev.id) })}>
                {ev.label}
              </Check>
            ))}
          </div>
          <Button size="sm" icon="send" onClick={() => test(h)} disabled={!h.url}>Enviar prueba</Button>
        </div>
      ))}
      <div className="row">
        <Button variant="soft" icon="plus" onClick={() => { setHooks([...hooks, { id: uid('h'), url: '', enabled: true, events: WEBHOOK_EVENTS.map((e) => e.id) }]); setDirty(true); }}>
          Añadir
        </Button>
        <div className="grow">
          <Button variant="primary" icon="check" block onClick={() => persist(hooks)} disabled={!dirty}>{dirty ? 'Guardar webhooks' : 'Guardado'}</Button>
        </div>
      </div>
      <Callout tone="info">Chrome te pedirá permiso para cada dominio la primera vez.</Callout>
    </>
  );
}
