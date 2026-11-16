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
export async function toAvatarDataUrl(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith('data:')) return url;
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
