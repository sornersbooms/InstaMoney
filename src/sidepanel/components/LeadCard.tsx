import { useState } from 'react';
import type { Lead, LeadStatus } from '@/lib/types';
import { Avatar, Badge, ConfirmButton, Icon, timeAgo } from '../ui';
import { formatCount, setLeadStage, SOURCE_NAMES, STAGES, stageOf, STATUS_INFO } from '../crm';

interface Props {
  lead: Lead;
  onUpdate: (id: string, patch: Partial<Lead>) => void;
  onDelete: (id: string) => void;
  onMarkContacted: (lead: Lead) => void;
}

export function LeadCard({ lead, onUpdate, onDelete, onMarkContacted }: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(lead.notes);
  const [tagInput, setTagInput] = useState('');
  const stage = stageOf(lead);
  const status = STATUS_INFO[lead.status];

  function addTag() {
    const t = tagInput.trim();
    if (!t || lead.tags.includes(t)) return setTagInput('');
    onUpdate(lead.id, { tags: [...lead.tags, t] });
    setTagInput('');
  }

  function setStatus(s: LeadStatus) {
    if (s === 'contacted' && lead.status !== 'contacted') onMarkContacted(lead);
    onUpdate(lead.id, { status: s });
  }

  const scoreTone = lead.score == null ? undefined : lead.score >= 60 ? 'success' : lead.score >= 30 ? 'warning' : undefined;

  return (
    <div className="card tight" style={{ borderLeft: `3px solid ${stage.color}` }}>
      <div className="row" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <Avatar src={lead.profilePicUrl} name={lead.username} />
        <div className="grow">
          <div className="row" style={{ gap: 6 }}>
            <b className="ellipsis" style={{ fontSize: 13 }}>@{lead.username}</b>
            {lead.isVerified && <Icon name="check" size={12} />}
          </div>
          <div className="muted ellipsis">
            {lead.fullName || SOURCE_NAMES[lead.sourceType]}
            {lead.followerCount != null && ` · ${formatCount(lead.followerCount)} seg.`}
          </div>
        </div>
        {lead.score != null && (
          <span title={lead.scoreReason}>
            <Badge tone={scoreTone}>{lead.score}</Badge>
          </span>
        )}
        <Badge tone={status.tone}>{status.label}</Badge>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} />
      </div>

      {open && (
        <div className="stack" style={{ gap: 10, marginTop: 6 }}>
          {lead.bio && <div style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>{lead.bio}</div>}
          {lead.scoreReason && (
            <div className="muted small row" style={{ gap: 5 }}>
              <Icon name="sparkles" size={13} /> {lead.scoreReason}
            </div>
          )}

          <div className="stack" style={{ gap: 5 }}>
            <span className="muted small" style={{ fontWeight: 600 }}>Etapa del embudo</span>
            <div className="chips">
              {STAGES.map((s) => (
                <button
                  key={s.id}
                  className="chip"
                  onClick={() => setLeadStage(lead, s.id)}
                  style={(lead.stage ?? 'frio') === s.id ? { background: s.color, borderColor: s.color, color: '#fff' } : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="stack" style={{ gap: 5 }}>
            <span className="muted small" style={{ fontWeight: 600 }}>Estado</span>
            <div className="chips">
              {(Object.keys(STATUS_INFO) as LeadStatus[]).map((s) => (
                <button key={s} className={`chip${lead.status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>
                  {STATUS_INFO[s].label}
                </button>
              ))}
            </div>
          </div>

          {(lead.contactedAt || lead.followedAt || lead.storyViewedAt || lead.likedAt) && (
            <div className="row wrap small" style={{ gap: 10, color: 'var(--text-2)' }}>
              {lead.storyViewedAt && <span className="row" style={{ gap: 4 }}><Icon name="eye" size={13} /> historia</span>}
              {lead.likedAt && <span className="row" style={{ gap: 4 }}><Icon name="heart" size={13} /> like</span>}
              {lead.followedAt && !lead.unfollowedAt && <span className="row" style={{ gap: 4 }}><Icon name="userPlus" size={13} /> seguido</span>}
              {lead.contactedAt && <span className="row" style={{ gap: 4 }}><Icon name="send" size={13} /> {timeAgo(lead.contactedAt)}</span>}
              {lead.followUpStep ? <span className="row" style={{ gap: 4 }}><Icon name="repeat" size={13} /> {lead.followUpStep} seg.</span> : null}
              {lead.repliedAt && <span className="row" style={{ gap: 4, color: 'var(--success)' }}><Icon name="message" size={13} /> respondió</span>}
            </div>
          )}

          <div className="row wrap" style={{ gap: 5 }}>
            {lead.tags.map((tag) => (
              <span key={tag} className="tag">
                <Icon name="tag" size={11} /> {tag}
                <button onClick={() => onUpdate(lead.id, { tags: lead.tags.filter((t) => t !== tag) })} aria-label={`Quitar ${tag}`}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
            <input
              className="input"
              style={{ height: 26, width: 110, fontSize: 12, padding: '2px 8px' }}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
              onBlur={addTag}
              placeholder="+ etiqueta"
            />
          </div>

          <textarea className="textarea" style={{ minHeight: 54 }} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== lead.notes && onUpdate(lead.id, { notes })} placeholder="Notas privadas…" />

          <div className="row">
            <a className="btn sm" href={`https://www.instagram.com/${lead.username}/`} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} /> Perfil
            </a>
            <a className="btn sm" href={`https://www.instagram.com/${lead.username}/`} target="_blank" rel="noreferrer">
              <Icon name="send" size={14} /> Mensaje
            </a>
            <span className="muted small grow" style={{ textAlign: 'right' }}>{SOURCE_NAMES[lead.sourceType]} · {timeAgo(lead.capturedAt)}</span>
            <ConfirmButton size="sm" onConfirm={() => onDelete(lead.id)} confirmLabel="¿Borrar?" />
          </div>
        </div>
      )}
    </div>
  );
}
