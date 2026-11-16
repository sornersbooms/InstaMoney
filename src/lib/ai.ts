import type { Lead, Settings } from './types';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

async function chat(settings: Settings, system: string, user: string, temperature = 0.8): Promise<string> {
  if (!settings.groqApiKey) throw new Error('Falta la API key de Groq (Ajustes).');
  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.groqApiKey}` },
    body: JSON.stringify({
      model: settings.groqModel,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq (${response.status}): ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  return String(data.choices?.[0]?.message?.content ?? '').trim();
}

function clean(text: string): string {
  return text
    .replace(/^["'«]+/, '')
    .replace(/["'»]+$/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** La IA no tenía con qué escribir algo genuino: la acción se omite (no es un error). */
export class AiSkip extends Error {}

const SKIP_WORD = 'OMITIR';

/**
 * Respuestas que NUNCA deben publicarse ni enviarse: negativas o explicaciones de la propia IA
 * ("Lo siento, no puedo…", "Como modelo de lenguaje…", "Aquí tienes…").
 */
const NOT_A_MESSAGE: RegExp[] = [
  /\blo siento\b/i,
  /\bno puedo (crear|escribir|generar|ayudar|comentar|hacer)\b/i,
  /\bno es posible\b/i,
  /\bsin (conocer|contexto|más información|mas información|mas informacion)\b/i,
  /\bsin ver (la|el|los|las)\b/i,
  /\bcomo (modelo|ia|inteligencia artificial|asistente)\b/i,
  /\b(i'?m sorry|i can'?t|i cannot|as an ai|language model)\b/i,
  /^aqu[ií] (tienes|est[aá])\b/i,
  /\b(publicaci[oó]n|imagen|contenido) no (tiene|incluye|muestra)\b/i,
  /\b(el|la) (contenido|texto|descripci[oó]n) de la publicaci[oó]n\b/i,
  /[{}[\]]/,
];

/** Comprueba la salida de la IA antes de usarla. Lanza AiSkip si no sirve. */
function validate(text: string, maxLen: number): string {
  if (!text || text.toUpperCase().includes(SKIP_WORD)) throw new AiSkip('la IA no tenía suficiente contexto');
  if (NOT_A_MESSAGE.some((re) => re.test(text))) throw new AiSkip(`la IA respondió algo que no es un mensaje («${text.slice(0, 60)}…»)`);
  if (text.length > maxLen) throw new AiSkip('la respuesta de la IA era demasiado larga');
  return text;
}

function profileContext(lead: Lead): string {
  const captions = lead.recentCaptions?.length
    ? `Textos de sus últimas publicaciones:\n- ${lead.recentCaptions.slice(0, 3).map((c) => c.slice(0, 280)).join('\n- ')}`
    : '';
  return [
    `Usuario: @${lead.username}`,
    lead.fullName ? `Nombre: ${lead.fullName}` : '',
    lead.bio ? `Biografía: ${lead.bio}` : 'Biografía: (vacía)',
    captions,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Primer mensaje personalizado a partir de la bio y las últimas publicaciones del prospecto. */
export async function generateOpener(lead: Lead, settings: Settings, extraPrompt = ''): Promise<string> {
  const system = [
    'Escribes el primer mensaje directo (DM) de Instagram para iniciar una conversación con un posible cliente.',
    'Reglas: máximo 2-3 frases cortas, tono cercano y humano, nada de lenguaje de vendedor ni enlaces.',
    'Menciona algo concreto de su perfil o publicaciones para que se note que no es un mensaje masivo.',
    'Termina con una pregunta abierta y sencilla. Escribe en el idioma de su perfil (por defecto español).',
    'Si hay pocos datos del perfil, escribe un saludo breve y natural relacionado con lo que ofrezco.',
    'Devuelve SOLO el texto del mensaje, sin comillas. Nunca expliques ni digas que te falta información.',
  ].join(' ');
  const user = [
    settings.aiOffer ? `Lo que ofrezco: ${settings.aiOffer}` : '',
    settings.icpKeywords ? `Mi cliente ideal: ${settings.icpKeywords}` : '',
    extraPrompt ? `Instrucciones extra: ${extraPrompt}` : '',
    '',
    profileContext(lead),
  ].join('\n');
  return validate(clean(await chat(settings, system, user)), 600);
}

/** Mensaje de seguimiento cuando el prospecto no respondió. */
export async function generateFollowUp(lead: Lead, settings: Settings, step: number, extraPrompt = ''): Promise<string> {
  const system =
    'Escribes un mensaje de seguimiento breve (1-2 frases) por DM de Instagram a alguien que no respondió. ' +
    'Sin presionar ni culpar, aporta un motivo nuevo para responder y termina con una pregunta fácil. ' +
    'Idioma del perfil (por defecto español). Devuelve SOLO el texto. Nunca expliques ni digas que te falta información.';
  const user = [
    settings.aiOffer ? `Lo que ofrezco: ${settings.aiOffer}` : '',
    `Este es el seguimiento número ${step + 1}.`,
    lead.lastMessageText ? `Mi último mensaje fue: "${lead.lastMessageText}"` : '',
    extraPrompt ? `Instrucciones extra: ${extraPrompt}` : '',
    '',
    profileContext(lead),
  ].join('\n');
  return validate(clean(await chat(settings, system, user)), 500);
}

/**
 * Comentario relevante para una publicación concreta. Recibe el texto de la publicación y la
 * descripción de la imagen; si no hay contexto suficiente, se omite (AiSkip) en vez de inventar.
 */
export async function generateComment(context: string, settings: Settings): Promise<string> {
  if (context.replace(/\s+/g, ' ').trim().length < 8) throw new AiSkip('la publicación no tiene texto ni descripción de la imagen');
  const system =
    'Escribes un comentario corto (máximo 12 palabras) y genuino para una publicación de Instagram, ' +
    'relacionado con su contenido. Sin hashtags, sin enlaces, sin autopromoción, como mucho un emoji. ' +
    'Idioma de la publicación (por defecto español). Devuelve SOLO el comentario. ' +
    `Si la información no basta para un comentario concreto y natural, responde exactamente ${SKIP_WORD}. ` +
    'Nunca expliques ni te disculpes.';
  return validate(clean(await chat(settings, system, `Publicación: ${context.slice(0, 700)}`, 0.9)), 160);
}
