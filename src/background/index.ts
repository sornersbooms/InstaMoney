import { upsertLeads } from '@/lib/storage';
import { onMessage } from '@/lib/messaging';
import type { Lead } from '@/lib/types';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

const AVATAR_SIZE = 48;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Las URLs de avatar de Instagram vienen firmadas y caducan a los pocos días, así que guardar
 * el enlace deja las fotos rotas al poco tiempo. Descargamos la imagen una vez y la guardamos
 * reescalada dentro del propio lead. Va en el service worker porque ahí sí aplican los
 * host_permissions del CDN.
 */
async function toAvatarDataUrl(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(AVATAR_SIZE, AVATAR_SIZE);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    bitmap.close();
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(await jpeg.arrayBuffer()))}`;
  } catch {
    return undefined;
  }
}

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
    const profiles = await Promise.all(
      message.profiles.map(async (p) => ({
        ...p,
        profilePicUrl: p.profilePicUrl ? await toAvatarDataUrl(p.profilePicUrl) : undefined,
      })),
    );
    const leads = profiles.map((p) => toLead(p, message.sourceType, message.sourceRef));
    const result = await upsertLeads(leads);
    return { type: 'CAPTURE_RESULT', ...result };
  }
  return undefined;
});
