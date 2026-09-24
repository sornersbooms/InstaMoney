const BASE = 'https://api.groq.com/openai/v1';

async function chat(settings, messages, { json = false, temperature = 0.3 } = {}) {
  if (!settings.groqApiKey) throw new Error('Falta configurar la API key de Groq en Ajustes.');
  const response = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.groqApiKey}`,
    },
    body: JSON.stringify({
      model: settings.groqModel,
      messages,
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`Groq API error (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** Groq retira y renombra modelos seguido, así que la lista se consulta en vivo. */
async function listModels(apiKey) {
  if (!apiKey) throw new Error('Falta configurar la API key de Groq.');
  const response = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) {
    throw new Error(`Groq API error (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  return (data.data ?? []).map((m) => m.id).sort();
}

function leadSignals(lead) {
  return {
    username: lead.username,
    fullName: lead.fullName ?? '',
    bio: lead.bio ?? '',
    followerCount: lead.followerCount ?? null,
    externalLink: lead.externalLink ?? '',
  };
}

async function scoreLeads(leads, settings) {
  if (leads.length === 0) return [];
  const prompt = [
    'Eres un asistente que califica prospectos de Instagram como potenciales clientes.',
    `Perfil de cliente ideal / palabras clave: "${settings.icpKeywords || 'sin especificar, usa criterio general'}"`,
    'Para cada perfil de la lista, da un score de 0 a 100 de qué tan probable es que sea un cliente potencial,',
    'y una razón breve (máximo 12 palabras) en español.',
    'Si un perfil casi no tiene datos, puntúalo bajo y dilo en la razón.',
    'Responde ÚNICAMENTE con JSON válido: {"results": [{"username": "...", "score": 0, "reason": "..."}]}',
    'Perfiles:',
    JSON.stringify(leads.map(leadSignals)),
  ].join('\n');

  const content = await chat(settings, [{ role: 'user', content: prompt }], { json: true, temperature: 0.2 });
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : parsed.results ?? parsed.leads ?? parsed.data ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item.username === 'string')
    .map((item) => ({
      username: item.username,
      score: Math.max(0, Math.min(100, Number(item.score) || 0)),
      reason: String(item.reason ?? '').slice(0, 200),
    }));
}

/** Redacta un primer mensaje a medida del lead. Lo revisa y lo envía la persona. */
async function personalizeMessage(lead, settings, baseTemplate) {
  const prompt = [
    'Escribe un primer mensaje directo de Instagram, en español, para el siguiente prospecto.',
    'Reglas: máximo 45 palabras, tono cercano y natural, sin emojis excesivos, sin sonar a plantilla,',
    'sin promesas exageradas y sin pedir la venta en el primer mensaje. Menciona algo concreto del perfil',
    'si hay datos suficientes; si no los hay, escribe algo genérico pero humano.',
    settings.offer ? `Lo que ofrezco: "${settings.offer}"` : '',
    settings.icpKeywords ? `Mi cliente ideal: "${settings.icpKeywords}"` : '',
    baseTemplate ? `Usa esta plantilla como base y adáptala: "${baseTemplate}"` : '',
    `Datos del prospecto: ${JSON.stringify(leadSignals(lead))}`,
    'Responde solo con el texto del mensaje, sin comillas ni explicaciones.',
  ]
    .filter(Boolean)
    .join('\n');

  const content = await chat(settings, [{ role: 'user', content: prompt }], { temperature: 0.7 });
  return content.trim().replace(/^["']|["']$/g, '');
}

module.exports = { listModels, scoreLeads, personalizeMessage };
