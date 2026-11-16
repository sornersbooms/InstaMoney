export type LeadStatus = 'new' | 'contacted' | 'replied' | 'converted' | 'discarded';

/** Etapa del embudo en el CRM interno (temperatura del prospecto). */
export type LeadStage = 'frio' | 'tibio' | 'caliente' | 'cerrado' | 'perdido';

export type LeadSource =
  | 'followers_list'
  | 'following_list'
  | 'post_likers'
  | 'post_comments'
  | 'hashtag'
  | 'location'
  | 'own_followers'
  | 'new_follower'
  | 'keyword_comment'
  | 'inbox'
  | 'manual';

export interface Lead {
  id: string;
  username: string;
  userId?: string;
  fullName?: string;
  bio?: string;
  profilePicUrl?: string;
  followerCount?: number;
  followingCount?: number;
  mediaCount?: number;
  isBusiness?: boolean;
  isPrivate?: boolean;
  isVerified?: boolean;
  language?: string;
  lastPostAt?: number;
  recentCaptions?: string[];
  sourceType: LeadSource;
  sourceRef: string;
  campaignId?: string;
  capturedAt: number;
  status: LeadStatus;
  stage?: LeadStage;
  score?: number;
  scoreReason?: string;
  tags: string[];
  notes: string;
  // Historial de contacto
  contactedAt?: number;
  lastMessageAt?: number;
  lastMessageText?: string;
  repliedAt?: number;
  followUpStep?: number;
  threadId?: string;
  followedAt?: number;
  unfollowedAt?: number;
  likedAt?: number;
  commentedAt?: number;
  storyViewedAt?: number;
  closeFriendAt?: number;
}

export interface Template {
  id: string;
  name: string;
  body: string;
}

/** Nota de voz pregrabada (se guarda como data URL en chrome.storage.local). */
export interface VoiceNote {
  id: string;
  name: string;
  dataUrl: string;
  durationMs: number;
  createdAt: number;
}

export interface Settings {
  groqApiKey?: string;
  groqModel: string;
  icpKeywords: string;
  dailyContactSoftLimit: number;
  /** Qué vendes / ofreces: contexto para que la IA redacte mensajes y comentarios. */
  aiOffer?: string;
}

export interface DailyStats {
  date: string;
  contactedCount: number;
}

export const DEFAULT_SETTINGS: Settings = {
  groqApiKey: undefined,
  groqModel: 'llama-3.1-8b-instant',
  icpKeywords: '',
  dailyContactSoftLimit: 15,
  aiOffer: '',
};

/**
 * Cola de envío guiado (modo manual): recorre una lista de leads uno por uno con una plantilla
 * elegida. El envío de cada mensaje lo dispara la persona pulsando "Enviar" en Instagram.
 */
export interface SendQueueState {
  templateId: string;
  leadIds: string[];
  currentIndex: number;
  autoInsertPending: boolean;
}

export interface CapturedProfile {
  username: string;
  fullName?: string;
  bio?: string;
  profilePicUrl?: string;
  followerCount?: number;
  isBusiness?: boolean;
}

// ───────────────────────────── Automatización ─────────────────────────────

export type ActionKind =
  | 'dm'
  | 'voice'
  | 'follow'
  | 'unfollow'
  | 'like'
  | 'comment'
  | 'story'
  | 'closeFriends'
  | 'lookup';

export const ACTION_LABELS: Record<ActionKind, string> = {
  dm: 'Mensajes (DM)',
  voice: 'Notas de voz',
  follow: 'Seguir',
  unfollow: 'Dejar de seguir',
  like: 'Me gusta',
  comment: 'Comentarios',
  story: 'Historias vistas',
  closeFriends: 'Mejores amigos',
  lookup: 'Perfiles analizados',
};

export interface AutomationSettings {
  /** Pausa aleatoria entre acciones (segundos). */
  minDelaySec: number;
  maxDelaySec: number;
  /** Tras N acciones seguidas, descanso de M minutos. */
  restEveryActions: number;
  restMinutes: number;
  /** Horario activo (hora local, 0-23). Fuera de él el motor no actúa. */
  activeFromHour: number;
  activeToHour: number;
  /** Límites diarios por tipo de acción. */
  dailyLimits: Record<ActionKind, number>;
  /** Si Instagram bloquea/limita, pausa automática de X horas. */
  blockCooldownHours: number;
  /** Cada cuántos minutos revisar bandeja (respuestas), nuevos seguidores y comentarios. */
  monitorEveryMinutes: number;
}

export const DEFAULT_AUTOMATION: AutomationSettings = {
  minDelaySec: 60,
  maxDelaySec: 180,
  restEveryActions: 15,
  restMinutes: 30,
  activeFromHour: 9,
  activeToHour: 21,
  dailyLimits: {
    dm: 25,
    voice: 10,
    follow: 40,
    unfollow: 40,
    like: 80,
    comment: 20,
    story: 80,
    closeFriends: 50,
    lookup: 300,
  },
  blockCooldownHours: 6,
  monitorEveryMinutes: 10,
};

/** Filtros de segmentación aplicados a cada perfil antes de contactarlo. */
export interface SegmentFilter {
  bioInclude: string; // palabras separadas por coma (basta con una)
  bioExclude: string;
  minFollowers?: number;
  maxFollowers?: number;
  minFollowing?: number;
  maxFollowing?: number;
  minPosts?: number;
  /** Última publicación hace como máximo N días (actividad reciente). */
  activeWithinDays?: number;
  /** Idiomas aceptados (es, en, pt). Vacío = todos. */
  languages: string[];
  skipPrivate: boolean;
  skipVerified: boolean;
  onlyBusiness: boolean;
  /** Saltar a quien ya te sigue / ya sigues. */
  skipAlreadyConnected: boolean;
}

export const DEFAULT_FILTER: SegmentFilter = {
  bioInclude: '',
  bioExclude: '',
  languages: [],
  skipPrivate: true,
  skipVerified: true,
  onlyBusiness: false,
  skipAlreadyConnected: true,
};

export type CampaignSourceKind =
  | 'followers'
  | 'following'
  | 'likers'
  | 'commenters'
  | 'hashtag'
  | 'location'
  | 'own_followers'
  | 'existing_leads'
  | 'unfollow_non_followers';

export const SOURCE_LABELS: Record<CampaignSourceKind, string> = {
  followers: 'Seguidores de una cuenta (competencia)',
  following: 'Seguidos de una cuenta',
  likers: 'Quienes dieron like a una publicación',
  commenters: 'Quienes comentaron una publicación',
  hashtag: 'Hashtag',
  location: 'Ubicación',
  own_followers: 'Mis seguidores (reactivación)',
  existing_leads: 'Leads ya guardados',
  unfollow_non_followers: 'Dejar de seguir a quien no me sigue (seguidos por la extensión)',
};

export type MessageMode = 'template' | 'ai';

export interface FollowUpStep {
  afterHours: number;
  mode: MessageMode;
  templateId?: string;
  aiPrompt?: string;
  voiceNoteId?: string;
}

export interface CampaignActions {
  story: boolean;
  reactStory: boolean;
  like: number; // cuántas publicaciones recientes (0-3)
  comment: boolean;
  follow: boolean;
  dm: boolean;
  voice: boolean;
  closeFriends: boolean;
}

export interface Candidate {
  username: string;
  userId?: string;
  /** Contexto de origen (texto del comentario, etc.). */
  context?: string;
}

export interface WorkItem {
  id: string;
  leadId: string;
  username: string;
  userId?: string;
  action: ActionKind;
  /** Para follow-ups: índice del paso. */
  followUpIndex?: number;
  /** Texto ya decidido (bienvenida, palabra clave). */
  text?: string;
  templateId?: string;
  voiceNoteId?: string;
  campaignId?: string;
  /** Publicación objetivo (like / comentario). */
  mediaId?: string;
  caption?: string;
  replyToCommentId?: string;
  origin: 'campaign' | 'welcome' | 'keyword' | 'followup';
}

export interface CampaignStats {
  scanned: number;
  passed: number;
  rejected: number;
  errors: number;
  done: Partial<Record<ActionKind, number>>;
}

export interface Campaign {
  id: string;
  name: string;
  createdAt: number;
  status: 'draft' | 'running' | 'paused' | 'done';
  source: { kind: CampaignSourceKind; value: string; leadStatus?: LeadStatus | 'all'; leadTag?: string; unfollowAfterDays?: number };
  filters: SegmentFilter;
  actions: CampaignActions;
  message: { mode: MessageMode; templateIds: string[]; aiPrompt: string };
  voiceNoteId?: string;
  comment: { mode: MessageMode; options: string };
  followUps: FollowUpStep[];
  maxLeads: number;
  // Estado de ejecución
  cursor?: string | null;
  sourceExhausted?: boolean;
  candidates: Candidate[];
  work: WorkItem[];
  seenUserKeys: string[];
  stats: CampaignStats;
  lastError?: string;
}

export interface KeywordRule {
  id: string;
  keyword: string;
  enabled: boolean;
  /** Plantilla del DM que se envía. */
  dmText: string;
  /** Respuesta pública opcional en el comentario. */
  publicReply?: string;
  /** Solo en estas publicaciones (shortcodes/URLs). Vacío = las últimas publicaciones. */
  posts: string;
}

export interface Automations {
  welcome: { enabled: boolean; text: string; voiceNoteId?: string; addCloseFriends: boolean };
  keywordRules: KeywordRule[];
  keywordPostsToWatch: number;
  inboxSync: boolean;
}

export const DEFAULT_AUTOMATIONS: Automations = {
  welcome: { enabled: false, text: '¡Hola {nombre}! Gracias por seguirme 🙌 ¿Qué te llamó la atención de mi perfil?', addCloseFriends: false },
  keywordRules: [],
  keywordPostsToWatch: 6,
  inboxSync: true,
};

export interface EngineState {
  enabled: boolean;
  nextActionAt: number;
  pausedUntil: number;
  pauseReason?: string;
  actionsSinceRest: number;
  lastMonitorAt: number;
  /** IDs de seguidores conocidos (para detectar nuevos). */
  knownFollowerIds: string[];
  followersBaselineDone: boolean;
  /** Último pk de comentario procesado por publicación. */
  lastCommentPk: Record<string, string>;
  /** Usuarios ya respondidos por palabra clave: `${ruleId}:${userId}` */
  keywordHandled: string[];
  campaignCursor: number;
  ownUserId?: string;
  /** Trabajo de los monitores (bienvenida, palabra clave, seguimientos): va antes que las campañas. */
  systemWork: WorkItem[];
}

export const DEFAULT_ENGINE: EngineState = {
  enabled: false,
  nextActionAt: 0,
  pausedUntil: 0,
  actionsSinceRest: 0,
  lastMonitorAt: 0,
  knownFollowerIds: [],
  followersBaselineDone: false,
  lastCommentPk: {},
  keywordHandled: [],
  campaignCursor: 0,
  systemWork: [],
};

export interface ActionLogEntry {
  at: number;
  level: 'info' | 'ok' | 'warn' | 'error';
  action?: ActionKind | 'system';
  username?: string;
  text: string;
}

export interface ActionCounters {
  date: string;
  counts: Partial<Record<ActionKind, number>>;
}

export type WebhookEvent = 'lead.captured' | 'lead.contacted' | 'lead.replied' | 'lead.stage_changed' | 'followup.sent' | 'new_follower';

export const WEBHOOK_EVENTS: Array<{ id: WebhookEvent; label: string }> = [
  { id: 'lead.captured', label: 'Lead capturado (pasa filtros)' },
  { id: 'lead.contacted', label: 'Primer mensaje enviado' },
  { id: 'lead.replied', label: 'El prospecto respondió' },
  { id: 'lead.stage_changed', label: 'Cambio de etapa en el CRM' },
  { id: 'followup.sent', label: 'Seguimiento enviado' },
  { id: 'new_follower', label: 'Nuevo seguidor' },
];

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  secret?: string;
}

/** Conversación leída de la bandeja web (Instagram no expone el ID del chat ni el @usuario en la lista). */
export interface InboxThread {
  /** Nombre visible del chat (nombre completo o @usuario). */
  name: string;
  lastText: string;
  /** Aproximado: Instagram solo muestra "hace 2 h", "3 sem"... */
  lastAt: number;
  lastFromMe: boolean;
  unread: boolean;
}

function normName(s: string | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^@/, "").trim();
}

/** Lead al que corresponde un chat: por nombre completo o por @usuario. */
export function matchLeadForThread<T extends { username: string; fullName?: string }>(leads: T[], name: string): T | undefined {
  const n = normName(name);
  if (!n) return undefined;
  return leads.find((l) => normName(l.username) === n) ?? leads.find((l) => !!l.fullName && normName(l.fullName) === n);
}
