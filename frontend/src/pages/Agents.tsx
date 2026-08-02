import { useState } from "react";
import { api, setBusinessId } from "@/api/client";
import type { AgentSummary } from "@/api/types";
import { Equalizer } from "@/components/LiveIndicator";
import { IconMoon, IconPlus, IconSun, IconTrash } from "@/components/icons";
import { classNames } from "@/lib/format";
import { LANGUAGES } from "@/lib/languages";
import { useTheme } from "@/lib/useTheme";

// The multi-agent home. Every voice agent the owner has built lives here — open
// one to work on it, share its public link, spin up another, or remove it. The
// active agent (the one the dashboard is scoped to) is carried in the
// X-Business-Id header; opening an agent just points that header at it.

function flagFor(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.flag ?? "🌐";
}

export function Agents({
  agents,
  activeId,
  onChange,
}: {
  agents: AgentSummary[];
  activeId?: string;
  onChange: () => void;
}) {
  const { theme, toggle } = useTheme();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const open = (id: string) => {
    setBusinessId(id);
    window.location.assign("/dashboard"); // reload into that agent's workspace
  };

  const create = () => window.location.assign("/new");

  const share = async (id: string) => {
    const link = `${window.location.origin}/agent/${id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      window.open(link, "_blank");
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await api.del(`/businesses/${id}`);
      if (id === activeId) setBusinessId(null); // active one is gone
      setConfirmId(null);
      onChange();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 py-3.5 sm:px-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-ink">
            <Equalizer size={16} className="text-brand-ink" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold text-ink">Sonari</p>
            <p className="text-[11px] text-ink-3">AI voice agents</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn-ghost !px-2" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
            <button className="btn-primary !py-2" onClick={create}>
              <IconPlus width={16} height={16} /> New agent
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          Your agents
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          {agents.length} {agents.length === 1 ? "agent" : "agents"} · open one to
          manage it, or create another for a different business or use case.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => {
            const isActive = a.id === activeId;
            const confirming = confirmId === a.id;
            return (
              <div
                key={a.id}
                className={classNames(
                  "card group flex flex-col p-5 transition",
                  isActive ? "border-brand/40 ring-1 ring-brand/25" : "hover:border-line/80",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={classNames(
                      "grid h-10 w-10 place-items-center rounded-xl",
                      a.agent_live ? "bg-brand/12 text-brand" : "bg-surface-2 text-ink-3",
                    )}
                  >
                    <Equalizer size={16} className={a.agent_live ? "text-brand" : "text-ink-3"} />
                  </span>
                  <div className="flex items-center gap-1.5">
                    {a.is_demo && (
                      <span className="chip border border-signal/30 bg-signal/10 text-[10px] text-signal">
                        sample
                      </span>
                    )}
                    {isActive && (
                      <span className="chip border border-brand/30 bg-brand/10 text-[10px] text-brand">
                        active
                      </span>
                    )}
                  </div>
                </div>

                <button onClick={() => open(a.id)} className="mt-3 text-left">
                  <p className="font-display text-base font-semibold text-ink group-hover:text-brand">
                    {a.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-3">
                    {flagFor(a.language)} {a.industry || "Voice agent"}
                    {a.phone_number ? ` · ${a.phone_number}` : ""}
                  </p>
                </button>

                <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                  <button className="btn-primary !py-1.5 !px-3 text-xs" onClick={() => open(a.id)}>
                    Open
                  </button>
                  <button
                    className="btn-outline !py-1.5 !px-3 text-xs"
                    onClick={() => share(a.id)}
                  >
                    {copiedId === a.id ? "Copied ✓" : "Share"}
                  </button>
                  <div className="ml-auto">
                    {confirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          className="rounded-lg bg-danger px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          onClick={() => remove(a.id)}
                          disabled={busyId === a.id}
                        >
                          {busyId === a.id ? "…" : "Delete"}
                        </button>
                        <button
                          className="rounded-lg px-2 py-1 text-xs text-ink-3 hover:bg-surface-2"
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="grid h-7 w-7 place-items-center rounded-lg text-ink-3 hover:bg-danger/10 hover:text-danger"
                        onClick={() => setConfirmId(a.id)}
                        aria-label="Delete agent"
                      >
                        <IconTrash width={15} height={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* New-agent tile */}
          <button
            onClick={create}
            className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-ink-3 transition hover:border-brand/40 hover:text-brand"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2">
              <IconPlus width={18} height={18} />
            </span>
            <span className="text-sm font-medium">New agent</span>
          </button>
        </div>
      </main>
    </div>
  );
}
