import { useMemo, useState } from "react";
import { useQuery } from "@/api/hooks";
import type { Business, CallSummary } from "@/api/types";
import { CallCard } from "@/components/CallCard";
import { EmptyState, PageHeader, Spinner } from "@/components/ui";
import { IconPhone } from "@/components/icons";
import { classNames } from "@/lib/format";

// "booked"/"escalated" outcomes only ever come from the receptionist brain, so
// those filters are hidden for other agents rather than always returning empty.
const FILTERS = [
  { key: "all", label: "All" },
  { key: "booked", label: "Booked", books: true },
  { key: "answered", label: "Answered" },
  { key: "message", label: "Messages", books: true },
  { key: "escalated", label: "Escalated", books: true },
];

export function Calls({ business }: { business?: Business | null }) {
  const books = !business?.system_prompt;
  const { data, loading } = useQuery<CallSummary[]>("/dashboard/calls?limit=100");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data;
    return data.filter((c) => c.outcome === filter);
  }, [data, filter]);

  return (
    <div>
      <PageHeader
        title={books ? "Calls" : "Conversations"}
        subtitle={
          books
            ? "Every call your agent has handled."
            : "Every conversation your agent has handled."
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.filter((f) => books || !f.books).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={classNames(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f.key
                ? "bg-brand text-brand-ink"
                : "bg-surface border border-line text-ink-2 hover:bg-surface-2",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="text-ink-3" />
        </div>
      ) : filtered.length ? (
        <div className="space-y-2">
          {filtered.map((c) => (
            <CallCard key={c.id} call={c} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<IconPhone width={28} height={28} />}
          title={
            books
              ? "No calls match this filter"
              : "No conversations match this filter"
          }
          hint="Try a different filter, or talk to your agent to generate data."
        />
      )}
    </div>
  );
}
