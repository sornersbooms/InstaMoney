/**
 * Solo para desarrollo: simula `chrome.*` para ver el panel en una pestaña normal (npm run dev →
 * http://localhost:5173/src/sidepanel/index.html). No se incluye en el build de producción.
 */
const now = Date.now();
const H = 3_600_000;
const names = [
  ['ana.fitcoach', 'Ana López', 'Coach fitness para mamás 💪 Planes online', 12400, 'tibio', 'replied'],
  ['carlos.emprende', 'Carlos Ruiz', 'Emprendedor digital | Tienda online de café ☕', 3100, 'frio', 'contacted'],
  ['lu.nutricion', 'Lucía Martín', 'Nutricionista · Recetas saludables', 28900, 'caliente', 'replied'],
  ['gym.power.bcn', 'Power Gym', 'Gimnasio en Barcelona 🏋️', 8700, 'frio', 'new'],
  ['maria.yoga', 'María Paz', 'Profe de yoga · clases online', 5400, 'cerrado', 'converted'],
  ['dani.coach', 'Daniel Gómez', 'Coach de negocios', 1900, 'frio', 'new'],
];
const leads = names.map(([u, n, bio, f, stage, status], i) => ({
  id: `l${i}`,
  username: u,
  fullName: n,
  bio,
  followerCount: f,
  sourceType: i % 2 ? 'followers_list' : 'hashtag',
  sourceRef: '@competencia',
  capturedAt: now - i * 5 * H,
  status,
  stage,
  score: [82, 45, 91, 30, 77, undefined][i],
  scoreReason: 'Encaja con tu cliente ideal',
  tags: i === 0 ? ['INFO'] : [],
  notes: '',
  contactedAt: status !== 'new' ? now - 30 * H : undefined,
  storyViewedAt: now - 31 * H,
  likedAt: now - 31 * H,
}));

const store: Record<string, unknown> = {
  leads,
  settings: { groqModel: 'llama-3.1-8b-instant', icpKeywords: 'coaches fitness', dailyContactSoftLimit: 15, groqApiKey: 'gsk_x' },
  templates: [{ id: 't1', name: 'Primer contacto', body: '{Hola|Buenas} {primer_nombre}! Vi tu perfil y me encantó tu contenido. ¿Trabajas con clientes online?' }],
  campaigns: [
    {
      id: 'c1', name: 'Seguidores de @fitcompetencia', createdAt: now - 26 * H, status: 'running',
      source: { kind: 'followers', value: '@fitcompetencia' }, filters: {}, actions: { story: true, like: 1, dm: true },
      message: { mode: 'ai', templateIds: [], aiPrompt: '' }, comment: { mode: 'ai', options: '' }, followUps: [{ afterHours: 48, mode: 'ai' }],
      maxLeads: 60, candidates: [{}, {}, {}], work: [{}, {}], seenUserKeys: [],
      stats: { scanned: 58, passed: 23, rejected: 35, errors: 0, done: { dm: 19, story: 21, like: 22 } },
    },
    {
      id: 'c2', name: 'Reels #nutricion', createdAt: now - 80 * H, status: 'paused',
      source: { kind: 'hashtag', value: '#nutricion' }, filters: {}, actions: {}, message: { mode: 'ai', templateIds: [], aiPrompt: '' },
      comment: { mode: 'ai', options: '' }, followUps: [], maxLeads: 40, candidates: [], work: [], seenUserKeys: [],
      stats: { scanned: 40, passed: 12, rejected: 28, errors: 1, done: { dm: 12, comment: 8 } }, lastError: 'Instagram 404: publicación no disponible',
    },
  ],
  engineState: { enabled: true, nextActionAt: now + 95_000, pausedUntil: 0, actionsSinceRest: 4, lastMonitorAt: now, knownFollowerIds: [], followersBaselineDone: true, lastCommentPk: {}, keywordHandled: [], campaignCursor: 0, ownUserId: '1', systemWork: [{}, {}] },
  actionCounters: { date: new Date().toISOString().slice(0, 10), counts: { dm: 14, follow: 9, like: 31, story: 26, comment: 4 } },
  dailyStats: [{ date: new Date().toISOString().slice(0, 10), contactedCount: 14 }],
  actionLog: [
    { at: now - 60_000, level: 'ok', action: 'dm', username: 'carlos.emprende', text: 'DM enviado: "¡Buenas Carlos! Vi que vendes café de especialidad…"' },
    { at: now - 4 * 60_000, level: 'ok', action: 'story', username: 'carlos.emprende', text: 'Vio 2 historia(s) y reaccionó ❤️' },
    { at: now - 9 * 60_000, level: 'info', action: 'lookup', username: 'random.user', text: 'Descartado: cuenta privada' },
    { at: now - 15 * 60_000, level: 'ok', action: 'system', username: 'ana.fitcoach', text: 'Respondió a tu mensaje 🎉' },
    { at: now - 40 * 60_000, level: 'error', action: 'system', text: 'Campaña "Reels #nutricion" pausada: Instagram 404' },
  ],
};

const listeners: Array<(changes: Record<string, { newValue: unknown }>, area: string) => void> = [];

const inbox = [
  { name: 'Ana López', lastText: '¡Me interesa! ¿Cuánto cuesta?', lastAt: now - 2 * H, lastFromMe: false, unread: true },
  { name: 'Lucía Martín', lastText: 'Genial, hablamos mañana', lastAt: now - 20 * H, lastFromMe: false, unread: false },
  { name: 'Carlos Ruiz', lastText: '¡Buenas Carlos! Vi que vendes café…', lastAt: now - 30 * H, lastFromMe: true, unread: false },
  { name: 'Pedro Sánchez', lastText: 'Hola, vi tu reel', lastAt: now - 50 * H, lastFromMe: false, unread: false },
];

Object.defineProperty(globalThis, "chrome", { configurable: true, writable: true, value: {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: structuredClone(store[key]) }),
      set: async (obj: Record<string, unknown>) => {
        const changes: Record<string, { newValue: unknown }> = {};
        for (const [k, v] of Object.entries(obj)) {
          store[k] = v;
          changes[k] = { newValue: structuredClone(v) };
        }
        listeners.forEach((l) => l(changes, 'local'));
      },
    },
    onChanged: { addListener: (l: (typeof listeners)[number]) => listeners.push(l), removeListener: () => undefined },
  },
  runtime: {
    getManifest: () => ({ version: '0.3.0' }),
    sendMessage: async (msg: { type: string }) => {
      await new Promise((r) => setTimeout(r, 400));
      if (msg.type === 'DP_BG_INBOX') return { ok: true, threads: inbox };
      if (msg.type === 'DP_BG_PLACES')
        return { ok: true, places: [
          { id: '113887786935854', name: 'Medellín, Colombia', subtitle: '' },
          { id: '213470231', name: 'Parque Lleras', subtitle: 'El Poblado · Medellín' },
          { id: '247315129', name: 'Aeropuerto José María Córdova', subtitle: 'Rionegro' },
        ] };
      if (msg.type === 'DP_BG_SESSION') return { ok: true, loggedIn: true, userId: '1' };
      return { ok: true };
    },
  },
  permissions: { request: async () => true },
} });
export {};
