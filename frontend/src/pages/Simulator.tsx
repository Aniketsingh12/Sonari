import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { Business, Faq, SimulateTurnResult } from "@/api/types";
import { Equalizer } from "@/components/LiveIndicator";
import { VoiceControls } from "@/components/VoiceControls";
import { PageHeader, Toggle } from "@/components/ui";
import { IconMic, IconPhone, IconSend, IconUser, IconX } from "@/components/icons";
import { classNames, outcomeMeta } from "@/lib/format";
import { languageBase } from "@/lib/languages";
import { useMic } from "@/lib/useMic";
import { cancelSpeech, speak } from "@/lib/speech";

interface Turn {
  role: "caller" | "agent";
  text: string;
  meta?: { intent: string; confidence: number; outcome: string | null };
}

// Example caller lines, in the business's own language (a Spanish agent should
// be tried in Spanish). Uses the business's real FAQs and first service, so the
// chips fit whatever the agent actually answers for.
const CHIP_STRINGS: Record<
  string,
  { book: (s: string) => string; bookGeneric: string; hours: string; person: string }
> = {
  en: {
    book: (s) => `I'd like to book a ${s} for Tuesday at 10am, my name is Sam.`,
    bookGeneric: "I'd like to book an appointment for Tuesday at 10am.",
    hours: "What are your hours?",
    person: "Can I speak to a person?",
  },
  es: {
    book: (s) => `Quiero reservar un ${s} para el martes a las 10, me llamo Sam.`,
    bookGeneric: "Quiero reservar una cita para el martes a las 10.",
    hours: "¿Cuál es su horario?",
    person: "¿Puedo hablar con una persona?",
  },
  fr: {
    book: (s) => `Je voudrais réserver un ${s} pour mardi à 10h, je m'appelle Sam.`,
    bookGeneric: "Je voudrais prendre rendez-vous pour mardi à 10h.",
    hours: "Quels sont vos horaires ?",
    person: "Puis-je parler à une personne ?",
  },
  de: {
    book: (s) => `Ich möchte einen ${s} für Dienstag um 10 Uhr buchen, mein Name ist Sam.`,
    bookGeneric: "Ich möchte einen Termin für Dienstag um 10 Uhr buchen.",
    hours: "Wie sind Ihre Öffnungszeiten?",
    person: "Kann ich mit einer Person sprechen?",
  },
  hi: {
    book: (s) => `मुझे मंगलवार सुबह 10 बजे के लिए ${s} बुक करना है, मेरा नाम सैम है।`,
    bookGeneric: "मुझे मंगलवार सुबह 10 बजे के लिए अपॉइंटमेंट बुक करनी है।",
    hours: "आपका समय क्या है?",
    person: "क्या मैं किसी व्यक्ति से बात कर सकता हूँ?",
  },
  pt: {
    book: (s) => `Quero agendar um ${s} para terça às 10h, meu nome é Sam.`,
    bookGeneric: "Quero agendar um horário para terça às 10h.",
    hours: "Qual é o horário de vocês?",
    person: "Posso falar com uma pessoa?",
  },
};

// Openers per agent type, so a tutor isn't prompted to "book an appointment".
// English-only: these are conversation starters, and a non-English agent still
// gets its own FAQ questions (which are in its language) plus free typing.
const TYPE_STARTERS: Record<string, string[]> = {
  tutor: ["Can you explain this topic simply?", "Quiz me on what we covered."],
  coding: ["Why am I getting this error?", "Explain how this function works."],
  support: ["I'm having trouble with my order.", "How do I change my plan?"],
  coach: ["I'm stuck on a goal.", "Help me plan my week."],
  interview: ["Let's practice for a product manager role.", "Ask me a hard question."],
  assistant: ["What can you help me with?", "Summarize this idea for me."],
};

function buildSuggestions(business: Business | null, faqs: Faq[]): string[] {
  const base = languageBase(business?.language);
  const s = CHIP_STRINGS[base] ?? CHIP_STRINGS.en;

  const out = faqs.slice(0, 2).map((f) => f.question);

  // Instruction-driven agents get starters that fit what they actually do; the
  // receptionist (no instructions) keeps the booking/hours/human chips.
  if (business?.system_prompt) {
    out.push(...(TYPE_STARTERS[business.agent_type] ?? TYPE_STARTERS.assistant));
  } else {
    const service = business?.services?.[0]?.name;
    out.push(service ? s.book(service.toLowerCase()) : s.bookGeneric);
    out.push(s.hours);
    out.push(s.person);
  }

  // A business's own FAQ may already be one of the above — dedupe so the chips
  // (keyed by text) stay unique.
  return [...new Set(out.map((x) => x.trim()))];
}

export function Simulator({ business }: { business: Business | null }) {
  // Phone framing ("caller", "hang up") only fits the receptionist; every other
  // agent is a conversation, not a call.
  const isReceptionist = !business?.system_prompt;
  const { data: faqs } = useQuery<Faq[]>("/faqs");
  const suggestions = useMemo(
    () => buildSuggestions(business, faqs ?? []),
    [business, faqs],
  );
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [callId, setCallId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [live, setLive] = useState(false);
  // Voice-first: the big mic is the default way in; typing is the fallback.
  const [composer, setComposer] = useState<"voice" | "text">("voice");
  const scrollRef = useRef<HTMLDivElement>(null);

  // The async turn (LLM + playback) outlives a render, so the hands-free loop
  // reads these refs instead of stale closure state.
  const liveRef = useRef(live);
  const composerRef = useRef(composer);
  liveRef.current = live;
  composerRef.current = composer;

  const mic = useMic({
    language: business?.language,
    onText: (text) => void send(text, true),
  });
  const micRef = useRef(mic);
  micRef.current = mic;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  useEffect(() => () => cancelSpeech(), []);

  const say = async (text: string) => {
    if (!autoplay) return;
    setSpeaking(true);
    try {
      await speak(text, { voiceId: business?.voice_id, lang: business?.language });
    } finally {
      setSpeaking(false);
    }
  };

  const startCall = () => {
    setLive(true);
    const greeting =
      business?.greeting ?? "Thanks for calling! How can I help you today?";
    setTurns([{ role: "agent", text: greeting }]);
    void say(greeting);
  };

  const endCall = async () => {
    mic.cancel();
    cancelSpeech();
    setSpeaking(false);
    if (callId) await api.post(`/simulate/${callId}/hangup`).catch(() => {});
    setLive(false);
    setCallId(null);
    setTurns([]);
    setInput("");
  };

  const send = async (text: string, viaVoice = false) => {
    const clean = text.trim();
    if (!clean || busy || !business) return;
    setTurns((t) => [...t, { role: "caller", text: clean }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api.post<SimulateTurnResult>("/simulate/turn", {
        business_id: business.id,
        call_id: callId,
        text: clean,
      });
      setCallId(res.call_id);
      setTurns((t) => [
        ...t,
        {
          role: "agent",
          text: res.reply,
          meta: { intent: res.intent, confidence: res.confidence, outcome: res.outcome },
        },
      ]);
      setBusy(false);
      await say(res.reply);
      // Hands-free: when the turn came in by voice, listen again as soon as the
      // agent finishes speaking — a conversation, not a chat thread.
      const m = micRef.current;
      if (viaVoice && liveRef.current && composerRef.current === "voice" && !m.error) {
        m.start();
      }
    } catch {
      setBusy(false);
      setTurns((t) => [
        ...t,
        { role: "agent", text: "Sorry, something went wrong reaching the agent." },
      ]);
    }
  };

  // Big-button behaviour: stop while listening, interrupt while speaking,
  // otherwise start listening.
  const pressMic = () => {
    if (mic.listening) return mic.stop();
    if (speaking) {
      cancelSpeech();
      setSpeaking(false);
    }
    mic.start();
  };

  return (
    <div>
      <PageHeader
        title={isReceptionist ? "Try a call" : "Talk to your agent"}
        subtitle={
          isReceptionist
            ? "Talk to your agent right in the browser — the same STT → reasoning → TTS pipeline a real caller hits."
            : "Talk to your agent right in the browser — the same speech → reasoning → speech pipeline your users get."
        }
        actions={
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <span className="hidden sm:inline">Autoplay voice</span>
            <Toggle checked={autoplay} onChange={setAutoplay} label="Autoplay voice" />
          </div>
        }
      />

      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-line bg-gradient-to-r from-brand/10 to-transparent px-5 py-4">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-brand-ink">
              {live ? (
                <Equalizer live={speaking} size={18} className="text-brand-ink" />
              ) : (
                <IconMic width={20} height={20} />
              )}
            </span>
            <div className="flex-1">
              <p className="font-display font-semibold text-ink">{business?.name ?? "Sonari"}</p>
              <p className="text-xs text-ink-3">
                {live
                  ? speaking
                    ? "Agent speaking…"
                    : mic.listening
                      ? "Listening…"
                      : "Connected"
                  : isReceptionist
                    ? "Ready to take your call"
                    : "Ready when you are"}
              </p>
            </div>
            {live && (
              <button className="btn-outline !py-2 text-danger" onClick={endCall}>
                <IconX width={16} height={16} /> {isReceptionist ? "Hang up" : "End"}
              </button>
            )}
          </div>

          {/* Conversation */}
          {!live ? (
            <div className="grid place-items-center px-6 py-16 text-center">
              <span className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand/12 text-brand">
                {isReceptionist ? (
                  <IconPhone width={28} height={28} />
                ) : (
                  <IconMic width={28} height={28} />
                )}
              </span>
              <p className="font-display text-lg font-semibold text-ink">
                {isReceptionist ? "Ring, ring" : `Talk to ${business?.name ?? "your agent"}`}
              </p>
              <p className="mt-1 max-w-sm text-sm text-ink-2">
                {isReceptionist
                  ? "Start a call to hear your agent greet the caller, answer questions, and book appointments — all live."
                  : "Start a conversation and just talk — the agent listens, thinks, and answers out loud."}
              </p>
              <button className="btn-primary mt-5" onClick={startCall}>
                {isReceptionist ? (
                  <IconPhone width={16} height={16} />
                ) : (
                  <IconMic width={16} height={16} />
                )}{" "}
                {isReceptionist ? "Start call" : "Start talking"}
              </button>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="max-h-[380px] space-y-3 overflow-y-auto p-4 sm:p-5">
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
                        {isAgent ? <Equalizer size={13} className="text-brand" /> : <IconUser width={15} height={15} />}
                      </span>
                      <div
                        className={classNames(
                          "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                          isAgent ? "rounded-tl-sm bg-surface-2 text-ink" : "rounded-tr-sm bg-brand text-brand-ink",
                        )}
                      >
                        <p className="leading-relaxed">{t.text}</p>
                        {t.meta && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                              {t.meta.intent} · {Math.round(t.meta.confidence * 100)}%
                            </span>
                            {t.meta.outcome && (
                              <span className="rounded bg-good/12 px-1.5 py-0.5 font-mono text-[10px] text-good">
                                {outcomeMeta(t.meta.outcome).label}
                              </span>
                            )}
                          </div>
                        )}
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

              {/* Suggestions */}
              <div className="flex flex-wrap gap-1.5 px-4 pb-2 sm:px-5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50"
                  >
                    {s.length > 34 ? s.slice(0, 32) + "…" : s}
                  </button>
                ))}
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
                    placeholder={isReceptionist ? "Type what the caller says…" : "Type a message…"}
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

        <p className="mt-3 text-center text-xs text-ink-3">
          {mic.mode === "server"
            ? "Your voice is transcribed by Whisper on the server."
            : "Voice input uses your browser's speech recognition."}{" "}
          Replies are spoken by the configured voice.
        </p>
      </div>
    </div>
  );
}
