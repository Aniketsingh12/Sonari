import { useQuery } from "@/api/hooks";
import type { Analytics as AnalyticsT } from "@/api/types";
import { BarChart, OutcomeDonut, PeakHours } from "@/components/charts";
import { StatCard } from "@/components/StatCard";
import { PageHeader, Spinner } from "@/components/ui";
import { IconCalendar, IconChart, IconPhone } from "@/components/icons";

export function Analytics() {
  const { data, loading } = useQuery<AnalyticsT>("/dashboard/analytics?days=14");

  if (loading || !data)
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="text-ink-3" />
      </div>
    );

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Call volume, outcomes, and peak hours over the last 14 days." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total calls" value={data.total_calls} icon={<IconPhone width={16} height={16} />} />
        <StatCard label="Bookings" value={data.total_bookings} tone="good" icon={<IconCalendar width={16} height={16} />} />
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
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0 p-5 lg:col-span-2">
          <h2 className="mb-4 font-display text-base font-semibold text-ink">Call volume by day</h2>
          <BarChart data={data.volume_by_day} />
        </section>

        <section className="card min-w-0 p-5">
          <h2 className="mb-4 font-display text-base font-semibold text-ink">Outcomes</h2>
          <OutcomeDonut data={data.outcomes} />
        </section>

        <section className="card min-w-0 p-5 lg:col-span-3">
          <h2 className="mb-4 font-display text-base font-semibold text-ink">Busiest hours</h2>
          <PeakHours data={data.calls_by_hour} />
        </section>
      </div>
    </div>
  );
}
