import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { SimulateTurnResult } from "@/api/types";
import { Equalizer } from "@/components/LiveIndicator";
import { VoiceControls } from "@/components/VoiceControls";
import { IconMic, IconSend, IconUser } from "@/components/icons";
import { classNames } from "@/lib/format";
import { useMic } from "@/lib/useMic";
import { cancelSpeech, speak } from "@/lib/speech";

// The public, embeddable voice agent. A business shares /agent/:id (or drops it
// in an <iframe>) and anyone can talk to their assistant — no dashboard, no
// login. Voice-first: the big mic is the way in, typing is the fallback, and
// after the agent speaks it listens again so the exchange flows hands-free.

interface AgentConfig {
  id: string;
  name: string;
  industry: string | null;
  greeting: string;
  language: string;
  voice_id: string;
  agent_type: string;
}

interface Turn {
  role: "caller" | "agent";
  text: string;
}

export function PublicAgent() {
  const { businessId = "" } = useParams();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [live, setLive] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [callId, setCallId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [composer, setComposer] = useState<"voice" | "text">("voice");
  const scrollRef = useRef<HTMLDivElement>(null);

  const configRef = useRef<AgentConfig | null>(null);
  const liveRef = useRef(live);
  const composerRef = useRef(composer);
  configRef.current = config;
  liveRef.current = live;
  composerRef.current = composer;

  const mic = useMic({
    language: config?.language,
    onText: (text) => void send(text, true),
  });
  const micRef = useRef(mic);
  micRef.current = mic;

  useEffect(() => {
    let cancelled = false;
    api
      .get<AgentConfig>(`/businesses/${businessId}/agent`)
      .then((c) => !cancelled && (setConfig(c), setStatus("ready")))
      .catch(() => !cancelled && setStatus("notfound"));
    return () => {
      cancelled = true;
      cancelSpeech();
    };
  }, [businessId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const say = async (text: string) => {
    setSpeaking(true);
    try {
      const c = configRef.current;
      await speak(text, { voiceId: c?.voice_id, lang: c?.language });
    } finally {
      setSpeaking(false);
    }
  };

  const start = () => {
    if (!config) return;
    setLive(true);
    setTurns([{ role: "agent", text: config.greeting }]);
    void say(config.greeting);
  };

  const send = async (text: string, viaVoice = false) => {
    const clean = text.trim();
    const c = configRef.current;
    if (!clean || !c) return;
    setTurns((t) => [...t, { role: "caller", text: clean }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api.post<SimulateTurnResult>("/simulate/turn", {
        business_id: c.id,
        call_id: callId,
        text: clean,
      });
      setCallId(res.call_id);
      setTurns((t) => [...t, { role: "agent", text: res.reply }]);
      setBusy(false);
      await say(res.reply);
      // Hands-free loop: keep the conversation going by voice.
      const m = micRef.current;
      if (viaVoice && liveRef.current && composerRef.current === "voice" && !m.error) {
        m.start();
      }
    } catch {
      setBusy(false);
      setTurns((t) => [
        ...t,
        { role: "agent", text: "Sorry, I had trouble answering just now. Please try again." },
      ]);
    }
  };

  const pressMic = () => {
    if (mic.listening) return mic.stop();
    if (speaking) {
      cancelSpeech();
      setSpeaking(false);
    }
    mic.start();
  };

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <Equalizer size={22} className="text-brand" />
      </div>
    );
  }

  if (status === "notfound" || !config) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-6">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="font-display text-lg font-semibold text-ink">Assistant not found</h1>
          <p className="mt-2 text-sm text-ink-2">
            This voice agent link isn’t valid, or the assistant is no longer available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-bg px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-brand-ink">
          <Equalizer live={speaking} size={18} className="text-brand-ink" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-ink">{config.name}</p>
          <p className="text-xs text-ink-3">
            {config.industry ? `${config.industry} · ` : ""}Voice agent
          </p>
        </div>
      </div>

      {/* Conversation */}
      <div className="card mt-5 flex flex-1 flex-col overflow-hidden">
        {!live ? (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand/12 text-brand">
                <IconMic width={26} height={26} />
              </span>
              <p className="font-display text-lg font-semibold text-ink">
                Talk to {config.name}
              </p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ink-2">
                {config.agent_type === "receptionist"
                  ? "Ask a question, book an appointment, or leave a message — just talk."
                  : "Just talk — it listens, thinks, and answers out loud. Typing works too."}
              </p>
              <button className="btn-primary mt-5" onClick={start}>
                <IconMic width={16} height={16} /> Start talking
              </button>
              <p className="mt-3 text-[11px] text-ink-3">Turn your sound on to hear replies</p>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              {turns.map((t, i) => {
                const isAgent = t.role === "agent";
                return (
                  <div key={i} className={classNames("flex gap-2.5", isAgent ? "" : "flex-row-reverse")}>
                    <span
                      className={classNames(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                        isAgent ? "bg-brand/12 text-brand" : "bg-surface-2 text-ink-2",
                      )}
                    >
                      {isAgent ? (
                        <Equalizer size={13} className="text-brand" />
                      ) : (
                        <IconUser width={15} height={15} />
                      )}
                    </span>
                    <div
                      className={classNames(
                        "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        isAgent
                          ? "rounded-tl-sm bg-surface-2 text-ink"
                          : "rounded-tr-sm bg-brand text-brand-ink",
                      )}
                    >
                      {t.text}
                    </div>
                  </div>
                );
              })}
              {busy && (
                <div className="flex items-center gap-2 pl-11 text-ink-3">
                  <Equalizer size={16} className="text-brand" />
                  <span className="text-xs">thinking…</span>
                </div>
              )}
            </div>

            {/* Composer — voice-first, typing as the fallback */}
            {composer === "voice" ? (
              <VoiceControls
                mic={mic}
                busy={busy}
                speaking={speaking}
                onPress={pressMic}
                onTextMode={() => {
                  mic.cancel();
                  setComposer("text");
                }}
              />
            ) : (
              <div className="flex items-center gap-2 border-t border-line p-3 sm:p-4">
                <button
                  onClick={() => setComposer("voice")}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink-2 transition hover:bg-surface-2"
                  aria-label="Switch to voice"
                  title="Switch to voice"
                >
                  <IconMic width={18} height={18} />
                </button>
                <input
                  className="input"
                  placeholder="Type a message…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  disabled={busy}
                  autoFocus
                />
                <button
                  className="btn-primary !px-3"
                  onClick={() => send(input)}
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                >
                  <IconSend width={18} height={18} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] text-ink-3">
        Powered by <span className="font-semibold text-ink-2">Sonari</span>
      </p>
    </div>
  );
}
