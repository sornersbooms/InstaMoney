/**
 * Deep link oficial de Instagram para abrir el chat con un usuario (el mismo que usan los
 * botones "Enviar mensaje" de los perfiles de negocio).
 */
export function directMessageUrl(username) {
  return `https://ig.me/m/${username}`;
}

export function profileUrl(username) {
  return `https://www.instagram.com/${username}/`;
}
