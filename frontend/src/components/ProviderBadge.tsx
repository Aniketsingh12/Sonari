import type { ProviderStatus } from "@/api/types";
import { classNames } from "@/lib/format";

// Shows which engine backs each capability, colour-coded by "mode" so it's
// obvious at a glance whether a layer is open-source, a paid API, or the mock.

const MODE_STYLE: Record<ProviderStatus["mode"], string> = {
  "open-source": "bg-good/12 text-good border-good/25",
  "free-api": "bg-info/12 text-info border-info/25",
  paid: "bg-brand/12 text-brand border-brand/25",
  mock: "bg-surface-2 text-ink-3 border-line",
};

const MODE_LABEL: Record<ProviderStatus["mode"], string> = {
  "open-source": "open-source",
  "free-api": "free API",
  paid: "paid API",
  mock: "mock",
};

const KIND_LABEL: Record<ProviderStatus["kind"], string> = {
  stt: "Speech-to-text",
  tts: "Text-to-speech",
  llm: "Language model",
  embedding: "Embeddings",
};

export function ProviderPill({ p }: { p: ProviderStatus }) {
  return (
    <span
      className={classNames(
        "chip border font-mono text-[11px]",
        MODE_STYLE[p.mode],
      )}
      title={`${KIND_LABEL[p.kind]}: ${p.provider} (${MODE_LABEL[p.mode]})${
        p.detail ? " — " + p.detail : ""
      }`}
    >
      <span className="uppercase tracking-wide opacity-70">{p.kind}</span>
      <span className="font-semibold">{p.provider}</span>
    </span>
  );
}

export function ProviderCard({ p }: { p: ProviderStatus }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{KIND_LABEL[p.kind]}</p>
        <p className="truncate font-mono text-xs text-ink-3">
          {p.provider}
          {p.detail ? ` · ${p.detail}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={classNames(
            "chip border font-medium",
            MODE_STYLE[p.mode],
          )}
        >
          {MODE_LABEL[p.mode]}
        </span>
        <span
          className={classNames(
            "inline-block h-2 w-2 rounded-full",
            p.available ? "bg-good" : "bg-warn",
          )}
          title={p.available ? "Available" : "Not configured"}
        />
      </div>
    </div>
  );
}
