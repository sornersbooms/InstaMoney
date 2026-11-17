import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ───────────────────────────── iconos (trazos estilo Lucide) ─────────────────────────────

const PATHS = {
  home: ['m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V13h6v9'],
  rocket: [
    'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
    'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z',
    'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0',
    'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  ],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  userPlus: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M19 8v6', 'M22 11h-6'],
  userMinus: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M22 11h-6'],
  message: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'],
  inbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  more: ['M12 12h.01', 'M19 12h.01', 'M5 12h.01'],
  play: ['M7 4v16l13-8z'],
  pause: ['M7 4h3v16H7z', 'M14 4h3v16h-3z'],
  power: ['M12 2v10', 'M18.4 6.6a9 9 0 1 1-12.77.04'],
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  check: ['M20 6 9 17l-5-5'],
  search: ['M21 21l-4.3-4.3', 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8'],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  chevronRight: ['m9 18 6-6-6-6'],
  chevronLeft: ['m15 18-6-6 6-6'],
  chevronDown: ['m6 9 6 6 6-6'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  edit: ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12'],
  sparkles: ['M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z', 'M19 3v4', 'M17 5h4'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  eye: ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
  clock: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 6v6l4 2'],
  alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  info: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 16v-4', 'M12 8h.01'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  hash: ['M4 9h16', 'M4 15h16', 'M10 3 8 21', 'M16 3l-2 18'],
  pin: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  image: ['M3 3h18v18H3z', 'm21 15-5-5L5 21', 'M10 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0'],
  tag: ['M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.6-8.6a1 1 0 0 0 0-1.41z', 'M7 7h.01'],
  bot: ['M12 8V4H8', 'M4 8h16v12H4z', 'M2 14h2', 'M20 14h2', 'M15 13v2', 'M9 13v2'],
  window: ['M3 4h18v16H3z', 'M3 9h18', 'M7 6.5h.01'],
  target: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0', 'M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0'],
  filter: ['M22 3H2l8 9.46V19l4 2v-8.54z'],
  repeat: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  key: ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4'],
  volume: ['M11 5 6 9H2v6h4l5 4V5z', 'M15.54 8.46a5 5 0 0 1 0 7.07'],
  flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
  broom: ['M19 21H5', 'M12 3v10', 'M8 13h8l2 8H6z'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 6-10 7L2 6'],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'],
  gift: ['M20 12v10H4V12', 'M2 7h20v5H2z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z'],
  lock: ['M5 11h14v10H5z', 'M7 11V7a5 5 0 0 1 10 0v4'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, stroke = 2, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  const dots = name === 'more';
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={dots ? 3.2 : stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// ───────────────────────────── controles ─────────────────────────────

type BtnVariant = 'default' | 'primary' | 'brand' | 'soft' | 'ghost' | 'success' | 'danger' | 'danger-ghost';

export function Button({
  children,
  icon,
  variant = 'default',
  size,
  block,
  iconOnly,
  title,
  onClick,
  disabled,
  type = 'button',
}: {
  children?: ReactNode;
  icon?: IconName;
  variant?: BtnVariant;
  size?: 'sm' | 'lg';
  block?: boolean;
  iconOnly?: boolean;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const cls = ['btn', variant !== 'default' && variant, size, block && 'block', iconOnly && 'icon'].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title} aria-label={iconOnly ? title : undefined}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

/** Fila con icono, título, descripción e interruptor; el contenido extra aparece al activarla. */
export function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
  children,
}: {
  icon: IconName;
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <>
      <div className={`toggle-row${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
        <div className="ti">
          <Icon name={icon} size={16} />
        </div>
        <div className="tt">
          <b>{title}</b>
          {desc && <span>{desc}</span>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Switch checked={checked} onChange={onChange} label={title} />
        </div>
      </div>
      {checked && children && <div className="toggle-body">{children}</div>}
    </>
  );
}

export function Field({ label, hint, children }: { label?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function NumberInput({ value, onChange, min = 0, max, placeholder }: { value?: number; onChange: (v: number | undefined) => void; min?: number; max?: number; placeholder?: string }) {
  return (
    <input
      className="input"
      type="number"
      min={min}
      max={max}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        if (e.target.value === '') return onChange(undefined);
        let v = Math.max(min, Number(e.target.value));
        if (max != null) v = Math.min(max, v);
        onChange(v);
      }}
    />
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="input-icon" style={{ width: '100%' }}>
      <Icon name="search" size={15} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string; icon?: IconName }>; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)} role="tab" aria-selected={o.value === value}>
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, count, color }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number; color?: string }) {
  return (
    <button className={`chip${active ? ' active' : ''}`} onClick={onClick}>
      {color && <span className="sw" style={{ background: color }} />}
      {children}
      {count != null && <span className="count">{count}</span>}
    </button>
  );
}

export function Badge({ tone, children, pulse }: { tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info'; children: ReactNode; pulse?: boolean }) {
  return (
    <span className={`badge${tone ? ` ${tone}` : ''}`}>
      {pulse && <span className="pulse" />}
      {children}
    </span>
  );
}

export function Progress({ value, max, tone }: { value: number; max: number; tone?: 'success' | 'warning' | 'danger' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const auto = tone ?? (pct >= 100 ? 'danger' : undefined);
  return (
    <div className={`progress${auto ? ` ${auto}` : ''}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

const AVATAR_COLORS = ['#7b4dff', '#d63cbf', '#ff7a45', '#16a34a', '#2f7cf6', '#e5484d', '#0ea5a4', '#a855f7'];

export function Avatar({ src, name, size }: { src?: string; name: string; size?: 'sm' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const cls = `avatar${size ? ` ${size}` : ''}`;
  if (src && !failed) return <img className={cls} src={src} alt="" onError={() => setFailed(true)} />;
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <div className={cls} style={{ background: color }}>
      {name.replace(/^@/, '').charAt(0).toUpperCase()}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ei">
        <Icon name={icon} size={24} />
      </div>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Callout({ tone = 'info', icon, children }: { tone?: 'info' | 'warning' | 'danger' | 'primary'; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`callout ${tone}`}>
      <Icon name={icon ?? (tone === 'warning' || tone === 'danger' ? 'alert' : 'info')} size={16} />
      <div>{children}</div>
    </div>
  );
}

export function PageHead({ title, subtitle, onBack, actions }: { title: string; subtitle?: string; onBack?: () => void; actions?: ReactNode }) {
  return (
    <div className="page-head">
      {onBack && <Button iconOnly icon="chevronLeft" variant="ghost" title="Volver" onClick={onBack} />}
      <div className="grow">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Fold({ icon, title, sub, defaultOpen, children }: { icon?: IconName; title: string; sub?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="fold" open={defaultOpen}>
      <summary>
        {icon && <Icon name={icon} size={17} />}
        <span className="grow">
          {title}
          {sub && <span className="muted" style={{ display: 'block', fontWeight: 400 }}>{sub}</span>}
        </span>
        <Icon name="chevronRight" size={16} className="chev" />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

/** Menú de "más opciones" (⋯). */
export function Menu({ items }: { items: Array<{ label: string; icon: IconName; onClick: () => void; danger?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <Button iconOnly size="sm" icon="more" variant="ghost" title="Más opciones" onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="menu" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              className={it.danger ? 'danger' : ''}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              <Icon name={it.icon} size={15} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Botón que pide un segundo clic para confirmar acciones destructivas. */
export function ConfirmButton({ children, confirmLabel = '¿Seguro?', onConfirm, icon = 'trash', size }: { children?: ReactNode; confirmLabel?: string; onConfirm: () => void; icon?: IconName; size?: 'sm' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      size={size}
      icon={icon}
      variant={armed ? 'danger' : 'danger-ghost'}
      iconOnly={!children && !armed}
      title={typeof children === 'string' ? children : 'Eliminar'}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

// ───────────────────────────── avisos (toasts) ─────────────────────────────

interface ToastItem {
  id: number;
  text: string;
  error?: boolean;
}
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((v) => [...v, { id, text, error }]);
    setTimeout(() => setItems((v) => v.filter((x) => x.id !== id)), error ? 4500 : 2200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast${t.error ? ' error' : ''}`}>
            <Icon name={t.error ? 'alert' : 'check'} size={15} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ───────────────────────────── utilidades ─────────────────────────────

export function timeAgo(ts?: number): string {
  if (!ts) return '';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  return `hace ${Math.round(d / 7)} sem`;
}

export function bg<T = { ok: boolean; error?: string }>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
