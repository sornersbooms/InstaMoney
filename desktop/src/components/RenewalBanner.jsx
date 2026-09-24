import { useState } from 'react';
import { brand } from '../lib/brand.js';

/** Aviso cuando la licencia está por vencer (3 días o menos) o se trabaja sin conexión. */
export function RenewalBanner({ license, offline }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !license) return null;
  const expiring = typeof license.daysLeft === 'number' && license.daysLeft <= 3;
  if (!expiring && !offline) return null;

  function renew() {
    const text = encodeURIComponent(
      `Hola, quiero renovar mi licencia de ${brand.productName}. Mi correo: ${license.email ?? ''}`,
    );
    window.api.openExternal(`https://wa.me/${brand.whatsapp}?text=${text}`);
  }

  return (
    <div className="renewal-banner">
      <span>
        {offline
          ? '⚠️ Trabajando sin conexión al servidor de licencias.'
          : license.daysLeft <= 0
            ? '⚠️ Tu licencia vence hoy.'
            : `⚠️ Tu licencia vence en ${license.daysLeft} ${license.daysLeft === 1 ? 'día' : 'días'}.`}
      </span>
      {!offline && (
        <button className="btn btn-primary" onClick={renew}>
          Renovar por WhatsApp
        </button>
      )}
      <button className="btn-ghost" onClick={() => setDismissed(true)}>
        ✕
      </button>
    </div>
  );
}
