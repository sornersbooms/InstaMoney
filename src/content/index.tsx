import { createRoot } from 'react-dom/client';
import { FloatingWidget } from './FloatingWidget';

function mount() {
  const hostId = 'dropprospect-root-host';
  if (document.getElementById(hostId)) return;

  const host = document.createElement('div');
  host.id = hostId;
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(<FloatingWidget />);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  mount();
} else {
  document.addEventListener('DOMContentLoaded', mount);
}
