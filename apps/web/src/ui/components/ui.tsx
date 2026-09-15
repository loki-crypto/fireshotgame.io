import type { ComponentChildren, JSX } from "preact";
import { sfx } from "../../game/audio/Sfx";

export function Button(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; small?: boolean }) {
  const { variant = "primary", small, class: cls, className, onClick, ...rest } = props;
  return (
    <button
      type="button"
      {...(rest as JSX.ButtonHTMLAttributes<HTMLButtonElement>)}
      class={`btn btn-${variant}${small ? " btn-small" : ""} ${cls ?? className ?? ""}`}
      onClick={(e) => { sfx.unlock(); sfx.play("uiClick"); onClick?.(e); }}
    />
  );
}

export function Panel({ title, children, class: cls, actions }: { title?: ComponentChildren; children: ComponentChildren; class?: string; actions?: ComponentChildren }) {
  return (
    <section class={`panel ${cls ?? ""}`}>
      {title !== undefined && (
        <header class="panel-head">
          <h2>{title}</h2>
          {actions && <div class="panel-actions">{actions}</div>}
        </header>
      )}
      <div class="panel-body">{children}</div>
    </section>
  );
}

export function Overlay({ children, class: cls, label }: { children: ComponentChildren; class?: string; label: string }) {
  return (
    <div class={`overlay ${cls ?? ""}`} role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </div>
  );
}

export function Meter({ value, max, color, label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div class="meter" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div class="meter-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div class="spinner" role="status">
      <span class="spinner-ring" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Ícone SVG procedural a partir de forma + cor (usado em badges e inimigos). */
export function ShapeIcon({ shape, color, size = 48, muted = false }: { shape: string; color: string; size?: number; muted?: boolean }) {
  const c = muted ? "#3a4a60" : color;
  const common = { fill: "none", stroke: c, "stroke-width": 3, "stroke-linejoin": "round" as const, "stroke-linecap": "round" as const };
  let inner: JSX.Element;
  switch (shape) {
    case "packet": inner = <><rect x="10" y="16" width="28" height="18" rx="2" {...common} /><path d="M10 18 24 28 38 18" {...common} /></>; break;
    case "grid": inner = <><rect x="10" y="10" width="28" height="28" {...common} /><path d="M19.3 10v28M28.6 10v28M10 19.3h28M10 28.6h28" {...common} stroke-width={2} /></>; break;
    case "eye": inner = <><path d="M6 24s7-11 18-11 18 11 18 11-7 11-18 11S6 24 6 24z" {...common} /><circle cx="24" cy="24" r="5" fill={c} /></>; break;
    case "lock": inner = <><rect x="12" y="22" width="24" height="17" rx="3" {...common} /><path d="M17 22v-5a7 7 0 0 1 14 0v5" {...common} /></>; break;
    case "pistol": inner = <><path d="M8 16h30v8H22l-2 12h-8l2-12H8z" {...common} /></>; break;
    case "hook": inner = <><path d="M30 8v18a8 8 0 0 1-16 0v-4" {...common} /><path d="M14 22l-4 4" {...common} /></>; break;
    case "octa": inner = <><path d="M24 6 40 24 24 42 8 24z" {...common} /><path d="M8 24h32M24 6v36" {...common} stroke-width={1.5} /></>; break;
    case "shield": inner = <><path d="M24 6 38 12v10c0 10-6 17-14 20-8-3-14-10-14-20V12z" {...common} /><path d="M18 24l5 5 8-9" {...common} /></>; break;
    case "pulse": inner = <><path d="M6 26h9l4-10 6 18 5-12 3 4h9" {...common} /></>; break;
    case "flag": inner = <><path d="M12 42V8M12 10h22l-5 7 5 7H12" {...common} /></>; break;
    case "worm": inner = <><circle cx="14" cy="28" r="6" {...common} /><circle cx="25" cy="24" r="5" {...common} /><circle cx="34" cy="20" r="4" {...common} /></>; break;
    case "drone": inner = <><path d="M24 12 34 34H14z" {...common} /><ellipse cx="24" cy="12" rx="12" ry="3" {...common} /></>; break;
    default: inner = <circle cx="24" cy="24" r="14" {...common} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" class={`shape-icon ${muted ? "muted" : ""}`}>
      <circle cx="24" cy="24" r="22" fill={muted ? "#0b111b" : "#07101c"} stroke={c} stroke-opacity={0.35} />
      {inner}
    </svg>
  );
}
