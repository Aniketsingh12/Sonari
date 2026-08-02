import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, setBusinessId } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { Business, Health } from "@/api/types";
import { Equalizer } from "@/components/LiveIndicator";
import { ErrorNote } from "@/components/ui";
import {
  cancelSpeech,
  getSpeechMode,
  listVoices,
  speak,
  type SpeechMode,
  type VoiceOption,
} from "@/lib/speech";
import {
  IconArrowRight,
  IconBook,
  IconCalendar,
  IconCheck,
  IconMessage,
  IconPhone,
  IconPlay,
  IconServer,
  IconUser,
  IconWand,
  IconX,
} from "@/components/icons";
import { classNames } from "@/lib/format";

// The home page. Its job is to let someone hear the thing before they commit to
// setting anything up — so the hero is a call you actually answer, spoken by
// whichever TTS engine is configured. Deliberately industry-neutral.

interface Line {
  role: "agent" | "caller";
  text: string;
}

const SCRIPT: Line[] = [
  { role: "agent", text: "Thanks for calling! How can I help you today?" },
  { role: "caller", text: "Hi — do you have anything Tuesday morning?" },
  { role: "agent", text: "We do, ten o'clock is open. Can I take your name?" },
  { role: "caller", text: "It's Sam." },
  { role: "agent", text: "Perfect Sam, you're booked for Tuesday at ten." },
];

const FEATURES = [
  {
    icon: IconPhone,
    title: "Answers every call",
    body: "Picks up on the first ring, day or night. No hold music, no voicemail.",
  },
  {
    icon: IconCalendar,
    title: "Books appointments",
    body: "Checks what's free, takes the booking, and writes it to your calendar.",
  },
  {
    icon: IconBook,
    title: "Knows your business",
    body: "Answers questions about prices, hours, and policies from your own knowledge base.",
  },
  {
    icon: IconMessage,
    title: "Takes messages",
    body: "Catches the details you'd want, then sends you a summary after the call.",
  },
  {
    icon: IconUser,
    title: "Knows when to step aside",
    body: "Hands callers to a real person when they ask, or when it isn't confident.",
  },
  {
    icon: IconWand,
    title: "Shows its work",
    body: "Every call transcribed, with recordings, outcomes, and what it decided.",
  },
];

export function Landing({
  onDemoLoaded,
  configured = false,
}: {
  onDemoLoaded: () => void;
  configured?: boolean;
}) {
  const health = useQuery<Health>("/health");
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDemo = async () => {
    setLoadingDemo(true);
    setError(null);
    try {
      const biz = await api.post<Business>("/demo/seed");
      setBusinessId(biz.id);
      onDemoLoaded();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load the sample business.",
      );
      setLoadingDemo(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* ---------------- Nav ---------------- */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 py-3.5 sm:px-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-ink">
            <Equalizer size={16} className="text-brand-ink" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold text-ink">Sonari</p>
            <p className="text-[11px] text-ink-3">AI voice agent</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {configured ? (
              <Link to="/" className="btn-primary !py-2">
                Open my agents <IconArrowRight width={15} height={15} />
              </Link>
            ) : (
              <Link to="/new" className="btn-primary !py-2">
                Set up my agent
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="mx-auto max-w-5xl px-4 pb-4 pt-12 sm:px-6 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
          <div>
            <span className="chip border border-signal/30 bg-signal/10 text-signal">
              <Equalizer live size={13} className="text-signal" />
              Answers in under 1.5 seconds
            </span>

            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl">
              Every customer answered,
              <span className="text-brand"> day or night.</span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-2 sm:text-lg">
              Sonari is a voice AI agent that talks to your customers — on your
              website or your phone line — answering what they ask and booking them
              in, in a real conversation.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {configured ? (
                <Link to="/" className="btn-primary">
                  Open my agents <IconArrowRight width={16} height={16} />
                </Link>
              ) : (
                <>
                  <Link to="/new" className="btn-primary">
                    Set up my agent <IconArrowRight width={16} height={16} />
                  </Link>
                  <button
                    className="btn-outline"
                    onClick={loadDemo}
                    disabled={loadingDemo}
                  >
                    {loadingDemo ? "Loading…" : "Explore with sample data"}
                  </button>
                </>
              )}
            </div>

            <p className="mt-4 text-xs text-ink-3">
              Works for any business that books time — clinics, salons, trades, legal.
            </p>

            {error && (
              <div className="mt-4 max-w-md">
                <ErrorNote message={error} />
              </div>
            )}
          </div>

          {/* The hero is the product: a call you answer and actually hear. */}
          <DemoCall />
        </div>
      </section>

      {/* ---------------- Voices ---------------- */}
      <VoiceStrip />

      {/* ---------------- Features ---------------- */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          What it handles while you work
        </h2>
        <p className="mt-2 max-w-xl text-ink-2">
          Everything a good receptionist does on the phone — without the hold music.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/12 text-brand">
                <f.icon width={17} height={17} />
              </span>
              <h3 className="mt-3.5 font-display text-base font-semibold text-ink">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Pipeline ---------------- */}
      <section className="border-y border-line bg-surface/60">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Your models, your bill
          </h2>
          <p className="mt-2 max-w-xl text-ink-2">
            Every layer runs on a free local model or a paid API — your choice, per
            layer, in one config file. Swap any of them without touching the agent.
          </p>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left">
                  <th className="label pb-3 pr-4 font-semibold">Layer</th>
                  <th className="label pb-3 pr-4 font-semibold">Open-source</th>
                  <th className="label pb-3 pr-4 font-semibold">Paid API</th>
                  <th className="label pb-3 font-semibold">Running now</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Speech-to-text", "faster-whisper", "OpenAI Whisper", "stt"],
                  ["Reasoning", "Ollama", "Anthropic · OpenAI", "llm"],
                  ["Text-to-speech", "Piper", "ElevenLabs", "tts"],
                  ["Knowledge search", "sentence-transformers", "OpenAI", "embedding"],
                ].map(([layer, oss, paid, kind]) => {
                  const p = health.data?.providers.find((x) => x.kind === kind);
                  return (
                    <tr key={layer}>
                      <td className="border-t border-line py-3 pr-4 font-medium text-ink">
                        {layer}
                      </td>
                      <td className="border-t border-line py-3 pr-4 font-mono text-xs text-good">
                        {oss}
                      </td>
                      <td className="border-t border-line py-3 pr-4 font-mono text-xs text-brand">
                        {paid}
                      </td>
                      <td className="border-t border-line py-3">
                        {p && (
                          <span className="chip border border-line bg-surface-2 font-mono text-[11px] text-ink-2">
                            {p.provider}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-5 flex items-start gap-2 text-xs text-ink-3">
            <IconServer width={14} height={14} className="mt-0.5 shrink-0" />
            Out of the box it runs on built-in mock engines, so everything works with
            no API keys and no downloads. Point it at real models when you're ready.
          </p>
        </div>
      </section>

      {/* ---------------- Close ---------------- */}
      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Ready to stop missing calls?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-ink-2">
          Setup takes about two minutes. Tell it about your business, and it starts
          answering.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {configured ? (
            <Link to="/" className="btn-primary">
              Open my agents <IconArrowRight width={16} height={16} />
            </Link>
          ) : (
            <>
              <Link to="/new" className="btn-primary">
                Set up my agent <IconArrowRight width={16} height={16} />
              </Link>
              <button className="btn-outline" onClick={loadDemo} disabled={loadingDemo}>
                {loadingDemo ? "Loading…" : "Explore with sample data"}
              </button>
            </>
          )}
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-ink-3">
        Sonari — real-time speech → reasoning → speech, on models you pick.
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The hero call. Text is a scripted example; the voice is really synth-  */
/* esized by the configured TTS provider, so you hear the actual agent.   */
/* ------------------------------------------------------------------ */
function DemoCall() {
  const [phase, setPhase] = useState<"idle" | "live" | "done">("idle");
  const [shown, setShown] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [mode, setMode] = useState<SpeechMode>("browser");
  const cancelled = useRef(false);

  useEffect(() => {
    getSpeechMode().then(setMode);
    return () => {
      cancelled.current = true;
      cancelSpeech();
    };
  }, []);

  const say = async (text: string) => {
    setSpeaking(true);
    await speak(text);
    setSpeaking(false);
  };

  const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

  const answer = async () => {
    cancelled.current = false;
    setPhase("live");
    setShown(0);
    for (let i = 0; i < SCRIPT.length; i++) {
      if (cancelled.current) return;
      setShown(i + 1);
      const line = SCRIPT[i];
      if (line.role === "agent") await say(line.text);
      else await wait(1200);
    }
    if (!cancelled.current) setPhase("done");
  };

  const hangUp = () => {
    cancelled.current = true;
    cancelSpeech();
    setSpeaking(false);
    setPhase("idle");
    setShown(0);
  };

  return (
    <div className="card overflow-hidden shadow-pop">
      {/* Call header */}
      <div className="flex items-center gap-3 border-b border-line bg-gradient-to-r from-brand/10 to-transparent px-5 py-4">
        <span className="relative grid h-11 w-11 place-items-center rounded-full bg-brand text-brand-ink">
          {phase === "idle" && (
            <span className="absolute inset-0 rounded-full bg-brand/40 animate-pulse-ring" />
          )}
          {phase === "idle" ? (
            <IconPhone width={20} height={20} />
          ) : (
            <Equalizer live={speaking} size={18} className="text-brand-ink" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-medium text-ink">+1 (555) 0134</p>
          <p className="text-xs text-ink-3">
            {phase === "idle"
              ? "Incoming call"
              : phase === "live"
                ? speaking
                  ? "Agent speaking…"
                  : "Listening…"
                : "Call ended · 24s"}
          </p>
        </div>
        {phase !== "idle" && (
          <button
            onClick={hangUp}
            className="grid h-9 w-9 place-items-center rounded-full bg-danger/10 text-danger hover:bg-danger/20"
            aria-label="Hang up"
          >
            <IconX width={16} height={16} />
          </button>
        )}
      </div>

      {/* Body */}
      {phase === "idle" ? (
        <div className="grid place-items-center px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            Your phone is ringing.
          </p>
          <p className="mt-1 max-w-xs text-sm text-ink-2">
            Answer it and hear exactly what your caller would hear.
          </p>
          <button className="btn-primary mt-5" onClick={answer}>
            <IconPlay width={15} height={15} /> Answer the call
          </button>
          <p className="mt-3 text-[11px] text-ink-3">Turn your sound on</p>
        </div>
      ) : (
        <div className="min-h-[248px] space-y-3 p-4 sm:p-5">
          {SCRIPT.slice(0, shown).map((l, i) => {
            const isAgent = l.role === "agent";
            const isLast = i === shown - 1;
            return (
              <div
                key={i}
                className={classNames(
                  "flex animate-fade-up gap-2.5",
                  isAgent ? "" : "flex-row-reverse",
                )}
              >
                <span
                  className={classNames(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                    isAgent ? "bg-brand/12 text-brand" : "bg-surface-2 text-ink-2",
                  )}
                >
                  {isAgent ? (
                    <Equalizer live={isLast && speaking} size={12} className="text-brand" />
                  ) : (
                    <IconUser width={13} height={13} />
                  )}
                </span>
                <p
                  className={classNames(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    isAgent
                      ? "rounded-tl-sm bg-surface-2 text-ink"
                      : "rounded-tr-sm bg-brand text-brand-ink",
                  )}
                >
                  {l.text}
                </p>
              </div>
            );
          })}

          {phase === "done" && (
            <div className="animate-fade-up space-y-3 pt-1">
              <div className="flex items-center gap-2 rounded-xl border border-good/25 bg-good/10 px-3 py-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-good text-white">
                  <IconCheck width={13} height={13} />
                </span>
                <p className="text-sm font-medium text-good">
                  Booking created · Tuesday, 10:00 AM
                </p>
              </div>
              <button className="btn-ghost w-full justify-center" onClick={answer}>
                Play again
              </button>
            </div>
          )}
        </div>
      )}

      <p className="border-t border-line px-4 py-2.5 text-center text-[11px] text-ink-3">
        Example conversation · spoken live by{" "}
        {mode === "server" ? "your TTS engine" : "your device's voice"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function VoiceStrip() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [mode, setMode] = useState<SpeechMode>("browser");
  const SAMPLE = "Thanks for calling! I can book you in or answer any questions.";

  useEffect(() => {
    listVoices().then(setVoices);
    getSpeechMode().then(setMode);
    return () => cancelSpeech();
  }, []);

  const play = async (id: string) => {
    setPlaying(id);
    await speak(SAMPLE, { voiceId: id });
    setPlaying(null);
  };

  if (!voices.length) return null;

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              Pick how it sounds
            </h2>
            <p className="mt-0.5 text-sm text-ink-2">
              {mode === "server"
                ? "Tap a voice to hear it. This is your configured TTS engine."
                : "Tap a voice to hear it — these are your device's own voices."}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {voices.map((v) => (
            <button
              key={v.id}
              onClick={() => play(v.id)}
              className={classNames(
                "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                playing === v.id
                  ? "border-brand bg-brand/5 ring-1 ring-brand/30"
                  : "border-line bg-surface hover:bg-surface-2",
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/12 text-brand">
                {playing === v.id ? (
                  <Equalizer live size={15} className="text-brand" />
                ) : (
                  <IconPlay width={14} height={14} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{v.name}</span>
                <span className="block truncate text-xs text-ink-3">
                  {v.descriptor}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
