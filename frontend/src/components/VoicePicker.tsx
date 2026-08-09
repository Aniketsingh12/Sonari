import { useEffect, useState } from "react";
import { classNames } from "@/lib/format";
import { languageBase } from "@/lib/languages";
import {
  cancelSpeech,
  getSpeechMode,
  getTtsProvider,
  listVoices,
  speak,
  type SpeechMode,
  type VoiceOption,
} from "@/lib/speech";
import { Equalizer } from "./LiveIndicator";
import { IconPlay } from "./icons";

// Voice preview. Previews use whatever can actually speak: the configured TTS
// engine if there is one, otherwise the browser's own voices — filtered to the
// business language, so a Spanish business only picks Spanish voices.

export type { VoiceOption };

// A short sample per language so the preview is spoken in that language.
const SAMPLES: Record<string, string> = {
  en: "Thanks for calling! I can book you an appointment or answer any questions.",
  es: "¡Gracias por llamar! Puedo agendarle una cita o responder sus preguntas.",
  fr: "Merci d'appeler ! Je peux vous réserver un rendez-vous ou répondre à vos questions.",
  de: "Danke für Ihren Anruf! Ich kann einen Termin buchen oder Ihre Fragen beantworten.",
  hi: "कॉल करने के लिए धन्यवाद! मैं आपकी अपॉइंटमेंट बुक कर सकता हूँ या सवालों के जवाब दे सकता हूँ।",
  pt: "Obrigado por ligar! Posso agendar um horário ou responder suas perguntas.",
};

export function VoicePicker({
  value,
  onChange,
  language = "en-US",
}: {
  value: string;
  onChange: (id: string) => void;
  language?: string;
}) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [mode, setMode] = useState<SpeechMode>("browser");
  const [provider, setProvider] = useState("mock");
  const [previewing, setPreviewing] = useState<string | null>(null);

  const base = languageBase(language);

  useEffect(() => {
    listVoices(base).then(setVoices);
    getSpeechMode().then(setMode);
    getTtsProvider().then(setProvider);
    return () => cancelSpeech();
  }, [base]);

  const preview = async (id: string) => {
    setPreviewing(id);
    await speak(SAMPLES[base] ?? SAMPLES.en, { voiceId: id, lang: language });
    setPreviewing(null);
  };

  // Fish Audio picks a voice by opaque "reference id", not by name — so a list
  // of names would be fiction (every entry would play the same voice). Take the
  // id directly instead.
  if (provider === "fish") {
    return <VoiceIdPicker value={value} onChange={onChange} onPreview={preview} previewing={previewing !== null} />;
  }

  if (!voices.length) {
    return <p className="text-sm text-ink-3">No voices available on this device.</p>;
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {voices.map((v) => {
          const selected = value === v.id;
          return (
            <div
              key={v.id}
              className={classNames(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                selected
                  ? "border-brand bg-brand/5 ring-1 ring-brand/30"
                  : "border-line bg-surface hover:bg-surface-2",
              )}
              onClick={() => onChange(v.id)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  preview(v.id);
                }}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/12 text-brand hover:bg-brand/20"
                aria-label={`Preview ${v.name}`}
              >
                {previewing === v.id ? (
                  <Equalizer live size={16} className="text-brand" />
                ) : (
                  <IconPlay width={15} height={15} />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{v.name}</p>
                <p className="truncate text-xs text-ink-3">{v.descriptor}</p>
              </div>
              <span
                className={classNames(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                  selected ? "border-brand bg-brand text-brand-ink" : "border-line",
                )}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-current" />}
              </span>
            </div>
          );
        })}
      </div>
      {mode === "browser" && (
        <p className="mt-3 text-xs text-ink-3">
          These are your device's built-in voices, used because no TTS engine is
          configured — so everyone who opens your agent hears whatever voice
          <em> their </em> device has. Set{" "}
          <code className="font-mono">TTS_PROVIDER</code> to{" "}
          <code className="font-mono">fish</code> or{" "}
          <code className="font-mono">piper</code> to give every listener the
          same voice.
        </p>
      )}
    </div>
  );
}

/** Fish Audio: the agent's voice is a reference id copied from fish.audio. */
function VoiceIdPicker({
  value,
  onChange,
  onPreview,
  previewing,
}: {
  value: string;
  onChange: (id: string) => void;
  onPreview: (id: string) => void;
  previewing: boolean;
}) {
  // Anything that isn't a Fish reference id (a leftover browser voice, say) is
  // ignored by the backend, so show the field empty rather than implying it's in use.
  const isFishId = /^[0-9a-f]{16,}$/i.test(value.trim());
  const shown = isFishId ? value : "";

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          className="input font-mono"
          placeholder="Voice ID from fish.audio (blank = default voice)"
          value={shown}
          onChange={(e) => onChange(e.target.value.trim())}
        />
        <button
          type="button"
          className="btn-outline !py-2 shrink-0"
          onClick={() => onPreview(shown)}
          aria-label="Preview voice"
        >
          {previewing ? (
            <Equalizer live size={15} className="text-brand" />
          ) : (
            <IconPlay width={14} height={14} />
          )}
          Preview
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Browse voices at{" "}
        <a
          href="https://fish.audio/discovery"
          target="_blank"
          rel="noreferrer"
          className="text-brand hover:underline"
        >
          fish.audio
        </a>
        , open one, and paste its model ID here — that's the voice this agent
        speaks with. Leave it blank to use the{" "}
        <code className="font-mono">FISH_VOICE_ID</code> default from your
        backend config.
      </p>
    </div>
  );
}
