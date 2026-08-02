import { Link, useParams } from "react-router-dom";
import { useQuery } from "@/api/hooks";
import type { CallDetail as CallDetailT } from "@/api/types";
import { participantLabel } from "@/components/CallCard";
import { TranscriptViewer } from "@/components/TranscriptViewer";
import { Chip, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { IconArrowRight, IconMessage, IconUser } from "@/components/icons";
import {
  formatDateTime,
  formatDuration,
  outcomeMeta,
} from "@/lib/format";

export function CallDetail() {
  const { id } = useParams();
  const { data, loading, error } = useQuery<CallDetailT>(`/dashboard/calls/${id}`);

  if (loading)
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="text-ink-3" />
      </div>
    );
  if (error || !data) return <ErrorNote message={error ?? "Call not found"} />;

  const meta = outcomeMeta(data.outcome);
  const sentiment = data.sentiment ?? "neutral";
  const sentimentTone =
    sentiment === "positive" ? "good" : sentiment === "negative" ? "danger" : "ink-3";

  return (
    <div>
      <Link
        to="/calls"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"
      >
        <IconArrowRight width={14} height={14} className="rotate-180" /> Back to
        conversations
      </Link>

      <PageHeader
        title={participantLabel(data)}
        subtitle={formatDateTime(data.started_at ?? data.created_at)}
        actions={<Chip tone={meta.tone}>{meta.label}</Chip>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {data.turns.length ? (
            <TranscriptViewer
              turns={data.turns}
              participant={data.source === "simulator" ? "User" : "Caller"}
            />
          ) : (
            <div className="card grid place-items-center py-16 text-sm text-ink-3">
              No transcript recorded.
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 font-display text-base font-semibold text-ink">Summary</h3>
            <p className="text-sm text-ink-2">{data.summary ?? "No summary available."}</p>
            <dl className="mt-4 space-y-2.5 text-sm">
              <Row label="Duration" value={formatDuration(data.duration_sec)} />
              <Row label="Source" value={<span className="capitalize">{data.source}</span>} />
              <Row
                label="Status"
                // Stored as a snake_case enum ("in_progress"); `capitalize`
                // alone would render it as "In_progress".
                value={
                  <span className="capitalize">{data.status.replace(/_/g, " ")}</span>
                }
              />
              <Row
                label="Sentiment"
                value={<Chip tone={sentimentTone}>{sentiment}</Chip>}
              />
            </dl>
          </div>

          {data.messages.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-ink">
                <IconMessage width={16} height={16} className="text-brand" /> Message taken
              </h3>
              {data.messages.map((m) => (
                <div key={m.id} className="rounded-xl bg-surface-2 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs text-ink-3">
                    <IconUser width={13} height={13} />
                    {m.caller_name ?? "Caller"}
                    {m.caller_number && ` · ${m.caller_number}`}
                  </div>
                  <p className="text-sm text-ink">{m.body}</p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
