import { getCampaigns, saveCampaigns, upsertLeads } from '@/lib/storage';
import type { Campaign, CapturedProfile, Lead } from '@/lib/types';
import { toAvatarDataUrl } from './avatar';
import { mutateEngine, runMonitors, tick, withLock } from './engine';
import { getInbox, getSession, searchPlaces } from './ig';
import { getWorkerTab } from './worker';

const TICK_ALARM = 'dp-tick';

function ensureAlarm() {
  chrome.alarms.get(TICK_ALARM, (a) => {
    if (!a) chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  ensureAlarm();
});
chrome.runtime.onStartup.addListener(ensureAlarm);
ensureAlarm();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) tick();
});

function toLead(profile: CapturedProfile, sourceType: Lead['sourceType'], sourceRef: string): Lead {
  return {
    id: `${profile.username}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: profile.username,
    fullName: profile.fullName,
    bio: profile.bio,
    profilePicUrl: profile.profilePicUrl,
    followerCount: profile.followerCount,
    isBusiness: profile.isBusiness,
    sourceType,
    sourceRef,
    capturedAt: Date.now(),
    status: 'new',
    stage: 'frio',
    tags: [],
    notes: '',
  };
}

/** Conserva el estado de ejecución al editar la configuración de una campaña existente. */
function mergeCampaign(existing: Campaign | undefined, incoming: Campaign): Campaign {
  if (!existing) return incoming;
  const sourceChanged = existing.source.kind !== incoming.source.kind || existing.source.value !== incoming.source.value;
  return {
    ...incoming,
    cursor: sourceChanged ? null : existing.cursor,
    sourceExhausted: sourceChanged ? false : existing.sourceExhausted,
    candidates: sourceChanged ? [] : existing.candidates,
    work: existing.work,
    seenUserKeys: existing.seenUserKeys,
    stats: existing.stats,
    status: existing.status,
  };
}

type BgMessage =
  | { type: 'CAPTURE_PROFILES'; profiles: CapturedProfile[]; sourceType: 'followers_list' | 'post_comments'; sourceRef: string }
  | { type: 'DP_BG_ENGINE'; enabled: boolean }
  | { type: 'DP_BG_RESUME' }
  | { type: 'DP_BG_RUN_NOW' }
  | { type: 'DP_BG_MONITOR_NOW' }
  | { type: 'DP_BG_CAMPAIGN_SAVE'; campaign: Campaign }
  | { type: 'DP_BG_CAMPAIGN_STATUS'; id: string; status: Campaign['status'] }
  | { type: 'DP_BG_CAMPAIGN_DELETE'; id: string }
  | { type: 'DP_BG_CLEAR_SYSTEM_WORK' }
  | { type: 'DP_BG_RESET_KEYWORDS' }
  | { type: 'DP_BG_PLACES'; query: string }
  | { type: 'DP_BG_INBOX' }
  | { type: 'DP_BG_SESSION' }
  | { type: 'DP_BG_SHOW_WORKER' };

async function handle(message: BgMessage): Promise<unknown> {
  switch (message.type) {
    case 'CAPTURE_PROFILES': {
      const profiles = await Promise.all(
        message.profiles.map(async (p) => ({ ...p, profilePicUrl: await toAvatarDataUrl(p.profilePicUrl) })),
      );
      const leads = profiles.map((p) => toLead(p, message.sourceType, message.sourceRef));
      const result = await withLock(() => upsertLeads(leads));
      return { type: 'CAPTURE_RESULT', ...result };
    }
    case 'DP_BG_ENGINE': {
      await mutateEngine((e) => {
        e.enabled = message.enabled;
        if (message.enabled) e.nextActionAt = 0;
      });
      if (message.enabled) tick();
      return { ok: true };
    }
    case 'DP_BG_RESUME': {
      await mutateEngine((e) => {
        e.pausedUntil = 0;
        e.pauseReason = undefined;
        e.nextActionAt = 0;
        e.actionsSinceRest = 0;
      });
      tick();
      return { ok: true };
    }
    case 'DP_BG_RUN_NOW':
      tick();
      return { ok: true };
    case 'DP_BG_MONITOR_NOW':
      try {
        await runMonitors(true);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    case 'DP_BG_CAMPAIGN_SAVE':
      await withLock(async () => {
        const all = await getCampaigns();
        const idx = all.findIndex((c) => c.id === message.campaign.id);
        if (idx === -1) all.unshift(message.campaign);
        else all[idx] = mergeCampaign(all[idx], message.campaign);
        await saveCampaigns(all);
      });
      return { ok: true };
    case 'DP_BG_CAMPAIGN_STATUS':
      await withLock(async () => {
        const all = await getCampaigns();
        const c = all.find((x) => x.id === message.id);
        if (c) {
          c.status = message.status;
          if (message.status === 'running') c.lastError = undefined;
        }
        await saveCampaigns(all);
      });
      if (message.status === 'running') tick();
      return { ok: true };
    case 'DP_BG_CAMPAIGN_DELETE':
      await withLock(async () => saveCampaigns((await getCampaigns()).filter((c) => c.id !== message.id)));
      return { ok: true };
    case 'DP_BG_CLEAR_SYSTEM_WORK':
      await mutateEngine((e) => (e.systemWork = []));
      return { ok: true };
    case 'DP_BG_PLACES':
      try {
        return { ok: true, places: await searchPlaces(message.query) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    case 'DP_BG_RESET_KEYWORDS':
      // Olvida a quién ya se respondió por palabra clave (para repetir pruebas).
      await mutateEngine((e) => {
        e.keywordHandled = [];
        e.lastCommentPk = {};
      });
      return { ok: true };
    case 'DP_BG_INBOX':
      try {
        return { ok: true, threads: await getInbox() };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    case 'DP_BG_SESSION':
      try {
        const s = await getSession();
        if (s.userId) await mutateEngine((e) => (e.ownUserId = s.userId));
        return { ok: true, ...s };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    case 'DP_BG_SHOW_WORKER': {
      const tabId = await getWorkerTab();
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true, state: 'normal' });
      return { ok: true };
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;
  if (type !== 'CAPTURE_PROFILES' && !(typeof type === 'string' && type.startsWith('DP_BG_'))) return false;
  handle(message as BgMessage)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true;
});
