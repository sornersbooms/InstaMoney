/**
 * Antes se usaba ig.me/m/usuario, pero en Chrome de escritorio esa dirección da página de error.
 * Se abre el perfil: ahí el botón «Enviar mensaje» abre el chat (el botón flotante lo detecta).
 */
export function directMessageUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}
