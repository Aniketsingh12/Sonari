import type { ReactNode } from "react";
import { classNames } from "@/lib/format";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: string;
}) {
  const toneBg: Record<string, string> = {
    brand: "bg-brand/12 text-brand",
    good: "bg-good/12 text-good",
    info: "bg-info/12 text-info",
    signal: "bg-signal/15 text-signal",
    danger: "bg-danger/12 text-danger",
  };
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <p className="label">{label}</p>
        {icon && (
          <span
            className={classNames(
              "grid h-8 w-8 place-items-center rounded-lg",
              toneBg[tone] ?? toneBg.brand,
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
