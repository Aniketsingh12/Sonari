import { Link } from "react-router-dom";
import type { CallSummary } from "@/api/types";
import { formatDuration, outcomeMeta, relativeTime } from "@/lib/format";
import { Chip } from "./ui";
import { IconChevronRight, IconClock, IconPhone } from "./icons";

/** Who the agent was talking to. Phone conversations have a number; ones started
 *  in the browser (shared link or the playground) have no caller at all — so
 *  "Unknown caller" would be wrong rather than merely vague. */
export function participantLabel(call: {
  caller_number: string | null;
  source: string;
}): string {
  if (call.caller_number) return call.caller_number;
  return call.source === "simulator" ? "Web conversation" : "Unknown caller";
}

export function CallCard({ call }: { call: CallSummary }) {
  const meta = outcomeMeta(call.outcome);
  const sentimentTone =
    call.sentiment === "positive"
      ? "good"
      : call.sentiment === "negative"
        ? "danger"
        : "ink-3";

  return (
    <Link
      to={`/calls/${call.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-3 group-hover:bg-brand/10 group-hover:text-brand">
        <IconPhone width={18} height={18} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-sm font-medium text-ink">
            {participantLabel(call)}
          </p>
          <Chip tone={meta.tone}>{meta.label}</Chip>
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-2">
          {call.summary ?? "No summary available"}
        </p>
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-1 text-xs text-ink-3 sm:flex">
        <span className="flex items-center gap-1">
          <IconClock width={13} height={13} />
          {formatDuration(call.duration_sec)}
        </span>
        <span className="capitalize" data-tone={sentimentTone}>
          {relativeTime(call.created_at)}
        </span>
      </div>

      <IconChevronRight className="shrink-0 text-ink-3 group-hover:text-ink-2" />
    </Link>
  );
}
