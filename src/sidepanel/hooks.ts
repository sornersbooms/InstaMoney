import { createContext, useContext, useEffect, useState } from 'react';
import {
  AUTO_KEYS,
  getActionCounters,
  getActionLog,
  getAutomationSettings,
  getCampaigns,
  getEngineState,
  getLeads,
  onKeyChanged,
  onLeadsChanged,
} from '@/lib/storage';
import {
  DEFAULT_AUTOMATION,
  DEFAULT_ENGINE,
  type ActionCounters,
  type ActionLogEntry,
  type AutomationSettings,
  type Campaign,
  type EngineState,
  type Lead,
} from '@/lib/types';

/** Lee una clave de storage y se mantiene al día con sus cambios. */
function useStored<T>(key: string, load: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    load().then((v) => alive && setValue(v));
    const off = onKeyChanged(key, () => load().then((v) => alive && setValue(v)));
    return () => {
      alive = false;
      off();
    };
  }, [key]);
  return value;
}

export const useEngine = () => useStored<EngineState>(AUTO_KEYS.engine, getEngineState, DEFAULT_ENGINE);
export const useAutomationSettings = () => useStored<AutomationSettings>(AUTO_KEYS.automation, getAutomationSettings, DEFAULT_AUTOMATION);
export const useCounters = () => useStored<ActionCounters>(AUTO_KEYS.counters, getActionCounters, { date: '', counts: {} });
export const useCampaigns = () => useStored<Campaign[]>(AUTO_KEYS.campaigns, getCampaigns, []);
export const useActivity = () => useStored<ActionLogEntry[]>(AUTO_KEYS.log, getActionLog, []);

export function useLeads(): Lead[] {
  const [leads, setLeads] = useState<Lead[]>([]);
  useEffect(() => {
    getLeads().then(setLeads);
    return onLeadsChanged(setLeads);
  }, []);
  return leads;
}

/** Reloj que avanza cada segundo (cuentas atrás). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ───────────────────────────── navegación ─────────────────────────────

export type Page = 'home' | 'campaigns' | 'leads' | 'inbox' | 'more' | 'auto' | 'templates' | 'activity' | 'settings';
export interface Route {
  page: Page;
  /** Parámetro opcional (p. ej. filtro de etapa en el CRM o campaña nueva). */
  param?: string;
}

export const NavCtx = createContext<(route: Route) => void>(() => undefined);
export const useNav = () => useContext(NavCtx);

// ───────────────────────────── estado del motor ─────────────────────────────

export function inActiveHours(s: AutomationSettings, now = Date.now()): boolean {
  const h = new Date(now).getHours();
  const { activeFromHour: from, activeToHour: to } = s;
  return from === to || (from < to ? h >= from && h < to : h >= from || h < to);
}

export function formatWait(sec: number): string {
  if (sec >= 3600) return `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`;
  if (sec >= 60) return `${Math.floor(sec / 60)} min ${sec % 60} s`;
  return `${sec} s`;
}

export type EngineMode = 'off' | 'paused' | 'offhours' | 'waiting' | 'working';

export function engineStatus(engine: EngineState, settings: AutomationSettings, now: number): { mode: EngineMode; title: string; detail: string } {
  if (!engine.enabled) return { mode: 'off', title: 'Motor apagado', detail: 'Enciéndelo para que tus campañas y automatizaciones trabajen solas.' };
  if (engine.pausedUntil > now) {
    const wait = Math.round((engine.pausedUntil - now) / 1000);
    return { mode: 'paused', title: `En pausa · ${formatWait(wait)}`, detail: engine.pauseReason ?? 'Pausa temporal.' };
  }
  if (!inActiveHours(settings, now))
    return { mode: 'offhours', title: 'Fuera de horario', detail: `Trabaja de ${settings.activeFromHour}:00 a ${settings.activeToHour}:00.` };
  const wait = Math.max(0, Math.round((engine.nextActionAt - now) / 1000));
  if (wait > 0) return { mode: 'waiting', title: 'Activo', detail: `Próxima acción en ${formatWait(wait)} (pausa humana).` };
  return { mode: 'working', title: 'Activo · trabajando', detail: 'Ejecutando la siguiente acción…' };
}
