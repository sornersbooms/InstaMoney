/**
 * Motor de automatización.
 *
 * Funciona por "ticks" (alarma cada 30 s). En cada tick hace como mucho UNA acción visible
 * (DM, seguir, like, comentario, historia...) y luego espera un tiempo aleatorio entre
 * `minDelaySec` y `maxDelaySec`. Respeta horario activo, límites diarios por acción, descansos
 * cada N acciones y, si Instagram limita la cuenta, se pausa solo durante `blockCooldownHours`.
 *
 * Además, cada `monitorEveryMinutes` revisa: nuevos seguidores (bienvenida), comentarios con palabra
 * clave, respuestas en la bandeja (CRM) y seguimientos pendientes.
 */
import * as ig from './ig';
import { IgBlockError } from './ig';
import { primeVoiceNote, runOnPage } from './worker';
import { toAvatarDataUrl } from './avatar';
import { rejectReason } from '@/lib/filters';
import { AiSkip, generateComment, generateFollowUp, generateOpener } from '@/lib/ai';
import { randomBetween, renderMessage, spin, splitList, uid } from '@/lib/text';
import { emitWebhook } from '@/lib/webhooks';
import { licenseForEngine } from '@/lib/license';
import {
  appendLog,
  bumpActionCounter,
  getActionCounters,
  getAutomations,
  getAutomationSettings,
  getCampaigns,
  getEngineState,
  getLeads,
  getSettings,
  getTemplates,
  getVoiceNotes,
  incrementContactedToday,
  saveCampaigns,
  saveEngineState,
  saveLeads,
} from '@/lib/storage';
import type {
  ActionKind,
  AutomationSettings,
  Campaign,
  Candidate,
  EngineState,
  Lead,
  LeadSource,
  WorkItem,
} from '@/lib/types';
import { matchLeadForThread } from '@/lib/types';

// ───────────────────────────── utilidades ─────────────────────────────

let chain: Promise<unknown> = Promise.resolve();
/** Serializa lecturas-modificaciones-escrituras del storage (sin anidar llamadas). */
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export async function mutateEngine(fn: (e: EngineState) => void): Promise<EngineState> {
  return withLock(async () => {
    const e = await getEngineState();
    fn(e);
    await saveEngineState(e);
    return e;
  });
}

export async function mutateCampaign(id: string, fn: (c: Campaign) => void): Promise<void> {
  await withLock(async () => {
    const all = await getCampaigns();
    const c = all.find((x) => x.id === id);
    if (!c) return;
    fn(c);
    await saveCampaigns(all);
  });
}

async function mutateLead(id: string, fn: (l: Lead) => void): Promise<Lead | undefined> {
  return withLock(async () => {
    const leads = await getLeads();
    const lead = leads.find((l) => l.id === id);
    if (!lead) return undefined;
    fn(lead);
    await saveLeads(leads);
    return { ...lead };
  });
}

function inActiveHours(s: AutomationSettings): boolean {
  const h = new Date().getHours();
  if (s.activeFromHour === s.activeToHour) return true;
  return s.activeFromHour < s.activeToHour ? h >= s.activeFromHour && h < s.activeToHour : h >= s.activeFromHour || h < s.activeToHour;
}

async function underLimit(action: ActionKind, s: AutomationSettings): Promise<boolean> {
  const c = await getActionCounters();
  return (c.counts[action] ?? 0) < (s.dailyLimits[action] ?? 0);
}

function log(level: 'info' | 'ok' | 'warn' | 'error', text: string, action?: ActionKind | 'system', username?: string) {
  return appendLog({ level, text, action, username });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ownUserId(): Promise<string> {
  const e = await getEngineState();
  if (e.ownUserId) return e.ownUserId;
  const s = await ig.getSession();
  if (!s.loggedIn || !s.userId) throw new Error('No hay sesión de Instagram iniciada en la ventana de trabajo.');
  await mutateEngine((x) => (x.ownUserId = s.userId));
  return s.userId;
}

// ───────────────────────────── leads ─────────────────────────────

async function upsertLeadFromProfile(
  p: ig.ProfileInfo | { username: string; userId?: string; fullName?: string; profilePicUrl?: string },
  sourceType: LeadSource,
  sourceRef: string,
  campaignId?: string,
): Promise<{ lead: Lead; isNew: boolean }> {
  const full = 'recentPosts' in p ? p : null;
  const avatar = await toAvatarDataUrl(p.profilePicUrl);
  return withLock(async () => {
    const leads = await getLeads();
    const existing = leads.find((l) => l.username.toLowerCase() === p.username.toLowerCase());
    const enriched: Partial<Lead> = {
      userId: p.userId,
      fullName: p.fullName,
      ...(avatar ? { profilePicUrl: avatar } : {}),
      ...(full
        ? {
            bio: full.bio,
            followerCount: full.followerCount,
            followingCount: full.followingCount,
            mediaCount: full.mediaCount,
            isBusiness: full.isBusiness,
            isPrivate: full.isPrivate,
            isVerified: full.isVerified,
            lastPostAt: full.recentPosts[0]?.takenAt || undefined,
            recentCaptions: full.recentPosts.map((r) => r.caption).filter(Boolean).slice(0, 3),
          }
        : {}),
    };
    if (existing) {
      for (const [k, v] of Object.entries(enriched)) if (v !== undefined) (existing as unknown as Record<string, unknown>)[k] = v;
      if (campaignId && !existing.campaignId) existing.campaignId = campaignId;
      await saveLeads(leads);
      return { lead: { ...existing }, isNew: false };
    }
    const lead: Lead = {
      id: uid(`${p.username}-`),
      username: p.username,
      sourceType,
      sourceRef,
      campaignId,
      capturedAt: Date.now(),
      status: 'new',
      stage: 'frio',
      tags: [],
      notes: '',
      ...enriched,
    } as Lead;
    leads.unshift(lead);
    await saveLeads(leads);
    return { lead, isNew: true };
  });
}

// ───────────────────────────── extracción ─────────────────────────────

async function extractPage(c: Campaign): Promise<{ candidates: Candidate[]; next: string | null }> {
  const value = c.source.value.trim();
  switch (c.source.kind) {
    case 'followers':
    case 'following': {
      const target = await ig.getProfile(value.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, ''));
      if (target.isPrivate && !target.followedByViewer) throw new Error(`@${target.username} es privada: no se pueden leer sus seguidores.`);
      return c.source.kind === 'followers' ? ig.getFollowers(target.userId, c.cursor) : ig.getFollowing(target.userId, c.cursor);
    }
    case 'own_followers':
      return ig.getFollowers(await ownUserId(), c.cursor);
    case 'likers': {
      const mediaId = ig.mediaIdFromShortcode(ig.shortcodeFromInput(value));
      return { candidates: await ig.getLikers(mediaId), next: null };
    }
    case 'commenters': {
      const mediaId = ig.mediaIdFromShortcode(ig.shortcodeFromInput(value));
      const { comments, next } = await ig.getComments(mediaId, c.cursor);
      return { candidates: comments.map((cm) => ({ username: cm.username, userId: cm.userId, context: cm.text })), next };
    }
    case 'hashtag':
      return ig.getHashtagUsers(value, c.cursor);
    case 'location':
      return ig.getLocationUsers(value, c.cursor);
    case 'existing_leads': {
      const leads = await getLeads();
      const status = c.source.leadStatus ?? 'all';
      const tag = c.source.leadTag?.trim().toLowerCase();
      const list = leads.filter((l) => (status === 'all' || l.status === status) && (!tag || l.tags.some((t) => t.toLowerCase() === tag)));
      return { candidates: list.map((l) => ({ username: l.username, userId: l.userId })), next: null };
    }
    case 'unfollow_non_followers': {
      const days = c.source.unfollowAfterDays ?? 3;
      const cutoff = Date.now() - days * 86_400_000;
      const leads = await getLeads();
      const list = leads.filter((l) => l.followedAt && !l.unfollowedAt && l.followedAt < cutoff && l.userId);
      return { candidates: list.map((l) => ({ username: l.username, userId: l.userId })), next: null };
    }
  }
}

const SOURCE_TO_LEAD: Record<Campaign['source']['kind'], LeadSource> = {
  followers: 'followers_list',
  following: 'following_list',
  likers: 'post_likers',
  commenters: 'post_comments',
  hashtag: 'hashtag',
  location: 'location',
  own_followers: 'own_followers',
  existing_leads: 'manual',
  unfollow_non_followers: 'manual',
};

/** Analiza un candidato: perfil + filtros → lead + cola de acciones. */
async function processCandidate(c: Campaign, cand: Candidate): Promise<{ work: WorkItem[]; passed: boolean }> {
  if (c.source.kind === 'unfollow_non_followers') {
    const leads = await getLeads();
    const lead = leads.find((l) => l.username === cand.username);
    if (!lead || !cand.userId) return { work: [], passed: false };
    const fr = await ig.friendship(cand.userId);
    if (!fr.following) {
      await mutateLead(lead.id, (l) => (l.unfollowedAt = Date.now()));
      return { work: [], passed: false };
    }
    if (fr.followedBy) return { work: [], passed: false };
    return { work: [{ id: uid('w'), leadId: lead.id, username: lead.username, userId: cand.userId, action: 'unfollow', campaignId: c.id, origin: 'campaign' }], passed: true };
  }

  const profile = await ig.getProfile(cand.username);
  const reason = rejectReason(
    {
      ...profile,
      lastPostAt: profile.recentPosts[0]?.takenAt || undefined,
      captions: profile.recentPosts.map((r) => r.caption),
    },
    c.source.kind === 'existing_leads' || c.source.kind === 'own_followers' ? { ...c.filters, skipAlreadyConnected: false } : c.filters,
  );
  if (reason) {
    await log('info', `Descartado: ${reason}`, 'lookup', profile.username);
    return { work: [], passed: false };
  }

  const { lead, isNew } = await upsertLeadFromProfile(profile, SOURCE_TO_LEAD[c.source.kind], c.source.value, c.id);
  if (isNew) emitWebhook('lead.captured', lead, { campaign: c.name, context: cand.context });
  if (cand.context && !lead.notes) await mutateLead(lead.id, (l) => (l.notes = `Comentó: "${cand.context}"`));

  const base = { leadId: lead.id, username: lead.username, userId: profile.userId, campaignId: c.id, origin: 'campaign' as const };
  const work: WorkItem[] = [];
  const a = c.actions;
  const canSeeContent = !profile.isPrivate || profile.followedByViewer;
  if (a.story && canSeeContent) work.push({ ...base, id: uid('w'), action: 'story' });
  if (a.like > 0 && canSeeContent)
    for (const post of profile.recentPosts.slice(0, a.like)) work.push({ ...base, id: uid('w'), action: 'like', mediaId: post.id });
  if (a.comment && canSeeContent && profile.recentPosts[0])
    work.push({
      ...base,
      id: uid('w'),
      action: 'comment',
      mediaId: profile.recentPosts[0].id,
      // Texto de la publicación + descripción de la imagen: contexto para que la IA comente algo concreto.
      caption: [profile.recentPosts[0].caption, profile.recentPosts[0].altText ? `Imagen: ${profile.recentPosts[0].altText}` : ''].filter(Boolean).join(' | '),
    });
  if (a.follow && !profile.followedByViewer && !lead.followedAt) work.push({ ...base, id: uid('w'), action: 'follow' });
  if (a.dm && !lead.contactedAt) work.push({ ...base, id: uid('w'), action: 'dm' });
  if (a.voice && c.voiceNoteId) work.push({ ...base, id: uid('w'), action: 'voice', voiceNoteId: c.voiceNoteId });
  // «Mejores Amigos» desactivado: no hay forma segura desde la web (por API cierra la sesión).
  return { work, passed: true };
}

// ───────────────────────────── ejecución de acciones ─────────────────────────────

function dmUrl(lead: Lead): string {
  // ig.me/m/… da página de error en Chrome de escritorio: se abre el perfil y se pulsa «Enviar mensaje».
  return lead.threadId ? `https://www.instagram.com/direct/t/${lead.threadId}/` : `https://www.instagram.com/${lead.username}/`;
}

async function buildDmText(item: WorkItem, lead: Lead, campaign?: Campaign): Promise<string> {
  if (item.text) return renderMessage(item.text, lead);
  const settings = await getSettings();
  const templates = await getTemplates();
  if (item.origin === 'followup' && campaign && item.followUpIndex != null) {
    const step = campaign.followUps[item.followUpIndex];
    if (step.mode === 'ai') return generateFollowUp(lead, settings, item.followUpIndex, step.aiPrompt);
    const t = templates.find((x) => x.id === step.templateId);
    if (!t) throw new Error('La plantilla del seguimiento ya no existe.');
    return renderMessage(t.body, lead);
  }
  if (!campaign) throw new Error('Mensaje sin texto ni campaña.');
  if (campaign.message.mode === 'ai') return generateOpener(lead, settings, campaign.message.aiPrompt);
  const pool = templates.filter((t) => campaign.message.templateIds.includes(t.id));
  if (pool.length === 0) throw new Error('La campaña no tiene plantillas de mensaje válidas.');
  return renderMessage(pool[Math.floor(Math.random() * pool.length)].body, lead);
}

/** Ejecuta una acción. Devuelve false si se omitió sin gastar acción (p. ej. sin historias). */
async function execute(item: WorkItem, campaign?: Campaign): Promise<boolean> {
  const lead = (await getLeads()).find((l) => l.id === item.leadId);
  if (!lead) return false;
  const userId = item.userId ?? lead.userId;

  switch (item.action) {
    case 'dm': {
      if (item.origin === 'campaign' && lead.contactedAt) return false;
      const text = await buildDmText(item, lead, campaign);
      if (!text.trim()) throw new Error('El mensaje quedó vacío.');
      const res = await runOnPage<{ ok: boolean; error?: string; threadId?: string }>(dmUrl(lead), { type: 'DP_DOM_DM', text });
      if (!res?.ok) throw new Error(res?.error ?? 'No se pudo enviar el DM.');
      const now = Date.now();
      const isFollowUp = item.origin === 'followup';
      const updated = await mutateLead(lead.id, (l) => {
        if (l.status === 'new') l.status = 'contacted';
        if (!l.contactedAt) l.contactedAt = now;
        l.lastMessageAt = now;
        l.lastMessageText = text;
        if (res.threadId) l.threadId = res.threadId;
        if (isFollowUp) l.followUpStep = (item.followUpIndex ?? 0) + 1;
        else if (l.followUpStep == null) l.followUpStep = 0;
        if (!l.stage) l.stage = 'frio';
      });
      if (!isFollowUp) await incrementContactedToday();
      if (updated) emitWebhook(isFollowUp ? 'followup.sent' : 'lead.contacted', updated, { message: text, origin: item.origin });
      await log('ok', `${isFollowUp ? 'Seguimiento' : 'DM'} enviado: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`, 'dm', lead.username);
      return true;
    }
    case 'voice': {
      const note = (await getVoiceNotes()).find((v) => v.id === item.voiceNoteId);
      if (!note) throw new Error('La nota de voz ya no existe.');
      const res = await runOnPage<{ ok: boolean; error?: string }>(dmUrl(lead), { type: 'DP_DOM_VOICE', durationMs: note.durationMs }, (tabId) => primeVoiceNote(tabId, note.dataUrl));
      if (!res?.ok) throw new Error(res?.error ?? 'No se pudo enviar la nota de voz.');
      await mutateLead(lead.id, (l) => {
        l.lastMessageAt = Date.now();
        if (l.status === 'new') l.status = 'contacted';
        if (!l.contactedAt) l.contactedAt = Date.now();
      });
      await log('ok', `Nota de voz "${note.name}" enviada`, 'voice', lead.username);
      return true;
    }
    case 'follow': {
      if (!userId) throw new Error('Falta el ID del usuario.');
      await ig.follow(userId, lead.username);
      await mutateLead(lead.id, (l) => (l.followedAt = Date.now()));
      await log('ok', 'Seguido', 'follow', lead.username);
      return true;
    }
    case 'unfollow': {
      if (!userId) throw new Error('Falta el ID del usuario.');
      await ig.unfollow(userId, lead.username);
      await mutateLead(lead.id, (l) => (l.unfollowedAt = Date.now()));
      await log('ok', 'Dejado de seguir (no te siguió de vuelta)', 'unfollow', lead.username);
      return true;
    }
    case 'like': {
      if (!item.mediaId) return false;
      await ig.like(item.mediaId);
      await mutateLead(lead.id, (l) => (l.likedAt = Date.now()));
      await log('ok', 'Me gusta en una publicación', 'like', lead.username);
      return true;
    }
    case 'comment': {
      if (!item.mediaId) return false;
      let text = item.text ? renderMessage(item.text, lead) : '';
      if (!text && campaign) {
        if (campaign.comment.mode === 'ai') {
          try {
            text = await generateComment(item.caption ?? '', await getSettings());
          } catch (err) {
            if (!(err instanceof AiSkip)) throw err;
            await log('info', `Comentario omitido: ${err.message}`, 'comment', lead.username);
            return false;
          }
        }
        else {
          const options = campaign.comment.options.split('\n').map((s) => s.trim()).filter(Boolean);
          if (options.length) text = spin(options[Math.floor(Math.random() * options.length)]);
        }
      }
      if (!text) return false;
      await ig.comment(item.mediaId, text, item.replyToCommentId);
      await mutateLead(lead.id, (l) => (l.commentedAt = Date.now()));
      await log('ok', `Comentario: "${text}"`, 'comment', lead.username);
      return true;
    }
    case 'story': {
      // Si no tiene historias, Instagram redirige al perfil y no se cuenta como acción.
      const react = !!campaign?.actions.reactStory;
      const res = await runOnPage<{ ok: boolean; viewed?: number; reacted?: boolean; error?: string }>(`https://www.instagram.com/stories/${lead.username}/`, {
        type: 'DP_DOM_STORY',
        maxStories: 3,
        react,
        viewSecs: 4,
      });
      if (!res?.ok) throw new Error(res?.error ?? 'No se pudieron ver las historias.');
      if (!res.viewed) return false;
      await mutateLead(lead.id, (l) => (l.storyViewedAt = Date.now()));
      await log('ok', `Vio ${res.viewed} historia(s)${res.reacted ? ' y reaccionó ❤️' : ''}`, 'story', lead.username);
      return true;
    }
    case 'closeFriends': {
      if (!userId) throw new Error('Falta el ID del usuario.');
      await ig.addCloseFriend(userId);
      await mutateLead(lead.id, (l) => (l.closeFriendAt = Date.now()));
      await log('ok', 'Añadido a Mejores Amigos', 'closeFriends', lead.username);
      return true;
    }
    case 'lookup':
      return false;
  }
}

// ───────────────────────────── monitores ─────────────────────────────

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}


async function monitorNewFollowers(me: string) {
  const autos = await getAutomations();
  if (!autos.welcome.enabled) {
    await mutateEngine((e) => {
      e.followersBaselineDone = false;
      e.knownFollowerIds = [];
    });
    return;
  }
  const { candidates } = await ig.getFollowers(me, null);
  const engine = await getEngineState();
  if (!engine.followersBaselineDone) {
    await mutateEngine((e) => {
      e.knownFollowerIds = candidates.map((c) => c.userId!).filter(Boolean);
      e.followersBaselineDone = true;
    });
    await log('info', `Bienvenida activada: ${candidates.length} seguidores actuales registrados como punto de partida.`, 'system');
    return;
  }
  const known = new Set(engine.knownFollowerIds);
  const fresh = candidates.filter((c) => c.userId && !known.has(c.userId));
  if (fresh.length === 0) return;
  const items: WorkItem[] = [];
  for (const cand of fresh) {
    const { lead } = await upsertLeadFromProfile(cand, 'new_follower', 'nuevo seguidor');
    emitWebhook('new_follower', lead);
    const base = { leadId: lead.id, username: lead.username, userId: cand.userId, origin: 'welcome' as const };
    if (!lead.contactedAt) items.push({ ...base, id: uid('w'), action: 'dm', text: autos.welcome.text });
    if (autos.welcome.voiceNoteId) items.push({ ...base, id: uid('w'), action: 'voice', voiceNoteId: autos.welcome.voiceNoteId });
  }
  await mutateEngine((e) => {
    e.knownFollowerIds = [...fresh.map((c) => c.userId!), ...e.knownFollowerIds].slice(0, 5000);
    e.systemWork.push(...items);
  });
  await log('info', `${fresh.length} seguidor(es) nuevo(s): bienvenida en cola.`, 'system');
}

async function monitorKeywordComments(me: string) {
  const autos = await getAutomations();
  const rules = autos.keywordRules.filter((r) => r.enabled && r.keyword.trim());
  if (rules.length === 0) return;

  // Publicaciones a vigilar: las indicadas en las reglas + (si alguna regla no indica) las recientes.
  const posts = new Map<string, string>(); // mediaId → shortcode
  for (const r of rules) for (const p of splitList(r.posts)) {
    const code = ig.shortcodeFromInput(p);
    if (code) posts.set(ig.mediaIdFromShortcode(code), code);
  }
  if (rules.some((r) => splitList(r.posts).length === 0)) {
    try {
      for (const p of await ig.getOwnRecentPosts(autos.keywordPostsToWatch)) posts.set(p.id, p.shortcode);
    } catch (err) {
      if (err instanceof IgBlockError) throw err;
      // Sin las recientes se siguen revisando las publicaciones indicadas.
      await log('warn', `Palabra clave: no se pudieron leer tus publicaciones recientes (${err instanceof Error ? err.message : err}).`, 'system');
    }
  }

  // Ventana de tiempo: comentarios hechos desde que se creó la regla (o de las últimas 48 h).
  const floor = Date.now() - 48 * 3_600_000;
  let matched = 0;
  let seen = 0;
  let alreadyDone = 0;
  for (const [mediaId, shortcode] of posts) {
    const { comments } = await ig.getComments(mediaId, null);
    const engine = await getEngineState();
    const items: WorkItem[] = [];
    const handled: string[] = [];
    for (const cm of comments) {
      if (!cm.userId || cm.userId === me || cm.createdAt < floor) continue;
      seen++;
      const text = normalize(cm.text);
      for (const rule of rules) {
        const scope = splitList(rule.posts).map((p) => ig.shortcodeFromInput(p));
        if (scope.length && !scope.includes(shortcode)) continue;
        if (rule.createdAt && cm.createdAt < rule.createdAt - 60_000) continue;
        if (!text.includes(normalize(rule.keyword.trim()))) continue;
        const key = `${rule.id}:${cm.userId}`;
        if (engine.keywordHandled.includes(key) || handled.includes(key)) {
          alreadyDone++;
          continue;
        }
        handled.push(key);
        const { lead } = await upsertLeadFromProfile({ username: cm.username, userId: cm.userId }, 'keyword_comment', `palabra "${rule.keyword}"`);
        await mutateLead(lead.id, (l) => {
          if (!l.tags.includes(rule.keyword)) l.tags.push(rule.keyword);
          if (!l.stage || l.stage === 'frio') l.stage = 'tibio';
        });
        const base = { leadId: lead.id, username: lead.username, userId: cm.userId, origin: 'keyword' as const, keywordKey: key };
        // El DM primero (es lo importante); la respuesta pública después.
        items.push({ ...base, id: uid('w'), action: 'dm', text: rule.dmText });
        if (rule.publicReply?.trim()) items.push({ ...base, id: uid('w'), action: 'comment', mediaId, text: `@${cm.username} ${rule.publicReply}` });
        await log('info', `Comentó «${rule.keyword}»: DM en cola.`, 'system', cm.username);
      }
    }
    if (items.length || handled.length) {
      matched += handled.length;
      await mutateEngine((e) => {
        e.keywordHandled = [...handled, ...e.keywordHandled].slice(0, 5000);
        e.systemWork.push(...items);
      });
    }
    await sleep(randomBetween(1500, 3500));
  }
  await log(
    'info',
    `Palabra clave: ${posts.size} publicación(es), ${seen} comentario(s) de otras cuentas en 48 h, ${matched} nuevo(s) con la palabra` +
      (alreadyDone ? `, ${alreadyDone} ya respondido(s) antes (usa «Reiniciar registro» para repetir pruebas)` : '') + '.',
    'system',
  );
}

async function syncInboxAndFollowUps(_me: string) {
  const autos = await getAutomations();
  const campaigns = await getCampaigns();
  const needFollowUps = campaigns.some((c) => c.status !== 'done' && c.followUps.length > 0) || campaigns.some((c) => c.followUps.length > 0);
  if (!autos.inboxSync && !needFollowUps) return;

  // Una sola lectura de la bandeja sirve para detectar respuestas y para cortar seguimientos.
  const threads = await ig.getInbox(60);
  const repliedLeads: Lead[] = [];
  await withLock(async () => {
    const leads = await getLeads();
    for (const t of threads) {
      if (t.lastFromMe) continue;
      const lead = matchLeadForThread(leads, t.name);
      if (!lead || !lead.contactedAt || lead.repliedAt) continue;
      lead.repliedAt = Date.now();
      if (lead.status === 'contacted' || lead.status === 'new') lead.status = 'replied';
      if (!lead.stage || lead.stage === 'frio') lead.stage = 'tibio';
      repliedLeads.push({ ...lead });
    }
    if (repliedLeads.length) await saveLeads(leads);
  });
  for (const l of repliedLeads) {
    emitWebhook('lead.replied', l);
    await log('ok', 'Respondió a tu mensaje 🎉', 'system', l.username);
  }

  // Seguimientos: leads contactados por campaña, sin respuesta, cuyo plazo ya venció.
  const leads = await getLeads();
  const engine = await getEngineState();
  const queued = new Set(engine.systemWork.filter((w) => w.origin === 'followup').map((w) => w.leadId));
  const now = Date.now();
  for (const lead of leads) {
    if (lead.status !== 'contacted' || lead.repliedAt || !lead.campaignId || queued.has(lead.id)) continue;
    const c = campaigns.find((x) => x.id === lead.campaignId);
    if (!c || !c.followUps.length) continue;
    const step = lead.followUpStep ?? 0;
    const cfg = c.followUps[step];
    if (!cfg || !lead.lastMessageAt || now < lead.lastMessageAt + cfg.afterHours * 3_600_000) continue;
    // Si el último mensaje del chat es suyo, respondió: no se le insiste.
    const thread = threads.find((t) => matchLeadForThread([lead], t.name));
    if (thread && !thread.lastFromMe) continue;
    const base = { leadId: lead.id, username: lead.username, userId: lead.userId, campaignId: c.id, origin: 'followup' as const, followUpIndex: step };
    const items: WorkItem[] = [{ ...base, id: uid('w'), action: 'dm' }];
    if (cfg.voiceNoteId) items.push({ ...base, id: uid('w'), action: 'voice', voiceNoteId: cfg.voiceNoteId });
    await mutateEngine((e) => e.systemWork.push(...items));
    await log('info', `Seguimiento #${step + 1} en cola`, 'system', lead.username);
  }
}

export async function runMonitors(force = false): Promise<void> {
  const s = await getAutomationSettings();
  const engine = await getEngineState();
  if (!force && Date.now() - engine.lastMonitorAt < s.monitorEveryMinutes * 60_000) return;
  await mutateEngine((e) => (e.lastMonitorAt = Date.now()));
  const me = await ownUserId();
  for (const step of [monitorNewFollowers, monitorKeywordComments, syncInboxAndFollowUps]) {
    try {
      await step(me);
    } catch (err) {
      if (err instanceof IgBlockError) throw err;
      await log('warn', `Monitor: ${err instanceof Error ? err.message : String(err)}`, 'system');
    }
  }
}

// ───────────────────────────── tick ─────────────────────────────

type StepResult = 'action' | 'read' | 'idle';

async function runSystemWork(s: AutomationSettings): Promise<StepResult> {
  const engine = await getEngineState();
  for (const item of engine.systemWork) {
    if (!(await underLimit(item.action, s))) continue;
    await mutateEngine((e) => (e.systemWork = e.systemWork.filter((w) => w.id !== item.id)));
    const campaign = item.campaignId ? (await getCampaigns()).find((c) => c.id === item.campaignId) : undefined;
    try {
      const did = await execute(item, campaign);
      if (did) await bumpActionCounter(item.action);
      return did ? 'action' : 'read';
    } catch (err) {
      // DM por palabra clave fallido: se libera para que se reintente en la próxima revisión.
      if (item.keywordKey && item.action === 'dm') {
        const key = item.keywordKey;
        await mutateEngine((e) => (e.keywordHandled = e.keywordHandled.filter((k) => k !== key)));
        await mutateEngine((e) => (e.systemWork = e.systemWork.filter((w) => w.keywordKey !== key)));
      }
      if (err instanceof IgBlockError) throw err;
      await log('error', err instanceof Error ? err.message : String(err), item.action, item.username);
      return 'read';
    }
  }
  return 'idle';
}

async function runCampaignStep(c: Campaign, s: AutomationSettings): Promise<StepResult> {
  // 1) Acciones pendientes de leads ya analizados.
  for (const item of c.work) {
    if (!(await underLimit(item.action, s))) continue;
    await mutateCampaign(c.id, (x) => (x.work = x.work.filter((w) => w.id !== item.id)));
    try {
      const did = await execute(item, c);
      if (did) {
        await bumpActionCounter(item.action);
        await mutateCampaign(c.id, (x) => (x.stats.done[item.action] = (x.stats.done[item.action] ?? 0) + 1));
      }
      return did ? 'action' : 'read';
    } catch (err) {
      if (err instanceof IgBlockError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      await mutateCampaign(c.id, (x) => {
        x.stats.errors++;
        x.lastError = msg;
      });
      await log('error', msg, item.action, item.username);
      return 'read';
    }
  }
  // Si quedan acciones pero todas topadas por límite diario, no seguimos analizando más perfiles.
  if (c.work.length > 0) return 'idle';

  // 2) Analizar candidatos (lecturas ligeras, hasta 3 por tick).
  if (c.candidates.length > 0 && c.stats.passed < c.maxLeads) {
    if (!(await underLimit('lookup', s))) return 'idle';
    // Cada análisis abre el perfil en la ventana de trabajo: 2 por turno como mucho.
    const batch = c.candidates.slice(0, 2);
    const newWork: WorkItem[] = [];
    let passed = 0;
    let rejected = 0;
    let errors = 0;
    for (const cand of batch) {
      try {
        const r = await processCandidate(c, cand);
        await bumpActionCounter('lookup');
        if (r.passed) {
          passed++;
          newWork.push(...r.work);
        } else rejected++;
      } catch (err) {
        if (err instanceof IgBlockError) throw err;
        errors++;
        await log('warn', err instanceof Error ? err.message : String(err), 'lookup', cand.username);
      }
      if (c.stats.passed + passed >= c.maxLeads) break;
      await sleep(randomBetween(2000, 5000));
    }
    await mutateCampaign(c.id, (x) => {
      x.candidates = x.candidates.filter((k) => !batch.some((b) => b.username === k.username));
      x.work.push(...newWork);
      x.stats.scanned += passed + rejected + errors;
      x.stats.passed += passed;
      x.stats.rejected += rejected;
      x.stats.errors += errors;
    });
    return 'read';
  }

  // 3) Traer otra página de la fuente.
  if (!c.sourceExhausted && c.stats.passed < c.maxLeads) {
    const { candidates, next } = await extractPage(c);
    await mutateCampaign(c.id, (x) => {
      const seen = new Set(x.seenUserKeys);
      const fresh = candidates.filter((k) => !seen.has(k.username.toLowerCase()));
      x.candidates.push(...fresh);
      x.seenUserKeys = [...x.seenUserKeys, ...fresh.map((k) => k.username.toLowerCase())].slice(-20000);
      x.cursor = next;
      x.sourceExhausted = !next || candidates.length === 0;
    });
    await log('info', `Campaña "${c.name}": ${candidates.length} perfiles extraídos de la fuente.`, 'system');
    return 'read';
  }

  // 4) Nada más que hacer: campaña terminada (los seguimientos siguen corriendo aparte).
  await mutateCampaign(c.id, (x) => (x.status = 'done'));
  await log('ok', `Campaña "${c.name}" completada.`, 'system');
  return 'read';
}

async function pauseForBlock(err: Error, s: AutomationSettings) {
  const until = Date.now() + s.blockCooldownHours * 3_600_000;
  await mutateEngine((e) => {
    e.pausedUntil = until;
    e.pauseReason = err.message;
  });
  await log('error', `${err.message}. Motor en pausa ${s.blockCooldownHours} h para proteger la cuenta.`, 'system');
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('public/icons/icon128.png'),
    title: 'InstaMoney en pausa',
    message: `Instagram limitó una acción. Pausa automática de ${s.blockCooldownHours} h.`,
  });
}

let busy = false;

export async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  const s = await getAutomationSettings();
  try {
    const engine = await getEngineState();
    if (!engine.enabled) return;
    // Sin licencia activa (venció o se quitó) el motor no hace nada y se apaga.
    const lic = await licenseForEngine();
    if (lic === 'unknown') return; // el servidor no respondió: se reintenta en el próximo turno
    if (lic === 'none') {
      await mutateEngine((e) => (e.enabled = false));
      await log('warn', 'Sin licencia activa: el motor se apagó. Abre el panel para activar tu licencia.', 'system');
      return;
    }
    const now = Date.now();
    if (now < engine.pausedUntil) return;
    if (engine.pausedUntil && engine.pauseReason) await mutateEngine((e) => (e.pauseReason = undefined));
    if (!inActiveHours(s)) return;

    await runMonitors();

    if (now < engine.nextActionAt) return;

    let result = await runSystemWork(s);
    if (result === 'idle') {
      const campaigns = (await getCampaigns()).filter((c) => c.status === 'running');
      for (let i = 0; i < campaigns.length && result === 'idle'; i++) {
        const idx = (engine.campaignCursor + i) % campaigns.length;
        try {
          result = await runCampaignStep(campaigns[idx], s);
        } catch (err) {
          if (err instanceof IgBlockError) throw err;
          const msg = err instanceof Error ? err.message : String(err);
          await mutateCampaign(campaigns[idx].id, (x) => {
            x.status = 'paused';
            x.lastError = msg;
          });
          await log('error', `Campaña "${campaigns[idx].name}" pausada: ${msg}`, 'system');
          result = 'read';
        }
        if (result !== 'idle') await mutateEngine((e) => (e.campaignCursor = idx + 1));
      }
    }

    if (result === 'action') {
      await mutateEngine((e) => {
        e.actionsSinceRest++;
        e.nextActionAt = Date.now() + randomBetween(s.minDelaySec, s.maxDelaySec) * 1000;
        if (s.restEveryActions > 0 && e.actionsSinceRest >= s.restEveryActions) {
          e.actionsSinceRest = 0;
          e.pausedUntil = Date.now() + s.restMinutes * 60_000;
          e.pauseReason = `Descanso de ${s.restMinutes} min tras ${s.restEveryActions} acciones`;
        }
      });
    } else if (result === 'read') {
      await mutateEngine((e) => (e.nextActionAt = Date.now() + randomBetween(8, 20) * 1000));
    }
  } catch (err) {
    if (err instanceof IgBlockError) await pauseForBlock(err, s);
    else await log('error', err instanceof Error ? err.message : String(err), 'system');
  } finally {
    busy = false;
  }
}
