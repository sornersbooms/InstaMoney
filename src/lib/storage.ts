import { DEFAULT_SETTINGS, type DailyStats, type Lead, type Settings, type SendQueueState, type Template } from './types';

const KEYS = {
  leads: 'leads',
  settings: 'settings',
  templates: 'templates',
  dailyStats: 'dailyStats',
  sendQueue: 'sendQueue',
} as const;

async function get<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T) ?? fallback;
}

async function set(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getLeads(): Promise<Lead[]> {
  return get<Lead[]>(KEYS.leads, []);
}

export async function saveLeads(leads: Lead[]): Promise<void> {
  await set(KEYS.leads, leads);
}

export async function upsertLeads(newLeads: Lead[]): Promise<{ added: number; skipped: number }> {
  const existing = await getLeads();
  const existingUsernames = new Set(existing.map((l) => l.username.toLowerCase()));
  const toAdd = newLeads.filter((l) => !existingUsernames.has(l.username.toLowerCase()));
  await saveLeads([...toAdd, ...existing]);
  return { added: toAdd.length, skipped: newLeads.length - toAdd.length };
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<void> {
  const leads = await getLeads();
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return;
  leads[idx] = { ...leads[idx], ...patch };
  await saveLeads(leads);
}

export async function deleteLead(id: string): Promise<void> {
  const leads = await getLeads();
  await saveLeads(leads.filter((l) => l.id !== id));
}

export async function getSettings(): Promise<Settings> {
  return get<Settings>(KEYS.settings, DEFAULT_SETTINGS);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await set(KEYS.settings, settings);
}

export async function getTemplates(): Promise<Template[]> {
  return get<Template[]>(KEYS.templates, []);
}

export async function saveTemplates(templates: Template[]): Promise<void> {
  await set(KEYS.templates, templates);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodayStats(): Promise<DailyStats> {
  const all = await get<DailyStats[]>(KEYS.dailyStats, []);
  const today = todayKey();
  return all.find((s) => s.date === today) ?? { date: today, contactedCount: 0 };
}

export async function incrementContactedToday(): Promise<DailyStats> {
  const all = await get<DailyStats[]>(KEYS.dailyStats, []);
  const today = todayKey();
  const idx = all.findIndex((s) => s.date === today);
  if (idx === -1) {
    const stat = { date: today, contactedCount: 1 };
    all.push(stat);
    await set(KEYS.dailyStats, all);
    return stat;
  }
  all[idx].contactedCount += 1;
  await set(KEYS.dailyStats, all);
  return all[idx];
}

export function onLeadsChanged(callback: (leads: Lead[]) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'local' && changes[KEYS.leads]) {
      callback((changes[KEYS.leads].newValue as Lead[]) ?? []);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function getSendQueue(): Promise<SendQueueState | null> {
  return get<SendQueueState | null>(KEYS.sendQueue, null);
}

export async function saveSendQueue(queue: SendQueueState | null): Promise<void> {
  await set(KEYS.sendQueue, queue);
}

export function onSendQueueChanged(callback: (queue: SendQueueState | null) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'local' && changes[KEYS.sendQueue]) {
      callback((changes[KEYS.sendQueue].newValue as SendQueueState) ?? null);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ───────────────────────────── Automatización ─────────────────────────────

import {
  DEFAULT_AUTOMATION,
  DEFAULT_AUTOMATIONS,
  DEFAULT_ENGINE,
  type ActionCounters,
  type ActionKind,
  type ActionLogEntry,
  type AutomationSettings,
  type Automations,
  type Campaign,
  type EngineState,
  type VoiceNote,
  type Webhook,
} from './types';

export const AUTO_KEYS = {
  automation: 'automationSettings',
  automations: 'automations',
  campaigns: 'campaigns',
  engine: 'engineState',
  log: 'actionLog',
  counters: 'actionCounters',
  voiceNotes: 'voiceNotes',
  webhooks: 'webhooks',
} as const;

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const s = await get<Partial<AutomationSettings>>(AUTO_KEYS.automation, {});
  return { ...DEFAULT_AUTOMATION, ...s, dailyLimits: { ...DEFAULT_AUTOMATION.dailyLimits, ...(s.dailyLimits ?? {}) } };
}
export const saveAutomationSettings = (s: AutomationSettings) => set(AUTO_KEYS.automation, s);

export async function getAutomations(): Promise<Automations> {
  const a = await get<Partial<Automations>>(AUTO_KEYS.automations, {});
  return { ...DEFAULT_AUTOMATIONS, ...a, welcome: { ...DEFAULT_AUTOMATIONS.welcome, ...(a.welcome ?? {}) } };
}
export const saveAutomations = (a: Automations) => set(AUTO_KEYS.automations, a);

export const getCampaigns = () => get<Campaign[]>(AUTO_KEYS.campaigns, []);
export const saveCampaigns = (c: Campaign[]) => set(AUTO_KEYS.campaigns, c);

export async function getEngineState(): Promise<EngineState> {
  const e = await get<Partial<EngineState>>(AUTO_KEYS.engine, {});
  return { ...DEFAULT_ENGINE, ...e };
}
export const saveEngineState = (e: EngineState) => set(AUTO_KEYS.engine, e);

export const getVoiceNotes = () => get<VoiceNote[]>(AUTO_KEYS.voiceNotes, []);
export const saveVoiceNotes = (v: VoiceNote[]) => set(AUTO_KEYS.voiceNotes, v);

export const getWebhooks = () => get<Webhook[]>(AUTO_KEYS.webhooks, []);
export const saveWebhooks = (w: Webhook[]) => set(AUTO_KEYS.webhooks, w);

export const getActionLog = () => get<ActionLogEntry[]>(AUTO_KEYS.log, []);
export async function appendLog(entry: Omit<ActionLogEntry, 'at'>): Promise<void> {
  const log = await getActionLog();
  log.unshift({ ...entry, at: Date.now() });
  await set(AUTO_KEYS.log, log.slice(0, 400));
}
export const clearActionLog = () => set(AUTO_KEYS.log, []);

export async function getActionCounters(): Promise<ActionCounters> {
  const c = await get<ActionCounters | null>(AUTO_KEYS.counters, null);
  const today = todayKey();
  return c && c.date === today ? c : { date: today, counts: {} };
}
export async function bumpActionCounter(action: ActionKind): Promise<void> {
  const c = await getActionCounters();
  c.counts[action] = (c.counts[action] ?? 0) + 1;
  await set(AUTO_KEYS.counters, c);
}

/** Suscripción genérica a cambios de una clave de storage. */
export function onKeyChanged<T>(key: string, callback: (value: T) => void): () => void {
  const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'local' && changes[key]) callback(changes[key].newValue as T);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
