// Formatting helpers shared across pages.

export function classNames(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function formatDuration(sec: number): string {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(iso);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toFixed(v % 1 === 0 ? 0 : 2)}`;
}

// Outcome / status → display metadata (label + token color class).
export const OUTCOME_META: Record<string, { label: string; tone: string }> = {
  booked: { label: "Booked", tone: "good" },
  answered: { label: "Answered", tone: "info" },
  message: { label: "Message", tone: "brand" },
  escalated: { label: "Escalated", tone: "danger" },
  in_progress: { label: "In progress", tone: "ink-3" },
  no_resolution: { label: "No resolution", tone: "warn" },
};

export function outcomeMeta(outcome: string | null): { label: string; tone: string } {
  return OUTCOME_META[outcome ?? "in_progress"] ?? {
    label: outcome ?? "—",
    tone: "ink-3",
  };
}
