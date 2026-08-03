import type { Mic } from "@/lib/useMic";
import { classNames } from "@/lib/format";
import { IconMic, IconPause } from "./icons";
import { Equalizer } from "./LiveIndicator";

// The voice-first composer: one big mic button and a live status line, so
// testing an agent feels like talking to it, not texting it. The pages own the
// conversation state; this renders the control surface and reports intent.

export function VoiceControls({
  mic,
  busy,
  speaking,
  onPress,
  onTextMode,
}: {
  mic: Mic;
  busy: boolean;
  speaking: boolean;
  /** Tap on the big button — page decides (start / stop / interrupt). */
  onPress: () => void;
  onTextMode: () => void;
}) {
  const status = mic.listening
    ? mic.mode === "server"
      ? "Listening — tap when you're done"
      : "Listening…"
    : mic.transcribing
      ? "Transcribing…"
      : busy
        ? "Thinking…"
        : speaking
          ? "Speaking — tap to interrupt"
          : "Tap the mic and talk";

  return (
    <div className="border-t border-line p-4 sm:p-5">
      {mic.error && (
        <div className="mx-auto mb-3 max-w-md rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-center text-xs leading-relaxed text-ink-2">
          {mic.error}
        </div>
      )}
      <div className="flex flex-col items-center gap-2.5">
        <button
          onClick={onPress}
          disabled={mic.transcribing}
          className={classNames(
            "relative grid h-16 w-16 place-items-center rounded-full transition disabled:opacity-60",
            mic.listening
              ? "bg-danger text-white shadow-pop"
              : "bg-brand text-brand-ink shadow-pop hover:opacity-90",
          )}
          aria-label={mic.listening ? "Stop listening" : "Talk"}
        >
          {mic.listening && (
            <span className="absolute inset-0 rounded-full bg-danger/40 animate-pulse-ring" />
          )}
          {mic.listening ? (
            <IconPause width={24} height={24} />
          ) : speaking ? (
            <Equalizer live size={22} className="text-brand-ink" />
          ) : (
            <IconMic width={24} height={24} />
          )}
        </button>
        <p className="text-xs font-medium text-ink-2" aria-live="polite">
          {status}
        </p>
        <button
          className="text-[11px] text-ink-3 underline-offset-2 hover:underline"
          onClick={onTextMode}
        >
          Type instead
        </button>
      </div>
    </div>
  );
}
