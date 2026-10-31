"use client";

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "./icon";

export { Icon, type IconName };

// TypeScript-udgaver af komponenterne i Pub Crawl Design System. Klasserne (pc-*) ligger i design/pub-crawl.css.

type Variant = "primary" | "gold" | "secondary" | "ghost" | "danger";

export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span
      className="pc-spinner"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size }}
    />
  );
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  fullWidth,
  loading,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  fullWidth?: boolean;
  loading?: boolean;
}) {
  const iconSize = size === "sm" ? 16 : size === "lg" ? 20 : 18;
  const cls = [
    "pc-btn",
    `pc-btn--${variant}`,
    size !== "md" && `pc-btn--${size}`,
    fullWidth && "pc-btn--full",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  // Under ventetid skifter ikonet til en spinner, så knappen bevarer sin bredde.
  return (
    <button type="button" className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={iconSize - 2} /> : icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
  variant?: Variant;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`pc-btn pc-ibtn pc-btn--${variant}${size === "sm" ? " pc-btn--sm" : ""} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? 16 : 20} />
    </button>
  );
}

export function Badge({
  tone = "green",
  icon,
  children,
}: {
  tone?: "green" | "gold" | "oxblood" | "outline";
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={`pc-badge pc-badge--${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Card({
  variant = "plain",
  padding,
  style,
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "plain" | "framed" | "inverse";
  padding?: CSSProperties["padding"];
}) {
  return (
    <div className={`pc-card pc-card--${variant} ${className}`} style={{ padding, ...style }} {...rest}>
      {children}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  icon,
  id,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const shown = error || hint;
  return (
    <label className={`pc-field ${className}`} htmlFor={inputId}>
      {label && <span className="pc-field__label">{label}</span>}
      <span className={`pc-input${error ? " pc-input--error" : ""}`}>
        {icon && <Icon name={icon} size={18} />}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={shown ? hintId : undefined}
          {...rest}
        />
      </span>
      {shown && (
        <span id={hintId} className={`pc-field__hint${error ? " is-error" : ""}`}>
          {shown}
        </span>
      )}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`pc-switch${checked ? " is-on" : ""}`}
    >
      <span className="pc-switch__track">
        <span className="pc-switch__thumb" />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

export type AvatarTone = "green" | "gold" | "oxblood" | "cream";
export const AVATAR_TONES: AvatarTone[] = ["green", "gold", "oxblood", "cream"];

export function Avatar({
  name,
  size = 40,
  tone = "green",
  ring,
}: {
  name: string;
  size?: number;
  tone?: AvatarTone;
  ring?: boolean;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={`pc-avatar pc-avatar--${tone}${ring ? " is-ring" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      title={name}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

export function StopCard({
  number,
  total,
  name,
  time,
  note,
  status = "upcoming",
  onClick,
  children,
}: {
  number: number;
  total?: number;
  name: string;
  time?: string;
  note?: ReactNode;
  status?: "upcoming" | "current" | "done";
  onClick?: () => void;
  children?: ReactNode;
}) {
  const done = status === "done";
  // Kan kortet trykkes på, kan det også nås med tastatur og skærmlæser. Knapperne inden i er sig selv.
  const action = onClick
    ? {
        role: "button",
        tabIndex: 0,
        onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
          if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          onClick();
        },
      }
    : {};
  return (
    <div
      className={`pc-stop pc-stop--${status}`}
      onClick={onClick}
      style={onClick ? undefined : { cursor: "default" }}
      {...action}
    >
      <div className="pc-stop__num">{done ? <Icon name="check" size={18} /> : number}</div>
      <div className="pc-stop__main">
        <div className="pc-stop__meta">
          Pub {number}
          {total ? ` af ${total}` : ""}
          {time ? ` · ${time}` : ""}
        </div>
        <div className="pc-stop__name">{name}</div>
        {note && <div className="pc-stop__note">{note}</div>}
      </div>
      {status === "current" && <Badge tone="gold">Nu</Badge>}
      {children}
    </div>
  );
}

export function TabBar<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string; icon: IconName }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <nav className="pc-tabbar">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`pc-tabbar__item${value === it.id ? " is-active" : ""}`}
          aria-current={value === it.id ? "page" : undefined}
          onClick={() => onChange(it.id)}
        >
          <Icon name={it.icon} size={22} />
          {it.label}
        </button>
      ))}
    </nav>
  );
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="pc-tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          className={`pc-tab${value === it.id ? " is-active" : ""}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({
  open,
  eyebrow,
  title,
  children,
  actions,
  onClose,
  leaving,
}: {
  open: boolean;
  eyebrow?: string;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  leaving?: boolean;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Fokus flytter ind i dialogen, bliver der, Escape lukker, og fokus kommer tilbage bagefter.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      Array.from(
        box.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex='-1'])") ?? [],
      );
    if (!box.current?.contains(document.activeElement)) focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={`pc-dialog__scrim${leaving ? " is-leaving" : ""}`} onClick={leaving ? undefined : onClose}>
      <div
        ref={box}
        className="pc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {eyebrow && <div className="pc-dialog__eyebrow">{eyebrow}</div>}
        {title && (
          <h2 id={titleId} className="pc-dialog__title">
            {title}
          </h2>
        )}
        {children && <div className="pc-dialog__body">{children}</div>}
        {actions && <div className="pc-dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Toast({
  message,
  tone = "default",
  icon,
  leaving,
  action,
}: {
  message: string;
  tone?: "default" | "danger";
  icon?: IconName;
  leaving?: boolean;
  // offline-undo: en knap i toasten, fx "Fortryd". Ghost-knap i guld som andre knapper på mørk bund.
  // Skærmlæsere får teksten fra en live region, der altid er der (se AskProvider).
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className={`pc-toast pc-toast--${tone}${leaving ? " is-leaving" : ""}${action ? " pc-on-dark" : ""}`}
      style={action ? { pointerEvents: "auto", padding: "4px 4px 4px 16px", maxWidth: "100%" } : undefined}
    >
      <Icon name={icon ?? (tone === "danger" ? "alert-triangle" : "check")} size={18} />
      <span style={action ? { flex: 1, minWidth: 0 } : undefined}>{message}</span>
      {action && (
        <Button
          variant="ghost"
          onClick={leaving ? undefined : action.onClick}
          style={{ flex: "none", paddingLeft: 14, paddingRight: 14 }}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function Logo({
  variant = "lockup",
  tone = "onDark",
  size = 1,
  est = "J-DAG 2026",
  tagline = "GOD ØL · GODT SELSKAB",
}: {
  variant?: "lockup" | "wordmark" | "monogram";
  tone?: "onDark" | "onLight";
  size?: number;
  est?: string;
  tagline?: string;
}) {
  const dark = tone === "onDark";
  const main = dark ? "var(--gold-500)" : "var(--green-800)";
  const sub = dark ? "var(--cream-200)" : "var(--oxblood-700)";
  if (variant === "wordmark") {
    return (
      <span style={{ font: `italic ${40 * size}px/1 var(--font-display)`, color: main, whiteSpace: "nowrap" }}>
        Pub Crawl
      </span>
    );
  }
  if (variant === "monogram") {
    return (
      <span
        style={{
          width: 96 * size,
          height: 96 * size,
          borderRadius: 22 * size,
          background: dark ? "var(--green-800)" : "var(--cream-100)",
          border: `${Math.max(3, Math.round(4 * size))}px double var(--gold-500)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          color: main,
          font: `italic ${44 * size}px/1 var(--font-display)`,
        }}
        aria-label="Pub Crawl"
      >
        Pc
      </span>
    );
  }
  return (
    <span
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 14 * size, color: main }}
      aria-label="Pub Crawl"
    >
      {est && (
        <span style={{ font: `600 ${12 * size}px/1 var(--font-body)`, letterSpacing: ".4em", whiteSpace: "nowrap" }}>
          — {est} —
        </span>
      )}
      <span style={{ font: `italic ${92 * size}px/0.9 var(--font-display)`, textAlign: "center" }}>
        Pub
        <br />
        Crawl
      </span>
      {tagline && (
        <span
          style={{
            borderTop: `1px solid ${main}`,
            paddingTop: 10 * size,
            font: `600 ${11 * size}px/1 var(--font-body)`,
            letterSpacing: ".35em",
            whiteSpace: "nowrap",
            color: sub,
          }}
        >
          {tagline}
        </span>
      )}
    </span>
  );
}

// Den grønne topbjælke med guld-eyebrow, kursiv titel og den tykke dobbelte guldstreg.
export function Header({
  eyebrow,
  eyebrowKey,
  title,
  left,
  right,
  children,
}: {
  eyebrow?: ReactNode;
  // Eyebrowen toner ind, når nøglen skifter. Uden nøgle er det teksten selv.
  eyebrowKey?: string;
  title: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header
      className="pc-on-dark"
      style={{
        background: "var(--green-800)",
        color: "var(--cream-100)",
        padding: "max(14px, env(safe-area-inset-top)) 16px 16px",
        borderBottom: "var(--rule-double-thick)",
      }}
    >
      {left && <div style={{ marginBottom: 6, marginLeft: -10 }}>{left}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && (
            <div
              key={eyebrowKey ?? (typeof eyebrow === "string" ? eyebrow : undefined)}
              className="pc-eyebrow pc-fade-in"
              style={{ color: "var(--gold-500)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {eyebrow}
            </div>
          )}
          <h1
            style={{
              font: "italic 34px/1.05 var(--font-display)",
              marginTop: 8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {/* Ny titel toner ind, når man skifter fane eller pub. */}
            <span key={typeof title === "string" ? title : undefined} className="pc-fade-in">
              {title}
            </span>
          </h1>
        </div>
        {right}
      </div>
      {children}
    </header>
  );
}

// Mindre afsnitsoverskrift i kortene: eyebrow i oxblod over en serif-titel.
export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 10 }}>
      <div style={{ flex: 1 }}>
        {eyebrow && (
          <div className="pc-label" style={{ color: "var(--oxblood-700)", marginBottom: 6 }}>
            {eyebrow}
          </div>
        )}
        <h2 style={{ font: "var(--fs-h3)/1.1 var(--font-display)" }}>{title}</h2>
      </div>
      {right}
    </div>
  );
}
