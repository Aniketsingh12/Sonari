import { useQuery } from "@/api/hooks";
import type { Analytics as AnalyticsT, Business, TimePoint } from "@/api/types";
import { BarChart, OutcomeDonut, PeakHours } from "@/components/charts";
import { StatCard } from "@/components/StatCard";
import { PageHeader, Spinner } from "@/components/ui";
import { IconCalendar, IconChart, IconClock, IconPhone } from "@/components/icons";

function peakLabel(points: TimePoint[]): string {
  const best = points.reduce<TimePoint | null>(
    (a, p) => (p.value > (a?.value ?? 0) ? p : a),
    null,
  );
  return best && best.value > 0 ? best.label : "–";
}

export function Analytics({ business }: { business?: Business | null }) {
  // Bookings, outcomes, and resolution only exist for the receptionist brain;
  // a generic agent's analytics are about conversations, not calls.
  const books = !business?.system_prompt;
  const { data, loading } = useQuery<AnalyticsT>("/dashboard/analytics?days=14");

  if (loading || !data)
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="text-ink-3" />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle={
          books
            ? "Call volume, outcomes, and peak hours over the last 14 days."
            : "Conversation volume and peak hours over the last 14 days."
        }
      />

      <div
        className={
          books
            ? "mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
            : "mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
        }
      >
        <StatCard
          label={books ? "Total calls" : "Conversations"}
          value={data.total_calls}
          icon={<IconPhone width={16} height={16} />}
        />
        {books ? (
          <>
            <StatCard
              label="Bookings"
              value={data.total_bookings}
              tone="good"
              icon={<IconCalendar width={16} height={16} />}
            />
            <StatCard
              label="Resolution rate"
              value={`${Math.round(data.resolution_rate * 100)}%`}
              tone="info"
            />
            <StatCard
              label="Booking rate"
              value={
                data.total_calls
                  ? `${Math.round((data.total_bookings / data.total_calls) * 100)}%`
                  : "–"
              }
              tone="signal"
              icon={<IconChart width={16} height={16} />}
            />
          </>
        ) : (
          <>
            <StatCard
              label="Busiest day"
              value={peakLabel(data.volume_by_day)}
              tone="info"
              icon={<IconChart width={16} height={16} />}
            />
            <StatCard
              label="Peak hour"
              value={peakLabel(data.calls_by_hour)}
              tone="signal"
              icon={<IconClock width={16} height={16} />}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section
          className={
            books
              ? "card min-w-0 p-5 lg:col-span-2"
              : "card min-w-0 p-5 lg:col-span-3"
          }
        >
          <h2 className="mb-4 font-display text-base font-semibold text-ink">
            {books ? "Call volume by day" : "Conversations by day"}
          </h2>
          <BarChart data={data.volume_by_day} />
        </section>

        {books && (
          <section className="card min-w-0 p-5">
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Outcomes</h2>
            <OutcomeDonut data={data.outcomes} />
          </section>
        )}

        <section className="card min-w-0 p-5 lg:col-span-3">
          <h2 className="mb-4 font-display text-base font-semibold text-ink">Busiest hours</h2>
          <PeakHours data={data.calls_by_hour} />
        </section>
      </div>
    </div>
  );
}
