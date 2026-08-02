import { useQuery } from "@/api/hooks";
import type { Booking, Business } from "@/api/types";
import { BookingCalendar } from "@/components/BookingCalendar";
import { StatCard } from "@/components/StatCard";
import { EmptyState, PageHeader, Spinner } from "@/components/ui";
import { IconCalendar } from "@/components/icons";

export function Bookings({ business }: { business: Business | null }) {
  const { data, loading } = useQuery<Booking[]>("/bookings");

  const now = new Date();
  const upcoming = (data ?? []).filter(
    (b) => new Date(b.start_at) >= now && b.status !== "cancelled",
  );
  const today = upcoming.filter(
    (b) => new Date(b.start_at).toDateString() === now.toDateString(),
  );

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Appointments your agent scheduled, straight into the calendar."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <StatCard label="Today" value={today.length} icon={<IconCalendar width={16} height={16} />} />
        <StatCard label="Upcoming" value={upcoming.length} tone="good" />
        <StatCard
          label="Daily capacity"
          value={business?.max_bookings_per_day ?? "–"}
          hint="per booking rules"
          tone="signal"
        />
      </div>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="text-ink-3" />
        </div>
      ) : upcoming.length ? (
        <BookingCalendar bookings={upcoming} />
      ) : (
        <EmptyState
          icon={<IconCalendar width={28} height={28} />}
          title="No upcoming bookings"
          hint="When the agent books an appointment during a call, it shows up here and syncs to your calendar."
        />
      )}
    </div>
  );
}
