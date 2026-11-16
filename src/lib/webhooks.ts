import { getWebhooks } from './storage';
import type { Lead, WebhookEvent } from './types';

function leadPayload(lead: Partial<Lead>) {
  // La foto va como data URL (pesada): no se manda por webhook.
  const rest = { ...lead };
  delete rest.profilePicUrl;
  return { ...rest, profileUrl: lead.username ? `https://www.instagram.com/${lead.username}/` : undefined };
}

/**
 * Envía el evento a todos los webhooks activos suscritos (CRM, email marketing, Make/Zapier/n8n,
 * flujos de WhatsApp...). Nunca lanza: un webhook caído no debe frenar la automatización.
 */
export async function emitWebhook(event: WebhookEvent, lead: Partial<Lead>, extra: Record<string, unknown> = {}): Promise<void> {
  const hooks = (await getWebhooks()).filter((h) => h.enabled && h.events.includes(event));
  await Promise.all(
    hooks.map(async (h) => {
      try {
        await fetch(h.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(h.secret ? { 'X-InstaMoney-Secret': h.secret } : {}) },
          body: JSON.stringify({ event, at: new Date().toISOString(), lead: leadPayload(lead), ...extra }),
        });
      } catch {
        /* sin permiso de host o URL caída: se ignora */
      }
    }),
  );
}
