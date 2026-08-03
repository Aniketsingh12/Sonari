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

// A scripted example, but the voice is really synthesized by the configured TTS
// engine — deliberately generic so it reads as "any agent", not a receptionist.
const SCRIPT: Line[] = [
  { role: "agent", text: "Hi! I'm your agent. What would you like to go over?" },
  { role: "caller", text: "Can you explain what an API is?" },
  {
    role: "agent",
    text: "Sure — think of it as a waiter between two programs. One asks for something, the API carries the request and brings the answer back.",
  },
  { role: "caller", text: "That actually makes sense." },
  { role: "agent", text: "Great. Want me to walk through a real example next?" },
];

const FEATURES = [
  {
    icon: IconWand,
    title: "Instructions are the agent",
    body: "Describe how it should behave and it does — a tutor teaches, a support agent supports. No flowcharts.",
  },
  {
    icon: IconBook,
    title: "Give it your knowledge",
    body: "Drop in the questions people actually ask; the agent answers from them, in its own words.",
  },
  {
    icon: IconUser,
    title: "Share it anywhere",
    body: "Every agent gets a public page and an embed snippet. No phone number, no login for visitors.",
  },
  {
    icon: IconMessage,
    title: "Speaks and listens",
    body: "Real voice both ways in the browser, in six languages, with the voice you pick.",
  },
  {
    icon: IconPhone,
    title: "Phone calls when you need them",
    body: "Optional add-on: connect a Twilio or Exotel number and the same agent answers your line.",
  },
  {
    icon: IconCalendar,
    title: "Or run a receptionist",
    body: "Pick the receptionist template and it books appointments, takes messages, and escalates to you.",
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
              Build a voice agent
              <span className="text-brand"> people can talk to.</span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-2 sm:text-lg">
              Describe what it should do — tutor, coding helper, support agent,
              receptionist — and Sonari turns it into an agent that speaks and
              listens. Share it as a link, embed it, or put it on a phone line.
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
              Start from a template — assistant, tutor, coding helper, support,
              coach, interviewer, or receptionist.
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
          One engine, any kind of agent
        </h2>
        <p className="mt-2 max-w-xl text-ink-2">
          The same speech → reasoning → speech pipeline, pointed wherever you need it.
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
          Ready to build your first agent?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-ink-2">
          Takes about two minutes. Pick a template, tell it how to behave, and start
          talking to it.
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
          <p className="text-sm font-medium text-ink">Sample agent</p>
          <p className="text-xs text-ink-3">
            {phase === "idle"
              ? "Ready to talk"
              : phase === "live"
                ? speaking
                  ? "Agent speaking…"
                  : "Listening…"
                : "Conversation ended"}
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
            Hear one talk.
          </p>
          <p className="mt-1 max-w-xs text-sm text-ink-2">
            Play a sample conversation — spoken out loud by the voice engine
            you've configured.
          </p>
          <button className="btn-primary mt-5" onClick={answer}>
            <IconPlay width={15} height={15} /> Play conversation
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
                  Answered from the agent's own knowledge
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
