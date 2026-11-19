/**
 * Onda de luz al pulsar cualquier elemento interactivo del panel (botones, chips, tarjetas de objetivo,
 * filas de lista, navegación). Un solo oyente global: no hace falta tocar cada componente.
 */
const TARGETS = '.btn, .chip, .preset, button.list-item, .pipe, .navbtn, .toggle-row, .segmented button';

export function installRipple(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const host = (e.target as HTMLElement | null)?.closest<HTMLElement>(TARGETS);
      if (!host || (host as HTMLButtonElement).disabled) return;
      const rect = host.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - rect.left - size / 2}px`;
      dot.style.top = `${e.clientY - rect.top - size / 2}px`;
      host.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
      // Respaldo: si la animación no llega a terminar (panel en segundo plano), se borra igual.
      setTimeout(() => dot.remove(), 900);
    },
    { passive: true },
  );
}
