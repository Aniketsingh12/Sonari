import { classNames } from "@/lib/format";

// The signature motif: an equalizer that reads as "the line is live". It only
// *animates* where liveness is meaningful (an active line, a playing clip) —
// elsewhere it's a static mark. Reserving the motion keeps it a signal, not
// decoration, and avoids constant repaints.

const DELAYS = ["0ms", "180ms", "360ms", "120ms", "300ms"];
const HEIGHTS = [10, 16, 22, 14, 9];

export function Equalizer({
  live = false,
  className,
  size = 22,
}: {
  live?: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={classNames("inline-flex items-end gap-[3px]", className)}
      style={{ height: size }}
      aria-hidden="true"
    >
      {HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="eq-bar"
          style={{
            height: (h / 22) * size,
            // Longhand only — never the `animation` shorthand — so the style
            // key set stays stable between live and static renders.
            animationName: live ? "eq" : "none",
            animationDuration: "900ms",
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDelay: DELAYS[i],
            // Static bars keep a fixed, characterful silhouette.
            transform: live ? "none" : `scaleY(${(h / 22) * 0.85 + 0.15})`,
          }}
        />
      ))}
    </span>
  );
}

export function LivePill({ live }: { live: boolean }) {
  return (
    <span
      className={classNames(
        "chip border",
        live
          ? "bg-signal/12 text-signal border-signal/30"
          : "bg-surface-2 text-ink-3 border-line",
      )}
    >
      <Equalizer live={live} size={14} className={live ? "text-signal" : "text-ink-3"} />
      {live ? "Line live" : "Paused"}
    </span>
  );
}
