/**
 * Deep link oficial de Instagram para abrir directo el compositor de DM con un usuario
 * (el mismo formato que usan los botones "Enviar mensaje" de perfiles de negocio). Ahorra
 * el clic de "Enviar mensaje" en el perfil, pero el envío del mensaje lo sigue disparando
 * la persona pulsando "Enviar" dentro de Instagram.
 */
export function directMessageUrl(username: string): string {
  return `https://ig.me/m/${username}`;
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}
