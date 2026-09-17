import { upsertLeads } from '@/lib/storage';
import { onMessage } from '@/lib/messaging';
import type { Lead } from '@/lib/types';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

function toLead(profile: {
  username: string;
  fullName?: string;
  bio?: string;
  profilePicUrl?: string;
  followerCount?: number;
  isBusiness?: boolean;
}, sourceType: Lead['sourceType'], sourceRef: string): Lead {
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
    tags: [],
    notes: '',
  };
}

onMessage(async (message) => {
  if (message.type === 'CAPTURE_PROFILES') {
    const leads = message.profiles.map((p) => toLead(p, message.sourceType, message.sourceRef));
    const result = await upsertLeads(leads);
    return { type: 'CAPTURE_RESULT', ...result };
  }
  return undefined;
});
