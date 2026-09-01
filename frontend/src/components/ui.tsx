import type { ReactNode } from "react";
import { classNames } from "@/lib/format";

const TONE_CLASS: Record<string, string> = {
  good: "bg-good/12 text-good",
  info: "bg-info/12 text-info",
  brand: "bg-brand/12 text-brand",
  danger: "bg-danger/12 text-danger",
  warn: "bg-warn/15 text-warn",
  signal: "bg-signal/15 text-signal",
  "ink-3": "bg-surface-2 text-ink-3",
};

export function Chip({ tone = "ink-3", children }: { tone?: string; children: ReactNode }) {
  return <span className={classNames("chip", TONE_CLASS[tone] ?? TONE_CLASS["ink-3"])}>{children}</span>;
}

export function Dot({ tone = "ink-3" }: { tone?: string }) {
  const map: Record<string, string> = {
    good: "bg-good",
    info: "bg-info",
    brand: "bg-brand",
    danger: "bg-danger",
    warn: "bg-warn",
    signal: "bg-signal",
    "ink-3": "bg-ink-3",
  };
  return <span className={classNames("inline-block h-2 w-2 rounded-full", map[tone])} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={classNames(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {/* Page titles sit on the display axis but at a working size: light
            weight, display tracking, so they read as the same voice as the
            landing headline without shouting inside a dashboard. */}
        <h1
          className="font-display text-ink"
          style={{
            fontSize: "clamp(23px, 1.4vw + 15px, 30px)",
            fontWeight: "var(--fw-light)",
            letterSpacing: "var(--tr-title)",
            lineHeight: "1.12",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-ui font-light tracking-body text-ink-2">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-2">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={classNames(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-brand" : "bg-line",
      )}
    >
      <span
        className={classNames(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </div>
  );
}
