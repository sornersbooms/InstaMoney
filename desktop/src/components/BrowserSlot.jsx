import { useEffect, useRef } from 'react';

/**
 * Hueco sobre el que el proceso principal dibuja la vista nativa de Instagram. Aquí solo se
 * reserva el espacio y se le informa su posición cada vez que cambia el tamaño de la ventana.
 */
export function BrowserSlot() {
  const slotRef = useRef(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    const sync = () => {
      const rect = slot.getBoundingClientRect();
      window.api.instagram.setBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(slot);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      // Al desmontar (cerrar sesión de licencia) hay que replegar la vista nativa, si no
      // se queda dibujada encima de la pantalla de activación.
      window.api.instagram.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    };
  }, []);

  return <div className="browser-slot" ref={slotRef} />;
}
