import { useEffect, useState } from "react";
import { classNames } from "@/lib/format";
import { languageBase } from "@/lib/languages";
import {
  cancelSpeech,
  getSpeechMode,
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
  const [previewing, setPreviewing] = useState<string | null>(null);

  const base = languageBase(language);

  useEffect(() => {
    listVoices(base).then(setVoices);
    getSpeechMode().then(setMode);
    return () => cancelSpeech();
  }, [base]);

  const preview = async (id: string) => {
    setPreviewing(id);
    await speak(SAMPLES[base] ?? SAMPLES.en, { voiceId: id, lang: language });
    setPreviewing(null);
  };

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
          configured. Set <code className="font-mono">TTS_PROVIDER</code> to
          piper or elevenlabs for voices your phone callers will hear.
        </p>
      )}
    </div>
  );
}
