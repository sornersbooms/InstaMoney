import { updateLead } from '@/lib/storage';
import { emitWebhook } from '@/lib/webhooks';
import type { Lead, LeadSource, LeadStage, LeadStatus } from '@/lib/types';

export const STAGES: Array<{ id: LeadStage; label: string; color: string }> = [
  { id: 'frio', label: 'Frío', color: '#3b82f6' },
  { id: 'tibio', label: 'Tibio', color: '#f59e0b' },
  { id: 'caliente', label: 'Caliente', color: '#ef4444' },
  { id: 'cerrado', label: 'Cerrado', color: '#16a34a' },
  { id: 'perdido', label: 'Perdido', color: '#8b8a9e' },
];

export const stageOf = (lead?: Lead) => STAGES.find((s) => s.id === (lead?.stage ?? 'frio'))!;

export const STATUS_INFO: Record<LeadStatus, { label: string; tone: 'primary' | 'warning' | 'info' | 'success' | undefined }> = {
  new: { label: 'Nuevo', tone: 'primary' },
  contacted: { label: 'Contactado', tone: 'warning' },
  replied: { label: 'Respondió', tone: 'info' },
  converted: { label: 'Cliente', tone: 'success' },
  discarded: { label: 'Descartado', tone: undefined },
};

export const SOURCE_NAMES: Record<LeadSource, string> = {
  followers_list: 'Seguidores',
  following_list: 'Seguidos',
  post_likers: 'Likes',
  post_comments: 'Comentarios',
  hashtag: 'Hashtag',
  location: 'Ubicación',
  own_followers: 'Mis seguidores',
  new_follower: 'Nuevo seguidor',
  keyword_comment: 'Palabra clave',
  inbox: 'Bandeja',
  manual: 'Manual',
};

export async function setLeadStage(lead: Lead, stage: LeadStage) {
  if (lead.stage === stage) return;
  const patch: Partial<Lead> = { stage };
  if (stage === 'cerrado') patch.status = 'converted';
  if (stage === 'perdido') patch.status = 'discarded';
  await updateLead(lead.id, patch);
  emitWebhook('lead.stage_changed', { ...lead, ...patch }, { from: lead.stage ?? null, to: stage });
}

export function formatCount(n?: number): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`;
  return String(n);
}
