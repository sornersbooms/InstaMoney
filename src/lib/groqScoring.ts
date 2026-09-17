import type { Lead, Settings } from './types';

interface ScoreResult {
  username: string;
  score: number;
  reason: string;
}

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';

export interface GroqModel {
  id: string;
}

/**
 * Groq retira/renombra modelos con frecuencia (ej. llama-3.3-70b-versatile dejó de existir).
 * En vez de fijar un modelo por defecto que puede quedar obsoleto, dejamos que el usuario
 * consulte los modelos activos en su cuenta directamente desde Ajustes.
 */
export async function fetchGroqModels(apiKey: string): Promise<GroqModel[]> {
  const response = await fetch(GROQ_MODELS_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }
  const data = await response.json();
  const models: GroqModel[] = (data.data ?? [])
    .map((m: { id: string }) => ({ id: m.id }))
    .sort((a: GroqModel, b: GroqModel) => a.id.localeCompare(b.id));
  return models;
}

function buildPrompt(leads: Lead[], icpKeywords: string): string {
  const items = leads.map((l) => ({
    username: l.username,
    fullName: l.fullName ?? '',
    bio: l.bio ?? '',
  }));
  return [
    'Eres un asistente que califica prospectos de Instagram como potenciales clientes.',
    `Perfil de cliente ideal / palabras clave: "${icpKeywords || 'sin especificar, usa criterio general'}"`,
    'Para cada perfil de la lista, da un score de 0 a 100 de qué tan probable es que sea un cliente potencial,',
    'y una razón breve (máximo 12 palabras) en español.',
    'Responde ÚNICAMENTE con JSON válido, un array de objetos: [{"username": "...", "score": 0, "reason": "..."}]',
    'Perfiles:',
    JSON.stringify(items),
  ].join('\n');
}

export async function scoreLeadsWithGroq(leads: Lead[], settings: Settings): Promise<ScoreResult[]> {
  if (!settings.groqApiKey) {
    throw new Error('Falta configurar la API key de Groq en Ajustes.');
  }
  if (leads.length === 0) return [];

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.groqApiKey}`,
    },
    body: JSON.stringify({
      model: settings.groqModel,
      messages: [{ role: 'user', content: buildPrompt(leads, settings.icpKeywords) }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content ?? '[]';
  const parsed = parseScoreResponse(content);
  return parsed;
}

function parseScoreResponse(content: string): ScoreResult[] {
  try {
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : (parsed.results ?? parsed.leads ?? parsed.data ?? []);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item): item is ScoreResult => typeof item?.username === 'string')
      .map((item) => ({
        username: item.username,
        score: Math.max(0, Math.min(100, Number(item.score) || 0)),
        reason: String(item.reason ?? '').slice(0, 200),
      }));
  } catch {
    return [];
  }
}
