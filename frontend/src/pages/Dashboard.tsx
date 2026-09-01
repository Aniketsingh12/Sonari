import { Link } from "react-router-dom";
import { useQuery } from "@/api/hooks";
import type {
  Booking,
  Business,
  CallSummary,
  DashboardStats,
  Health,
} from "@/api/types";
import { CallCard } from "@/components/CallCard";
import { Gauge } from "@/components/charts";
import { ProviderPill } from "@/components/ProviderBadge";
import { StatCard } from "@/components/StatCard";
import { EmptyState, PageHeader, Spinner } from "@/components/ui";
import {
  IconArrowRight,
  IconCalendar,
  IconMessage,
  IconPhone,
  IconWand,
} from "@/components/icons";
import { classNames, formatDuration, formatTime } from "@/lib/format";

export function Dashboard({ business }: { business: Business | null }) {
  // Only the receptionist (no instructions → structured booking brain) books
  // appointments and escalates, so bookings/resolution panels are meaningless
  // for a tutor or coding helper. Everything else is conversation-shaped.
  const books = !business?.system_prompt;

  const stats = useQuery<DashboardStats>("/dashboard/stats");
  const calls = useQuery<CallSummary[]>("/dashboard/calls?limit=5");
  const bookings = useQuery<Booking[]>(books ? "/bookings" : null);
  const health = useQuery<Health>("/health");

  const s = stats.data;
  const upcoming = (bookings.data ?? [])
    .filter((b) => new Date(b.start_at) >= new Date() && b.status !== "cancelled")
    .slice(0, 4);

  return (
    <div>
      <PageHeader
        title={greeting(business?.name)}
        subtitle="Here's what your agent has been handling."
        actions={
          <Link to="/simulator" className="btn-primary">
            <IconWand width={16} height={16} /> Talk to your agent
          </Link>
        }
      />

      {/* Provider strip — shows the open-source / paid / mock engines in play. */}
      {health.data && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
          <span className="label mr-1">Pipeline</span>
          {health.data.providers.map((p) => (
            <ProviderPill key={p.kind} p={p} />
          ))}
          <Link
            to="/settings"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            Configure <IconArrowRight width={13} height={13} />
          </Link>
        </div>
      )}

      {/* Stat row — booking tiles only for the receptionist. */}
      <div
        className={classNames(
          "grid grid-cols-2 gap-3 sm:gap-4",
          books ? "lg:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
        <StatCard
          label={books ? "Calls today" : "Conversations today"}
          value={s?.calls_today ?? <Spinner className="text-ink-3" />}
          hint={s ? `${s.calls_week} this week` : ""}
          icon={<IconPhone width={16} height={16} />}
        />
        {books && (
          <StatCard
            label="Bookings today"
            value={s?.bookings_today ?? "–"}
            hint={s ? `${s.bookings_week} this week` : ""}
            icon={<IconCalendar width={16} height={16} />}
            tone="good"
          />
        )}
        <StatCard
          label={books ? "Messages" : "This week"}
          value={(books ? s?.messages_pending : s?.calls_week) ?? "–"}
          hint={books ? "awaiting follow-up" : "conversations handled"}
          icon={<IconMessage width={16} height={16} />}
          tone="info"
        />
        <StatCard
          label={books ? "Avg. call" : "Avg. length"}
          value={s ? formatDuration(Math.round(s.avg_duration_sec)) : "–"}
          hint={books && s ? `${Math.round(s.resolution_rate * 100)}% resolved` : ""}
          icon={<IconWand width={16} height={16} />}
          tone="signal"
        />
      </div>

      <div
        className={classNames("mt-6 grid gap-6", books && "lg:grid-cols-3")}
      >
        {/* Recent conversations */}
        <section className={books ? "lg:col-span-2" : ""}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">
              {books ? "Recent calls" : "Recent conversations"}
            </h2>
            <Link
              to="/calls"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              View all <IconArrowRight width={14} height={14} />
            </Link>
          </div>
          {calls.loading ? (
            <div className="grid place-items-center py-12">
              <Spinner className="text-ink-3" />
            </div>
          ) : calls.data && calls.data.length > 0 ? (
            <div className="space-y-2">
              {calls.data.map((c) => (
                <CallCard key={c.id} call={c} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconPhone width={28} height={28} />}
              title={books ? "No calls yet" : "No conversations yet"}
              hint={
                books
                  ? "When a caller reaches your agent, the transcript and outcome will appear here."
                  : "When someone talks to your agent, the transcript will appear here."
              }
              action={
                <Link to="/simulator" className="btn-primary">
                  Talk to your agent
                </Link>
              }
            />
          )}
        </section>

        {/* Side column — resolution/bookings are receptionist-only concepts. */}
        {books && (
        <aside className="space-y-6">
          <div className="card p-5">
            <h3 className="mb-3 font-display text-base font-semibold text-ink">
              Resolution rate
            </h3>
            <Gauge value={s?.resolution_rate ?? 0} label="of calls handled without a human" />
            <p className="mt-3 text-xs text-ink-3">
              {s?.escalations_week ?? 0} escalation
              {(s?.escalations_week ?? 0) === 1 ? "" : "s"} in the last 7 days.
            </p>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink">Upcoming</h3>
              <Link to="/bookings" className="text-sm font-medium text-brand hover:underline">
                All
              </Link>
            </div>
            {upcoming.length ? (
              <ul className="space-y-2.5">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex items-center gap-3">
                    <span className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-brand/10 py-1 text-brand">
                      <span className="font-mono text-xs font-semibold">
                        {formatTime(b.start_at)}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {b.customer_name ?? "Guest"}
                      </p>
                      <p className="truncate text-xs text-ink-3">{b.service_name}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-ink-3">No upcoming bookings.</p>
            )}
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}

function greeting(name?: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name.split(" ")[0]}` : part;
}
