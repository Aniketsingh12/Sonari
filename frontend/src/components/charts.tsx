import { useState } from "react";
import type { OutcomeSlice, TimePoint } from "@/api/types";
import { classNames, outcomeMeta } from "@/lib/format";

const SERIES = ["--c1", "--c2", "--c3", "--c4", "--c5"];
const cvar = (v: string) => `rgb(var(${v}))`;

// -------------------------------------------------------------- Bar chart
export function BarChart({
  data,
  height = 200,
  color = "--brand",
  unit = "",
}: {
  data: TimePoint[];
  height?: number;
  color?: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = Math.max(data.length * 26, 320);
  const H = height;
  const pad = { top: 16, right: 8, bottom: 26, left: 8 };
  const plotH = H - pad.top - pad.bottom;
  const bw = (W - pad.left - pad.right) / data.length;
  const barW = Math.min(22, bw * 0.62);

  // Two recessive gridlines.
  const grids = [0.5, 1].map((f) => pad.top + plotH * (1 - f));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label="Bar chart"
        className="min-w-[320px]"
      >
        {grids.map((y, i) => (
          <line
            key={i}
            x1={pad.left}
            x2={W - pad.right}
            y1={y}
            y2={y}
            stroke={cvar("--chart-grid")}
            strokeWidth={1}
          />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * plotH;
          const x = pad.left + i * bw + (bw - barW) / 2;
          const y = pad.top + plotH - h;
          const active = hover === i;
          return (
            <g key={i}>
              <rect
                x={x}
                y={Math.min(y, pad.top + plotH - 2)}
                width={barW}
                height={Math.max(2, h)}
                rx={4}
                fill={cvar(color)}
                opacity={hover === null || active ? 1 : 0.45}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              {active && (
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={cvar("--ink")}
                >
                  {d.value}
                  {unit}
                </text>
              )}
              {i % Math.ceil(data.length / 8 || 1) === 0 && (
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill={cvar("--ink-3")}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// -------------------------------------------------------------- Peak hours
export function PeakHours({ data }: { data: TimePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height: 96 }}>
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          const active = hover === i;
          return (
            <button
              key={i}
              className="group relative flex-1"
              style={{ height: "100%" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              aria-label={`${d.label}: ${d.value} calls`}
            >
              <span
                className="absolute bottom-0 left-0 right-0 rounded-[3px] transition-opacity"
                style={{
                  height: `${Math.max(4, h)}%`,
                  background: cvar("--c1"),
                  opacity: hover === null || active ? 1 : 0.4,
                }}
              />
              {active && (
                <span className="absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-medium text-bg shadow-pop">
                  {d.label} · {d.value}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-3">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>11p</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- Donut
export function OutcomeDonut({ data }: { data: OutcomeSlice[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;

  if (total === 0) {
    return (
      <div className="grid h-[160px] place-items-center text-sm text-ink-3">
        No calls yet
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
      <svg viewBox="0 0 160 160" width={160} height={160} className="shrink-0">
        <circle cx="80" cy="80" r={R} fill="none" stroke={cvar("--surface-2")} strokeWidth={16} />
        {data.map((d, i) => {
          const frac = d.count / total;
          const len = frac * C;
          const seg = (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={cvar(SERIES[i % SERIES.length])}
              strokeWidth={16}
              strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
              strokeLinecap="round"
            />
          );
          offset += len;
          return seg;
        })}
        <text x="80" y="74" textAnchor="middle" fontSize={26} fontWeight={700} fill={cvar("--ink")}>
          {total}
        </text>
        <text x="80" y="94" textAnchor="middle" fontSize={11} fill={cvar("--ink-3")}>
          calls
        </text>
      </svg>
      <ul className="flex flex-col gap-2">
        {data.map((d, i) => {
          const meta = outcomeMeta(d.outcome);
          return (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <span
                className="h-3 w-3 rounded-[3px]"
                style={{ background: cvar(SERIES[i % SERIES.length]) }}
              />
              <span className="text-ink-2">{meta.label}</span>
              <span className="ml-auto font-mono font-semibold text-ink tabular-nums">
                {d.count}
              </span>
              <span className="w-10 text-right font-mono text-xs text-ink-3">
                {Math.round((d.count / total) * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// -------------------------------------------------------------- Ring gauge
export function Gauge({ value, label }: { value: number; label: string }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 110 110" width={92} height={92}>
        <circle cx="55" cy="55" r={R} fill="none" stroke={cvar("--surface-2")} strokeWidth={10} />
        <circle
          cx="55"
          cy="55"
          r={R}
          fill="none"
          stroke={cvar("--good")}
          strokeWidth={10}
          strokeDasharray={`${pct * C} ${C}`}
          strokeDashoffset={C * 0.25}
          transform="rotate(-90 55 55)"
          strokeLinecap="round"
        />
        <text x="55" y="60" textAnchor="middle" fontSize={22} fontWeight={700} fill={cvar("--ink")}>
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <p className={classNames("text-sm text-ink-2")}>{label}</p>
    </div>
  );
}
