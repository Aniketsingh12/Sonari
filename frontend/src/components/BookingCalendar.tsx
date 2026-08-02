import { useMemo } from "react";
import type { Booking } from "@/api/types";
import { classNames, formatTime, initials } from "@/lib/format";
import { IconClock } from "./icons";
import { Chip } from "./ui";

// Agenda-style calendar: bookings grouped by day. Responsive and dependency-free
// (a full month grid would fight small screens; the agenda reads well at any size).

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function BookingCalendar({ bookings }: { bookings: Booking[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Booking[]>();
    [...bookings]
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .forEach((b) => {
        const k = dayKey(b.start_at);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(b);
      });
    return Array.from(map.entries());
  }, [bookings]);

  return (
    <div className="space-y-6">
      {groups.map(([key, items]) => (
        <div key={key}>
          <div className="mb-2 flex items-center gap-3">
            <h3 className="font-display text-sm font-semibold text-ink">
              {dayLabel(items[0].start_at)}
            </h3>
            <span className="text-xs text-ink-3">{items.length} appointment{items.length > 1 ? "s" : ""}</span>
            <div className="h-px flex-1 bg-line" />
          </div>
          <div className="space-y-2">
            {items.map((b) => (
              <div
                key={b.id}
                className={classNames(
                  "flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3",
                  b.status === "cancelled" && "opacity-55",
                )}
              >
                <div className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-brand/10 py-1.5 text-brand">
                  <span className="font-mono text-sm font-semibold">
                    {formatTime(b.start_at)}
                  </span>
                  <span className="text-[10px] text-brand/70">{b.duration_min}m</span>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2">
                  {initials(b.customer_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {b.customer_name ?? "Guest"}
                  </p>
                  <p className="truncate text-xs text-ink-3">{b.service_name}</p>
                </div>
                {b.status === "cancelled" ? (
                  <Chip tone="danger">Cancelled</Chip>
                ) : b.call_id ? (
                  <Chip tone="brand">By agent</Chip>
                ) : (
                  <span className="hidden text-ink-3 sm:block">
                    <IconClock width={16} height={16} />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
