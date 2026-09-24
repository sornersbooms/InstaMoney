import { useState } from 'react';

const STATUSES = [
  ['new', 'Nuevo', '#00f0ff'],
  ['contacted', 'Contactado', '#ffb02e'],
  ['replied', 'Respondió', '#a855f7'],
  ['converted', 'Convertido', '#b8ff3c'],
  ['discarded', 'Descartado', '#6b7194'],
];

const SOURCE_LABELS = {
  followers: 'Seguidores',
  following: 'Seguidos',
  likes: 'Likes',
  comments: 'Comentarios',
  hashtag: 'Hashtag',
};

function formatCount(value) {
  if (typeof value !== 'number') return null;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function scoreColors(score) {
  if (score >= 60) return { ring: '#b8ff3c', glow: 'rgba(184,255,60,.5)' };
  if (score >= 30) return { ring: '#ffb02e', glow: 'rgba(255,176,46,.5)' };
  return { ring: '#6b7194', glow: 'rgba(107,113,148,.4)' };
}

export function LeadCard({ lead, onUpdate, onDelete, onOpen }) {
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [tagInput, setTagInput] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);

  const followers = formatCount(lead.followerCount);
  const hasScore = typeof lead.score === 'number';
  const colors = hasScore ? scoreColors(lead.score) : null;

  return (
    <article className="card">
      <div className="lead-head">
        {lead.profilePicUrl && !avatarFailed ? (
          <img className="avatar" src={lead.profilePicUrl} alt={lead.username} onError={() => setAvatarFailed(true)} />
        ) : (
          <div className="avatar avatar-fallback">{lead.username.charAt(0).toUpperCase()}</div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <button className="lead-name" onClick={() => onOpen(lead)}>
            @{lead.username}
          </button>
          {lead.fullName && <div className="muted">{lead.fullName}</div>}
          {followers && <div className="muted">{followers} seguidores</div>}
        </div>

        {hasScore && (
          <div
            className="score-ring"
            title={lead.scoreReason}
            style={{ '--score': lead.score, '--ring': colors.ring, '--ring-glow': colors.glow }}
          >
            <span style={{ color: colors.ring }}>{lead.score}</span>
          </div>
        )}
      </div>

      {lead.bio && <div className="bio">{lead.bio}</div>}
      {lead.externalLink && (
        <div className="muted" style={{ wordBreak: 'break-all' }}>
          🔗 {lead.externalLink}
        </div>
      )}

      <div className="chips">
        {STATUSES.map(([value, label, color]) => (
          <button
            key={value}
            className={`chip ${lead.status === value ? 'active' : ''}`}
            style={lead.status === value ? { background: color, boxShadow: `0 0 16px ${color}66` } : undefined}
            onClick={() => onUpdate(lead.id, { status: value })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="chips">
        {(lead.tags ?? []).map((tag) => (
          <span key={tag} className="chip tag">
            {tag}
          </span>
        ))}
        <input
          className="chip-input"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && tagInput.trim()) {
              onUpdate(lead.id, { tags: [...(lead.tags ?? []), tagInput.trim()] });
              setTagInput('');
            }
          }}
          placeholder="+ tag"
        />
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== lead.notes && onUpdate(lead.id, { notes })}
        placeholder="Notas..."
        rows={2}
        style={{ resize: 'vertical' }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muted">
          {SOURCE_LABELS[lead.sourceType] ?? lead.sourceType}
          {lead.enrichedAt ? ' · perfil leído' : ''}
        </span>
        <button className="btn-ghost" onClick={() => onDelete(lead.id)}>
          Eliminar
        </button>
      </div>
    </article>
  );
}
