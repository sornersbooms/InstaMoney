import { useEffect, useState } from 'react';
import { getTemplates, getVoiceNotes } from '@/lib/storage';
import { uid } from '@/lib/text';
import {
  DEFAULT_FILTER,
  SOURCE_LABELS,
  type ActionKind,
  type Campaign,
  type CampaignSourceKind,
  type FollowUpStep,
  type SegmentFilter,
  type Template,
  type VoiceNote,
} from '@/lib/types';
import {
  Badge,
  bg,
  Button,
  Callout,
  Check,
  Chip,
  Empty,
  Field,
  Icon,
  Menu,
  NumberInput,
  PageHead,
  Progress,
  Segmented,
  ToggleRow,
  timeAgo,
  useToast,
  type IconName,
} from '../ui';
import { useCampaigns, useNav } from '../hooks';

// ───────────────────────────── objetivos predefinidos ─────────────────────────────

type PresetId = 'competitors' | 'post' | 'discover' | 'reactivate' | 'warmup' | 'cleanup';

const PRESETS: Array<{ id: PresetId; icon: IconName; title: string; desc: string; color: string; bg: string }> = [
  { id: 'competitors', icon: 'target', title: 'Seguidores de la competencia', desc: 'Escribe a quien sigue a cuentas de tu nicho', color: 'var(--primary-text)', bg: 'var(--primary-soft)' },
  { id: 'post', icon: 'heart', title: 'Interacción en un post', desc: 'Quienes dieron like o comentaron', color: '#d63cbf', bg: 'color-mix(in srgb, #d63cbf 14%, transparent)' },
  { id: 'discover', icon: 'hash', title: 'Hashtag o ubicación', desc: 'Perfiles que publican sobre un tema o lugar', color: 'var(--info)', bg: 'var(--info-soft)' },
  { id: 'reactivate', icon: 'repeat', title: 'Reactivar mis seguidores', desc: 'Mensaje a tu base actual de seguidores', color: 'var(--success)', bg: 'var(--success-soft)' },
  { id: 'warmup', icon: 'flame', title: 'Calentar con engagement', desc: 'Historias, likes y follow sin escribir', color: 'var(--warning)', bg: 'var(--warning-soft)' },
  { id: 'cleanup', icon: 'userMinus', title: 'Limpiar seguidos', desc: 'Deja de seguir a quien no te devolvió el follow', color: 'var(--text-2)', bg: 'var(--surface-2)' },
];

function blankCampaign(): Campaign {
  return {
    id: uid('c'),
    name: '',
    createdAt: Date.now(),
    status: 'draft',
    source: { kind: 'followers', value: '', leadStatus: 'all', unfollowAfterDays: 3 },
    filters: { ...DEFAULT_FILTER },
    actions: { story: true, reactStory: false, like: 1, comment: false, follow: false, dm: true, voice: false, closeFriends: false },
    message: { mode: 'ai', templateIds: [], aiPrompt: '' },
    comment: { mode: 'ai', options: '' },
    followUps: [],
    maxLeads: 50,
    cursor: null,
    sourceExhausted: false,
    candidates: [],
    work: [],
    seenUserKeys: [],
    stats: { scanned: 0, passed: 0, rejected: 0, errors: 0, done: {} },
  };
}

function applyPreset(id: PresetId): Campaign {
  const c = blankCampaign();
  const off = { story: false, reactStory: false, like: 0, comment: false, follow: false, dm: false, voice: false, closeFriends: false };
  switch (id) {
    case 'competitors':
      return { ...c, name: 'Seguidores de la competencia', source: { ...c.source, kind: 'followers' }, followUps: [{ afterHours: 48, mode: 'ai' }] };
    case 'post':
      return { ...c, name: 'Interacción en publicación', source: { ...c.source, kind: 'likers' } };
    case 'discover':
      return { ...c, name: 'Prospectos por hashtag', source: { ...c.source, kind: 'hashtag' }, filters: { ...c.filters, activeWithinDays: 30 } };
    case 'reactivate':
      return { ...c, name: 'Reactivación de seguidores', source: { ...c.source, kind: 'own_followers' }, actions: { ...off, dm: true }, filters: { ...c.filters, skipAlreadyConnected: false }, maxLeads: 100 };
    case 'warmup':
      return { ...c, name: 'Calentamiento', source: { ...c.source, kind: 'followers' }, actions: { ...off, story: true, reactStory: true, like: 2, follow: true }, maxLeads: 80 };
    case 'cleanup':
      return { ...c, name: 'Limpieza de seguidos', source: { ...c.source, kind: 'unfollow_non_followers' }, actions: off, maxLeads: 200 };
  }
}

const SOURCE_ICON: Record<CampaignSourceKind, IconName> = {
  followers: 'users',
  following: 'users',
  likers: 'heart',
  commenters: 'message',
  hashtag: 'hash',
  location: 'pin',
  own_followers: 'repeat',
  existing_leads: 'tag',
  unfollow_non_followers: 'userMinus',
};

const DONE_ICON: Partial<Record<ActionKind, IconName>> = { dm: 'send', follow: 'userPlus', like: 'heart', comment: 'message', story: 'eye', voice: 'mic', closeFriends: 'star', unfollow: 'userMinus' };

const STATUS: Record<Campaign['status'], { label: string; tone?: 'success' | 'warning' | 'primary' }> = {
  draft: { label: 'Borrador' },
  running: { label: 'En marcha', tone: 'success' },
  paused: { label: 'Pausada', tone: 'warning' },
  done: { label: 'Terminada', tone: 'primary' },
};

// ───────────────────────────── lista ─────────────────────────────

export function Campaigns({ startNew }: { startNew?: boolean }) {
  const campaigns = useCampaigns();
  const toast = useToast();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ campaign: Campaign; isNew: boolean } | null>(startNew ? { campaign: blankCampaign(), isNew: true } : null);

  if (editing) return <Wizard initial={editing.campaign} isNew={editing.isNew} onClose={() => setEditing(null)} />;

  async function setStatus(c: Campaign, status: Campaign['status']) {
    await bg({ type: 'DP_BG_CAMPAIGN_STATUS', id: c.id, status });
    toast(status === 'running' ? 'Campaña en marcha' : 'Campaña pausada');
  }

  function duplicate(c: Campaign) {
    const fresh = blankCampaign();
    setEditing({
      isNew: true,
      campaign: { ...structuredClone(c), id: fresh.id, name: `${c.name} (copia)`, status: 'draft', createdAt: Date.now(), cursor: null, sourceExhausted: false, candidates: [], work: [], seenUserKeys: [], stats: fresh.stats, lastError: undefined },
    });
  }

  return (
    <>
      <PageHead
        title="Campañas"
        subtitle="Prospección automática por objetivos"
        actions={campaigns.length > 0 && <Button variant="brand" icon="plus" onClick={() => setEditing({ campaign: blankCampaign(), isNew: true })}>Nueva</Button>}
      />
      {campaigns.length === 0 && (
        <div className="card">
          <Empty
            icon="rocket"
            title="Crea tu primera campaña"
            text="Elige un objetivo (por ejemplo, escribir a los seguidores de tu competencia) y el motor hará el resto con ritmo humano."
            action={<Button variant="brand" icon="plus" size="lg" onClick={() => setEditing({ campaign: blankCampaign(), isNew: true })}>Nueva campaña</Button>}
          />
        </div>
      )}
      {campaigns.map((c) => {
        const st = STATUS[c.status];
        const done = (Object.entries(c.stats.done) as Array<[ActionKind, number]>).filter(([a, n]) => n && DONE_ICON[a]);
        return (
          <div key={c.id} className="card">
            <div className="card-head">
              <div className="grow" style={{ minWidth: 0 }}>
                <h3 className="ellipsis" style={{ margin: 0, fontSize: 14 }}>{c.name}</h3>
                <div className="muted row" style={{ gap: 5, marginTop: 2 }}>
                  <Icon name={SOURCE_ICON[c.source.kind]} size={13} />
                  <span className="ellipsis">{c.source.value || SOURCE_LABELS[c.source.kind]}</span>
                </div>
              </div>
              <Badge tone={st.tone} pulse={c.status === 'running'}>{st.label}</Badge>
              <Menu
                items={[
                  { label: 'Editar', icon: 'edit', onClick: () => setEditing({ campaign: c, isNew: false }) },
                  { label: 'Duplicar', icon: 'copy', onClick: () => duplicate(c) },
                  { label: 'Eliminar', icon: 'trash', danger: true, onClick: () => setDeleting(c.id) },
                ]}
              />
            </div>
            <div className="stack" style={{ gap: 5 }}>
              <div className="row between small">
                <span className="muted">Prospectos aptos</span>
                <b>
                  {c.stats.passed} <span className="muted">/ {c.maxLeads}</span>
                </b>
              </div>
              <Progress value={c.stats.passed} max={c.maxLeads} tone="success" />
              <div className="muted small">
                {c.stats.scanned} analizados · {c.stats.rejected} descartados
                {c.candidates.length > 0 && ` · ${c.candidates.length} en espera`}
                {c.work.length > 0 && ` · ${c.work.length} acciones pendientes`}
              </div>
            </div>
            {done.length > 0 && (
              <div className="row wrap" style={{ gap: 10 }}>
                {done.map(([a, n]) => (
                  <span key={a} className="row small" style={{ gap: 4, color: 'var(--text-2)' }}>
                    <Icon name={DONE_ICON[a]!} size={13} /> <b>{n}</b>
                  </span>
                ))}
              </div>
            )}
            {c.lastError && <Callout tone="danger">{c.lastError}</Callout>}
            {deleting === c.id && (
              <div className="callout danger" style={{ alignItems: 'center' }}>
                <span className="grow">¿Eliminar esta campaña? Los leads captados se conservan.</span>
                <Button size="sm" onClick={() => setDeleting(null)}>No</Button>
                <Button size="sm" variant="danger" onClick={async () => { await bg({ type: 'DP_BG_CAMPAIGN_DELETE', id: c.id }); setDeleting(null); toast('Campaña eliminada'); }}>Eliminar</Button>
              </div>
            )}
            <div className="row">
              {c.status === 'running' ? (
                <Button icon="pause" onClick={() => setStatus(c, 'paused')}>Pausar</Button>
              ) : (
                <Button variant="success" icon="play" onClick={() => setStatus(c, 'running')}>
                  {c.status === 'draft' ? 'Iniciar' : 'Reanudar'}
                </Button>
              )}
              <Button variant="ghost" icon="edit" onClick={() => setEditing({ campaign: c, isNew: false })}>Editar</Button>
              <span className="muted small" style={{ marginLeft: 'auto' }}>{timeAgo(c.createdAt)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ───────────────────────────── asistente ─────────────────────────────

type StepId = 'goal' | 'source' | 'filters' | 'actions' | 'followups' | 'review';
const STEP_LABEL: Record<StepId, string> = { goal: 'Objetivo', source: 'Fuente', filters: 'Filtros', actions: 'Acciones', followups: 'Seguimiento', review: 'Revisar' };

function Wizard({ initial, isNew, onClose }: { initial: Campaign; isNew: boolean; onClose: () => void }) {
  const nav = useNav();
  const toast = useToast();
  const [c, setC] = useState<Campaign>(initial);
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [voices, setVoices] = useState<VoiceNote[]>([]);
  const isUnfollow = c.source.kind === 'unfollow_non_followers';
  const steps: StepId[] = [...(isNew ? (['goal'] as StepId[]) : []), 'source', ...(isUnfollow ? [] : (['filters', 'actions', 'followups'] as StepId[])), 'review'];
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const [error, setError] = useState('');

  useEffect(() => {
    getTemplates().then(setTemplates);
    getVoiceNotes().then(setVoices);
  }, []);

  const set = (patch: Partial<Campaign>) => setC((prev) => ({ ...prev, ...patch }));
  const setSource = (patch: Partial<Campaign['source']>) => set({ source: { ...c.source, ...patch } });
  const setActions = (patch: Partial<Campaign['actions']>) => set({ actions: { ...c.actions, ...patch } });
  const kind = c.source.kind;
  const needsValue = !['own_followers', 'existing_leads', 'unfollow_non_followers'].includes(kind);

  function validate(s: StepId): string {
    if (s === 'goal' && !preset) return 'Elige un objetivo para continuar.';
    if (s === 'source' && needsValue && !c.source.value.trim()) return 'Indica la fuente de los prospectos.';
    if (s === 'actions') {
      const a = c.actions;
      if (!a.story && !a.like && !a.comment && !a.follow && !a.dm && !a.voice && !a.closeFriends) return 'Activa al menos una acción.';
      if (a.dm && c.message.mode === 'template' && c.message.templateIds.length === 0) return 'Elige al menos una plantilla o usa la IA.';
      if (a.voice && !c.voiceNoteId) return 'Elige la nota de voz a enviar.';
      if (a.comment && c.comment.mode === 'template' && !c.comment.options.trim()) return 'Escribe al menos un comentario o usa la IA.';
    }
    if (s === 'followups' && c.followUps.some((f) => f.mode === 'template' && !f.templateId)) return 'Elige la plantilla de cada seguimiento.';
    return '';
  }

  function next() {
    const err = validate(step);
    setError(err);
    if (!err) setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  }

  async function save(start: boolean) {
    for (const s of steps) {
      const err = validate(s);
      if (err) {
        setError(err);
        setStepIdx(steps.indexOf(s));
        return;
      }
    }
    const final = { ...c, name: c.name.trim() || PRESETS.find((p) => p.id === preset)?.title || 'Campaña' };
    await bg({ type: 'DP_BG_CAMPAIGN_SAVE', campaign: final });
    if (start) await bg({ type: 'DP_BG_CAMPAIGN_STATUS', id: c.id, status: 'running' });
    toast(start ? 'Campaña guardada y en marcha' : 'Campaña guardada');
    onClose();
  }

  const updateStep = (i: number, patch: Partial<FollowUpStep>) => set({ followUps: c.followUps.map((st, j) => (j === i ? { ...st, ...patch } : st)) });

  return (
    <>
      <PageHead title={isNew ? 'Nueva campaña' : 'Editar campaña'} subtitle={`Paso ${stepIdx + 1} de ${steps.length} · ${STEP_LABEL[step]}`} onBack={onClose} />
      <div className="stepper">
        {steps.map((s, i) => (
          <button
            key={s}
            className={`step${i < stepIdx ? ' done' : ''}${i === stepIdx ? ' active' : ''}`}
            onClick={() => i < stepIdx && setStepIdx(i)}
            disabled={i > stepIdx}
          >
            <i />
            <span>{STEP_LABEL[s]}</span>
          </button>
        ))}
      </div>

      {step === 'goal' && (
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`preset${preset === p.id ? ' active' : ''}`}
              onClick={() => {
                setPreset(p.id);
                setC(applyPreset(p.id));
                setError('');
              }}
            >
              <div className="pi" style={{ background: p.bg, color: p.color }}>
                <Icon name={p.icon} size={17} />
              </div>
              <b>{p.title}</b>
              <span>{p.desc}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'source' && (
        <div className="card">
          <Field label="Nombre de la campaña">
            <input className="input" value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Seguidores de @competidor" />
          </Field>
          {(kind === 'followers' || kind === 'following') && (
            <>
              <Segmented
                value={kind}
                onChange={(v) => setSource({ kind: v })}
                options={[
                  { value: 'followers', label: 'Sus seguidores' },
                  { value: 'following', label: 'A quién sigue' },
                ]}
              />
              <Field label="Cuenta de referencia" hint="Una cuenta pública de tu nicho o de la competencia.">
                <input className="input" value={c.source.value} onChange={(e) => setSource({ value: e.target.value })} placeholder="@cuenta_competencia" />
              </Field>
            </>
          )}
          {(kind === 'likers' || kind === 'commenters') && (
            <>
              <Segmented
                value={kind}
                onChange={(v) => setSource({ kind: v })}
                options={[
                  { value: 'likers', label: 'Dieron like', icon: 'heart' },
                  { value: 'commenters', label: 'Comentaron', icon: 'message' },
                ]}
              />
              <Field label="Enlace de la publicación o reel" hint="Puede ser tuya o de otra cuenta.">
                <input className="input" value={c.source.value} onChange={(e) => setSource({ value: e.target.value })} placeholder="https://www.instagram.com/p/…" />
              </Field>
            </>
          )}
          {(kind === 'hashtag' || kind === 'location') && (
            <>
              <Segmented
                value={kind}
                onChange={(v) =>
                  setC((prev) => ({
                    ...prev,
                    source: { ...prev.source, kind: v, value: '' },
                    // Si el nombre es el automático, que siga a la fuente elegida.
                    name: /^Prospectos por (hashtag|ubicación)$/.test(prev.name) ? `Prospectos por ${v === 'hashtag' ? 'hashtag' : 'ubicación'}` : prev.name,
                  }))
                }
                options={[
                  { value: 'hashtag', label: 'Hashtag', icon: 'hash' },
                  { value: 'location', label: 'Ubicación', icon: 'pin' },
                ]}
              />
              {kind === 'hashtag' ? (
                <Field label="Hashtag">
                  <input className="input" value={c.source.value} onChange={(e) => setSource({ value: e.target.value })} placeholder="#emprendimiento" />
                </Field>
              ) : (
                <PlacePicker value={c.source.value} onChange={(value) => setSource({ value })} />
              )}
            </>
          )}
          {kind === 'own_followers' && <Callout tone="primary" icon="repeat">Se escribirá a tus seguidores actuales, empezando por los más recientes.</Callout>}
          {kind === 'existing_leads' && (
            <div className="grid2">
              <Field label="Estado">
                <select className="select" value={c.source.leadStatus ?? 'all'} onChange={(e) => setSource({ leadStatus: e.target.value as Campaign['source']['leadStatus'] })}>
                  <option value="all">Todos</option>
                  <option value="new">Nuevos</option>
                  <option value="contacted">Contactados</option>
                  <option value="replied">Respondieron</option>
                </select>
              </Field>
              <Field label="Etiqueta (opcional)">
                <input className="input" value={c.source.leadTag ?? ''} onChange={(e) => setSource({ leadTag: e.target.value })} />
              </Field>
            </div>
          )}
          {isUnfollow && (
            <Field label="Dejar de seguir si no te siguió de vuelta en" hint="Solo cuentas que siguió la extensión.">
              <div className="row">
                <NumberInput value={c.source.unfollowAfterDays} min={1} onChange={(v) => setSource({ unfollowAfterDays: v ?? 3 })} />
                <span className="muted">días</span>
              </div>
            </Field>
          )}
          <Field label={isUnfollow ? 'Máximo de cuentas' : 'Máximo de prospectos aptos'} hint="La campaña termina al llegar a este número.">
            <NumberInput value={c.maxLeads} min={1} onChange={(v) => set({ maxLeads: v ?? 50 })} />
          </Field>
        </div>
      )}

      {step === 'filters' && <FiltersStep f={c.filters} onChange={(filters) => set({ filters })} />}

      {step === 'actions' && (
        <div className="card">
          <div className="muted">Se ejecutan en este orden sobre cada prospecto, con una pausa humana entre cada una.</div>
          <div>
            <ToggleRow icon="eye" title="Ver sus historias" desc="Aparece en sus notificaciones de vistas" checked={c.actions.story} onChange={(v) => setActions({ story: v })}>
              <Check checked={c.actions.reactStory} onChange={(v) => setActions({ reactStory: v })}>Reaccionar con ❤️</Check>
            </ToggleRow>
            <ToggleRow icon="heart" title="Dar me gusta" desc="A sus publicaciones más recientes" checked={c.actions.like > 0} onChange={(v) => setActions({ like: v ? 1 : 0 })}>
              <Segmented
                value={String(c.actions.like || 1)}
                onChange={(v) => setActions({ like: Number(v) })}
                options={[
                  { value: '1', label: '1 post' },
                  { value: '2', label: '2 posts' },
                  { value: '3', label: '3 posts' },
                ]}
              />
            </ToggleRow>
            <ToggleRow icon="message" title="Comentar" desc="En su última publicación" checked={c.actions.comment} onChange={(v) => setActions({ comment: v })}>
              <Segmented
                value={c.comment.mode}
                onChange={(v) => set({ comment: { ...c.comment, mode: v } })}
                options={[
                  { value: 'ai', label: 'Con IA', icon: 'sparkles' },
                  { value: 'template', label: 'Mi lista' },
                ]}
              />
              {c.comment.mode === 'template' ? (
                <textarea className="textarea" value={c.comment.options} onChange={(e) => set({ comment: { ...c.comment, options: e.target.value } })} placeholder={'Uno por línea. Admite variantes:\n¡{Brutal|Qué buen} contenido! 🔥'} />
              ) : (
                <span className="muted small">La IA lee la publicación y escribe un comentario breve y relacionado.</span>
              )}
            </ToggleRow>
            <ToggleRow icon="userPlus" title="Seguir la cuenta" checked={c.actions.follow} onChange={(v) => setActions({ follow: v })} />
            <ToggleRow icon="send" title="Enviar mensaje directo" desc="El paso principal de la prospección" checked={c.actions.dm} onChange={(v) => setActions({ dm: v })}>
              <Segmented
                value={c.message.mode}
                onChange={(v) => set({ message: { ...c.message, mode: v } })}
                options={[
                  { value: 'ai', label: 'Personalizado con IA', icon: 'sparkles' },
                  { value: 'template', label: 'Plantillas' },
                ]}
              />
              {c.message.mode === 'ai' ? (
                <Field hint="La IA usa su bio y publicaciones + lo que ofreces (Ajustes).">
                  <textarea className="textarea" style={{ minHeight: 56 }} value={c.message.aiPrompt} onChange={(e) => set({ message: { ...c.message, aiPrompt: e.target.value } })} placeholder="Instrucciones extra (opcional). Ej.: tutéale y menciona mi clase gratis." />
                </Field>
              ) : templates.length === 0 ? (
                <Callout tone="warning">
                  Aún no tienes plantillas.{' '}
                  <a onClick={() => nav({ page: 'templates' })} style={{ cursor: 'pointer' }}>Crear una →</a>
                </Callout>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="muted small">Se rotan al azar entre las elegidas:</span>
                  {templates.map((t) => (
                    <Check
                      key={t.id}
                      checked={c.message.templateIds.includes(t.id)}
                      onChange={(v) => set({ message: { ...c.message, templateIds: v ? [...c.message.templateIds, t.id] : c.message.templateIds.filter((x) => x !== t.id) } })}
                    >
                      {t.name}
                    </Check>
                  ))}
                </div>
              )}
            </ToggleRow>
            <ToggleRow icon="mic" title="Nota de voz" desc="Experimental · tras el mensaje" checked={c.actions.voice} onChange={(v) => setActions({ voice: v })}>
              {voices.length === 0 ? (
                <Callout tone="warning">
                  No tienes audios.{' '}
                  <a onClick={() => nav({ page: 'templates' })} style={{ cursor: 'pointer' }}>Subir uno →</a>
                </Callout>
              ) : (
                <select className="select" value={c.voiceNoteId ?? ''} onChange={(e) => set({ voiceNoteId: e.target.value || undefined })}>
                  <option value="">Elige un audio…</option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({Math.round(v.durationMs / 1000)} s)
                    </option>
                  ))}
                </select>
              )}
            </ToggleRow>
          </div>
        </div>
      )}

      {step === 'followups' && (
        <>
          <Callout tone="primary" icon="repeat">
            Si el prospecto no responde, se le envían estos mensajes en orden. En cuanto responde, se cortan solos.
          </Callout>
          {c.followUps.length === 0 && (
            <div className="card">
              <Empty icon="clock" title="Sin seguimientos" text="La mayoría de respuestas llegan en el 2.º o 3.er mensaje. Añade al menos uno." />
            </div>
          )}
          {c.followUps.map((st, i) => (
            <div key={i} className="card">
              <div className="card-head">
                <Badge tone="primary">#{i + 1}</Badge>
                <h3>Seguimiento</h3>
                <Button size="sm" iconOnly variant="danger-ghost" icon="trash" title="Quitar" onClick={() => set({ followUps: c.followUps.filter((_, j) => j !== i) })} />
              </div>
              <Field label="Enviar si no responde en">
                <div className="row">
                  <NumberInput value={st.afterHours} min={1} onChange={(v) => updateStep(i, { afterHours: v ?? 24 })} />
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>horas</span>
                </div>
              </Field>
              <Segmented
                value={st.mode}
                onChange={(v) => updateStep(i, { mode: v })}
                options={[
                  { value: 'ai', label: 'Con IA', icon: 'sparkles' },
                  { value: 'template', label: 'Plantilla' },
                ]}
              />
              {st.mode === 'template' ? (
                <select className="select" value={st.templateId ?? ''} onChange={(e) => updateStep(i, { templateId: e.target.value })}>
                  <option value="">Elige plantilla…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              ) : (
                <input className="input" value={st.aiPrompt ?? ''} onChange={(e) => updateStep(i, { aiPrompt: e.target.value })} placeholder="Instrucciones extra (opcional)" />
              )}
              {voices.length > 0 && (
                <select className="select" value={st.voiceNoteId ?? ''} onChange={(e) => updateStep(i, { voiceNoteId: e.target.value || undefined })}>
                  <option value="">Sin nota de voz</option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>🎤 {v.name}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          <Button variant="soft" icon="plus" block onClick={() => set({ followUps: [...c.followUps, { afterHours: c.followUps.length ? 72 : 48, mode: 'ai' }] })}>
            Añadir seguimiento
          </Button>
        </>
      )}

      {step === 'review' && <Review c={c} templates={templates} voices={voices} onEdit={(s) => setStepIdx(steps.indexOf(s))} />}

      {error && <Callout tone="danger">{error}</Callout>}

      <div className="sticky-footer">
        {stepIdx > 0 && <Button icon="chevronLeft" onClick={() => setStepIdx((i) => i - 1)}>Atrás</Button>}
        {step === 'review' ? (
          <>
            <Button onClick={() => save(false)}>Guardar</Button>
            <div className="grow">
              <Button variant="brand" icon="play" block onClick={() => save(true)}>Guardar e iniciar</Button>
            </div>
          </>
        ) : (
          <div className="grow">
            <Button variant="primary" block onClick={next}>
              Continuar <Icon name="chevronRight" size={15} />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function FiltersStep({ f, onChange }: { f: SegmentFilter; onChange: (f: SegmentFilter) => void }) {
  const set = (patch: Partial<SegmentFilter>) => onChange({ ...f, ...patch });
  const toggleLang = (l: string) => set({ languages: f.languages.includes(l) ? f.languages.filter((x) => x !== l) : [...f.languages, l] });
  return (
    <>
      <div className="card">
        <div className="card-head">
          <Icon name="filter" size={16} />
          <h3>Biografía</h3>
        </div>
        <Field label="Debe contener alguna de" hint="Separadas por comas. Vacío = sin filtro.">
          <input className="input" value={f.bioInclude} onChange={(e) => set({ bioInclude: e.target.value })} placeholder="coach, emprendedor, tienda" />
        </Field>
        <Field label="Descartar si contiene">
          <input className="input" value={f.bioExclude} onChange={(e) => set({ bioExclude: e.target.value })} placeholder="bot, sorteo, crypto" />
        </Field>
      </div>
      <div className="card">
        <div className="card-head">
          <Icon name="users" size={16} />
          <h3>Tamaño y actividad</h3>
        </div>
        <div className="grid2">
          <Field label="Seguidores mín.">
            <NumberInput value={f.minFollowers} onChange={(v) => set({ minFollowers: v })} placeholder="—" />
          </Field>
          <Field label="Seguidores máx.">
            <NumberInput value={f.maxFollowers} onChange={(v) => set({ maxFollowers: v })} placeholder="—" />
          </Field>
          <Field label="Seguidos mín.">
            <NumberInput value={f.minFollowing} onChange={(v) => set({ minFollowing: v })} placeholder="—" />
          </Field>
          <Field label="Seguidos máx.">
            <NumberInput value={f.maxFollowing} onChange={(v) => set({ maxFollowing: v })} placeholder="—" />
          </Field>
          <Field label="Publicaciones mín.">
            <NumberInput value={f.minPosts} onChange={(v) => set({ minPosts: v })} placeholder="—" />
          </Field>
          <Field label="Publicó hace ≤ (días)">
            <NumberInput value={f.activeWithinDays} onChange={(v) => set({ activeWithinDays: v })} placeholder="—" />
          </Field>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <Icon name="shield" size={16} />
          <h3>Tipo de cuenta e idioma</h3>
        </div>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {[
            ['es', 'Español'],
            ['en', 'Inglés'],
            ['pt', 'Portugués'],
          ].map(([id, label]) => (
            <Chip key={id} active={f.languages.includes(id)} onClick={() => toggleLang(id)}>
              {f.languages.includes(id) && <Icon name="check" size={12} />} {label}
            </Chip>
          ))}
          {f.languages.length === 0 && <span className="muted small" style={{ alignSelf: 'center' }}>Cualquier idioma</span>}
        </div>
        <Check checked={f.skipPrivate} onChange={(v) => set({ skipPrivate: v })}>Saltar cuentas privadas</Check>
        <Check checked={f.skipVerified} onChange={(v) => set({ skipVerified: v })}>Saltar cuentas verificadas</Check>
        <Check checked={f.onlyBusiness} onChange={(v) => set({ onlyBusiness: v })}>Solo cuentas profesionales</Check>
        <Check checked={f.skipAlreadyConnected} onChange={(v) => set({ skipAlreadyConnected: v })}>Saltar a quien ya sigo o me sigue</Check>
      </div>
    </>
  );
}

function Review({ c, templates, voices, onEdit }: { c: Campaign; templates: Template[]; voices: VoiceNote[]; onEdit: (s: StepId) => void }) {
  const a = c.actions;
  const actions = [
    a.story && `Ver historias${a.reactStory ? ' y reaccionar' : ''}`,
    a.like > 0 && `Like a ${a.like} publicación${a.like > 1 ? 'es' : ''}`,
    a.comment && `Comentar (${c.comment.mode === 'ai' ? 'IA' : 'lista'})`,
    a.follow && 'Seguir',
    a.dm && `DM ${c.message.mode === 'ai' ? 'personalizado con IA' : `con ${c.message.templateIds.length} plantilla(s)`}`,
    a.voice && `Nota de voz: ${voices.find((v) => v.id === c.voiceNoteId)?.name ?? '—'}`,
  ].filter(Boolean) as string[];
  const f = c.filters;
  const filters = [
    f.bioInclude && `Bio con: ${f.bioInclude}`,
    f.bioExclude && `Sin: ${f.bioExclude}`,
    (f.minFollowers != null || f.maxFollowers != null) && `Seguidores ${f.minFollowers ?? 0}–${f.maxFollowers ?? '∞'}`,
    f.activeWithinDays != null && `Activos últimos ${f.activeWithinDays} días`,
    f.languages.length > 0 && `Idioma: ${f.languages.join(', ')}`,
    f.skipPrivate && 'Sin privadas',
    f.onlyBusiness && 'Solo profesionales',
  ].filter(Boolean) as string[];
  const isUnfollow = c.source.kind === 'unfollow_non_followers';

  const Row = ({ icon, title, step, children }: { icon: IconName; title: string; step: StepId; children: React.ReactNode }) => (
    <div className="list-item">
      <div className="li-icon" style={{ background: 'var(--surface-2)' }}>
        <Icon name={icon} size={16} />
      </div>
      <div className="li-main">
        <b>{title}</b>
        <span>{children}</span>
      </div>
      <Button size="sm" variant="ghost" onClick={() => onEdit(step)}>Cambiar</Button>
    </div>
  );

  return (
    <>
      <div className="list">
        <Row icon={SOURCE_ICON[c.source.kind]} title="Fuente" step="source">
          {SOURCE_LABELS[c.source.kind]}
          {c.source.value ? ` · ${c.source.value}` : ''} · máx. {c.maxLeads}
        </Row>
        {!isUnfollow && (
          <>
            <Row icon="filter" title="Filtros" step="filters">{filters.length ? filters.join(' · ') : 'Sin filtros'}</Row>
            <Row icon="zap" title="Acciones" step="actions">{actions.join(' → ') || 'Ninguna'}</Row>
            <Row icon="repeat" title="Seguimientos" step="followups">
              {c.followUps.length
                ? c.followUps.map((s, i) => `#${i + 1} a las ${s.afterHours} h (${s.mode === 'ai' ? 'IA' : templates.find((t) => t.id === s.templateId)?.name ?? 'plantilla'})`).join(' · ')
                : 'Sin seguimientos'}
            </Row>
          </>
        )}
      </div>
      <Callout tone="info" icon="shield">
        El motor respeta tus límites diarios, horario y pausas (Ajustes → Ritmo). Debe estar <b>encendido</b> para que la campaña avance.
      </Callout>
    </>
  );
}

interface Place {
  id: string;
  name: string;
  subtitle: string;
}

/** Busca el lugar por nombre en Instagram y guarda su enlace con el ID (lo que necesita el motor). */
function PlacePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(() => value.replace(/\s*·\s*https?:\/\/\S+$/, ''));
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedId = /locations\/(\d+)/.exec(value)?.[1];

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    const res = await bg<{ ok: boolean; places?: Place[]; error?: string }>({ type: 'DP_BG_PLACES', query });
    setBusy(false);
    if (!res?.ok) return setError(res?.error ?? 'No se pudo buscar. ¿Está abierta la ventana de trabajo con tu sesión?');
    setPlaces(res.places ?? []);
  }

  return (
    <Field
      label="Ubicación"
      hint={selectedId ? undefined : 'Escribe la ciudad, barrio o lugar y pulsa Buscar. También puedes pegar el enlace del lugar.'}
    >
      <div className="row">
        <input
          className="input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
          placeholder="Ej. Medellín, Parque Lleras…"
        />
        <Button variant="soft" icon="search" onClick={search} disabled={busy || !query.trim()}>
          {busy ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>
      {error && <Callout tone="danger">{error}</Callout>}
      {places && places.length === 0 && <span className="muted small">No hay lugares con ese nombre.</span>}
      {places && places.length > 0 && (
        <div className="list" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {places.slice(0, 12).map((pl) => (
            <button
              key={pl.id}
              type="button"
              className="list-item"
              onClick={() => {
                onChange(`${pl.name} · https://www.instagram.com/explore/locations/${pl.id}/`);
                setQuery(pl.name);
                setPlaces(null);
              }}
            >
              <div className="li-icon" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
                <Icon name="pin" size={15} />
              </div>
              <div className="li-main">
                <b className="ellipsis">{pl.name}</b>
                {pl.subtitle && <span className="ellipsis">{pl.subtitle}</span>}
              </div>
              {selectedId === pl.id && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
      {selectedId && !places && (
        <Callout tone="primary" icon="pin">
          Lugar elegido: <b>{query}</b> (ID {selectedId})
        </Callout>
      )}
    </Field>
  );
}
