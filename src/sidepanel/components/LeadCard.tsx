import { useState } from 'react';
import type { Lead, LeadStatus } from '@/lib/types';

interface Props {
  lead: Lead;
  onUpdate: (id: string, patch: Partial<Lead>) => void;
  onDelete: (id: string) => void;
  onMarkContacted: (lead: Lead) => void;
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  replied: 'Respondió',
  converted: 'Convertido',
  discarded: 'Descartado',
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: '#0095f6',
  contacted: '#f5a623',
  replied: '#7b61ff',
  converted: '#00a400',
  discarded: '#8e8e8e',
};

export function LeadCard({ lead, onUpdate, onDelete, onMarkContacted }: Props) {
  const [notes, setNotes] = useState(lead.notes);
  const [tagInput, setTagInput] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);

  function addTag() {
    if (!tagInput.trim()) return;
    onUpdate(lead.id, { tags: [...lead.tags, tagInput.trim()] });
    setTagInput('');
  }

  function handleStatusChange(status: LeadStatus) {
    if (status === 'contacted' && lead.status !== 'contacted') {
      onMarkContacted(lead);
    }
    onUpdate(lead.id, { status });
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {lead.profilePicUrl && !avatarFailed ? (
          <img
            src={lead.profilePicUrl}
            alt={lead.username}
            onError={() => setAvatarFailed(true)}
            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#dbdbdb',
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            {lead.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <a href={`https://www.instagram.com/${lead.username}/`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: 14, color: '#262626', textDecoration: 'none' }}>
            @{lead.username}
          </a>
          {lead.fullName && <div style={{ fontSize: 12, color: '#666' }}>{lead.fullName}</div>}
        </div>
        {typeof lead.score === 'number' && (
          <div title={lead.scoreReason} style={{ fontSize: 12, fontWeight: 700, color: lead.score >= 60 ? '#00a400' : lead.score >= 30 ? '#f5a623' : '#8e8e8e' }}>
            {lead.score}/100
          </div>
        )}
      </div>

      {lead.bio && <div style={{ fontSize: 12, color: '#444', background: '#f7f7f7', borderRadius: 6, padding: 6 }}>{lead.bio}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => handleStatusChange(status)}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 12,
              border: lead.status === status ? 'none' : '1px solid #ddd',
              background: lead.status === status ? STATUS_COLORS[status] : '#fff',
              color: lead.status === status ? '#fff' : '#444',
            }}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {lead.tags.map((tag) => (
          <span key={tag} style={{ fontSize: 11, background: '#eef', borderRadius: 10, padding: '2px 8px' }}>
            {tag}
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTag()}
          placeholder="+ tag"
          style={{ fontSize: 11, border: '1px dashed #ccc', borderRadius: 10, padding: '2px 8px', width: 60 }}
        />
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => onUpdate(lead.id, { notes })}
        placeholder="Notas..."
        rows={2}
        style={{ fontSize: 12, border: '1px solid #eee', borderRadius: 6, padding: 6, resize: 'vertical' }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#999' }}>
          Fuente: {lead.sourceType === 'followers_list' ? 'Seguidores' : lead.sourceType === 'post_comments' ? 'Comentarios' : 'Manual'}
        </span>
        <button onClick={() => onDelete(lead.id)} style={{ fontSize: 11, color: '#ed4956', background: 'none', border: 'none' }}>
          Eliminar
        </button>
      </div>
    </div>
  );
}
