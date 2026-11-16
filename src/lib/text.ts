import type { Lead } from './types';

/**
 * Rellena variables ({nombre}, {primer_nombre}, {username}) y resuelve spintax ({Hola|Buenas|Qué tal}),
 * para que cada mensaje salga ligeramente distinto y no se envíe el mismo texto a todos.
 */
export function renderMessage(template: string, lead: Partial<Lead> & { username: string }): string {
  const fullName = (lead.fullName ?? '').trim();
  const firstName = fullName.split(/\s+/)[0] || lead.username;
  const vars: Record<string, string> = {
    nombre: fullName || lead.username,
    primer_nombre: firstName,
    username: lead.username,
  };
  const withVars = template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
  return spin(withVars);
}

export function spin(text: string): string {
  let out = text;
  const re = /\{([^{}]*\|[^{}]*)\}/;
  for (let i = 0; i < 50 && re.test(out); i++) {
    out = out.replace(re, (_, body: string) => {
      const options = body.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  return out;
}

const STOPWORDS: Record<string, string[]> = {
  es: ['de', 'la', 'que', 'el', 'en', 'y', 'los', 'para', 'con', 'por', 'una', 'mi', 'tu', 'más', 'del', 'las', 'soy', 'vida', 'amor'],
  en: ['the', 'and', 'to', 'of', 'in', 'my', 'for', 'is', 'you', 'with', 'on', 'your', 'love', 'life', 'i', 'me', 'be'],
  pt: ['de', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'não', 'uma', 'os', 'meu', 'minha', 'você', 'sou', 'vida'],
};

/** Detección de idioma sencilla por palabras frecuentes. Devuelve undefined si no hay señal. */
export function detectLanguage(text: string): string | undefined {
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 3) return undefined;
  let best: string | undefined;
  let bestScore = 0;
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    const score = words.filter((w) => set.has(w)).length;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  if (best === 'es' || best === 'pt') {
    const lower = text.toLowerCase();
    if (/[ãõç]|você|não/.test(lower)) best = 'pt';
    else if (/[ñ¿¡]/.test(lower)) best = 'es';
  }
  return bestScore >= 2 ? best : undefined;
}

export function splitList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * Math.max(0, max - min));
}
