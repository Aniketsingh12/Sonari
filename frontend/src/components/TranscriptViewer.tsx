import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptTurn } from "@/api/types";
import { classNames } from "@/lib/format";
import { speak } from "@/lib/speech";
import { Equalizer } from "./LiveIndicator";
import { IconPause, IconPlay, IconUser } from "./icons";

// Synced transcript + audio playback. There's no real recording in the demo,
// so we drive a *virtual* playhead across the call timeline (from each turn's
// start_ms), highlighting and auto-scrolling the active line — the same UX a
// real recording would give. Each agent line can also be spoken via the
// configured TTS provider (/api/tts).

const TAIL_MS = 2600;

export function TranscriptViewer({
  turns,
  // What to call the human side. A browser conversation has no "caller", so
  // CallDetail passes "User" for those.
  participant = "Caller",
}: {
  turns: TranscriptTurn[];
  participant?: string;
}) {
  const total = useMemo(
    () => (turns.length ? turns[turns.length - 1].start_ms + TAIL_MS : 0),
    [turns],
  );
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTick = useRef<number>(0);
  const listRef = useRef<HTMLDivElement>(null);

  const activeIdx = useMemo(() => {
    let idx = -1;
    turns.forEach((t, i) => {
      if (t.start_ms <= cursor) idx = i;
    });
    return idx;
  }, [cursor, turns]);

  // Advance the virtual playhead while playing.
  useEffect(() => {
    if (!playing) return;
    lastTick.current = performance.now();
    const step = (now: number) => {
      const dt = now - lastTick.current;
      lastTick.current = now;
      setCursor((c) => {
        const next = c + dt;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, total]);

  // Auto-scroll the active line into view.
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-turn="${activeIdx}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIdx]);

  const toggle = () => {
    if (cursor >= total) setCursor(0);
    setPlaying((p) => !p);
  };

  const say = (text: string) => {
    speak(text);
  };

  const pct = total ? (cursor / total) * 100 : 0;
  const fmt = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="card overflow-hidden">
      {/* Transport bar */}
      <div className="flex items-center gap-3 border-b border-line bg-surface-2/50 px-4 py-3">
        <button
          onClick={toggle}
          className="grid h-9 w-9 place-items-center rounded-full bg-brand text-brand-ink transition hover:bg-brand/90"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}
        </button>
        <span className="font-mono text-xs text-ink-3 tabular-nums">{fmt(cursor)}</span>
        <div
          className="group relative h-1.5 flex-1 cursor-pointer rounded-full bg-line"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setCursor(((e.clientX - rect.left) / rect.width) * total);
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand"
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-brand shadow"
            style={{ left: `calc(${pct}% - 6px)` }}
          />
        </div>
        <span className="font-mono text-xs text-ink-3 tabular-nums">{fmt(total)}</span>
        <span className="ml-1 hidden sm:block">
          <Equalizer live={playing} size={16} className="text-brand" />
        </span>
      </div>

      {/* Turns */}
      <div ref={listRef} className="max-h-[460px] space-y-3 overflow-y-auto p-4">
        {turns.map((t, i) => {
          const isAgent = t.role === "agent";
          const active = i === activeIdx;
          return (
            <div
              key={t.id}
              data-turn={i}
              className={classNames(
                "flex gap-3",
                isAgent ? "flex-row" : "flex-row-reverse",
              )}
            >
              <span
                className={classNames(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  isAgent ? "bg-brand/12 text-brand" : "bg-surface-2 text-ink-2",
                )}
              >
                {isAgent ? <Equalizer size={13} className="text-brand" live={active && playing} /> : <IconUser width={15} height={15} />}
              </span>
              <div
                className={classNames(
                  "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm transition",
                  isAgent
                    ? "rounded-tl-sm bg-surface-2 text-ink"
                    : "rounded-tr-sm bg-brand text-brand-ink",
                  active && "ring-2 ring-brand/40",
                )}
              >
                <div className="mb-0.5 flex items-center gap-2">
                  <span
                    className={classNames(
                      "text-[10px] font-semibold uppercase tracking-wide",
                      isAgent ? "text-ink-3" : "text-brand-ink/70",
                    )}
                  >
                    {isAgent ? "Agent" : participant}
                  </span>
                  {isAgent && t.intent && (
                    <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                      {t.intent}
                      {t.confidence != null && ` · ${Math.round(t.confidence * 100)}%`}
                    </span>
                  )}
                </div>
                <p className="leading-relaxed">{t.text}</p>
                {isAgent && (
                  <button
                    onClick={() => say(t.text)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-ink-3 hover:text-brand"
                  >
                    <IconPlay width={11} height={11} /> Hear it
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
