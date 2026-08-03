import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSttMode,
  isRecordingSupported,
  startRecording,
  stopRecording,
  transcribeBlob,
  type SpeechMode,
} from "@/lib/speech";

// One mic for the whole app. Wraps both capture paths — the browser's own
// speech recognition (default) and record-then-server-Whisper (when a real
// STT provider is configured) — and, crucially, REPORTS failures. The old
// inline implementations ignored recognition's `onerror`, so a blocked mic or
// an unreachable speech service looked like "the mic does nothing".

type SpeechRec = {
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

function getRecognition(): SpeechRec | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

// Human explanations for the Web Speech API's error codes.
const REC_ERRORS: Record<string, string> = {
  "not-allowed":
    "Microphone access is blocked. Click the mic/camera icon in the address bar, allow the microphone, and try again.",
  "service-not-allowed":
    "Microphone access is blocked for this site. Allow it in your browser settings and try again.",
  "audio-capture":
    "No microphone found. Plug one in or check your input device, then try again.",
  network:
    "Your browser's speech service isn't reachable (this happens in Brave and some Chromium builds). Type instead — or configure a server transcriber (STT_PROVIDER=groq) so voice input doesn't depend on the browser.",
  "no-speech": "Didn't catch anything — tap the mic and speak.",
};

export interface Mic {
  listening: boolean;
  transcribing: boolean;
  /** Why the last attempt failed, in words the user can act on. */
  error: string | null;
  /** "server" = record + Whisper endpoint; "browser" = Web Speech API. */
  mode: SpeechMode;
  /** Start listening (no-op if already listening). */
  start: () => void;
  /** Stop listening; emits the captured text via onText. */
  stop: () => void;
  toggle: () => void;
  /** Stop listening and discard whatever was captured. */
  cancel: () => void;
  clearError: () => void;
}

export function useMic({
  language,
  onText,
}: {
  language?: string;
  onText: (text: string) => void;
}): Mic {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SpeechMode>("browser");

  const recRef = useRef<SpeechRec | null>(null);
  const cancelledRef = useRef(false);
  const onTextRef = useRef(onText);
  const langRef = useRef(language);
  onTextRef.current = onText;
  langRef.current = language;

  useEffect(() => {
    let alive = true;
    getSttMode().then((m) => alive && setMode(m));
    return () => {
      alive = false;
      recRef.current?.abort?.();
    };
  }, []);

  const startBrowser = useCallback(() => {
    const rec = getRecognition();
    if (!rec) {
      setError(
        "This browser has no built-in speech recognition (Chrome and Edge do). Type instead — or configure a server transcriber (STT_PROVIDER=groq).",
      );
      return;
    }
    cancelledRef.current = false;
    rec.lang = langRef.current || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text && !cancelledRef.current) onTextRef.current(text);
    };
    rec.onerror = (e: any) => {
      if (cancelledRef.current) return;
      const code = e?.error ?? "unknown";
      if (code === "aborted") return; // we stopped it ourselves
      setError(REC_ERRORS[code] ?? `Voice input failed (${code}). You can type instead.`);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      setError("Couldn't start the microphone — try again.");
    }
  }, []);

  const startServer = useCallback(async () => {
    if (!isRecordingSupported()) {
      setError("Recording isn't available in this browser — you can type instead.");
      return;
    }
    try {
      cancelledRef.current = false;
      await startRecording();
      setError(null);
      setListening(true);
    } catch {
      setError(
        "Microphone access is blocked. Allow the mic in your browser's address bar and try again.",
      );
    }
  }, []);

  const stopServer = useCallback(async () => {
    setListening(false);
    setTranscribing(true);
    try {
      const blob = await stopRecording();
      if (cancelledRef.current) return;
      const text = await transcribeBlob(blob);
      if (text) onTextRef.current(text);
      else setError("Couldn't transcribe that — try again, or type instead.");
    } finally {
      setTranscribing(false);
    }
  }, []);

  const start = useCallback(() => {
    if (listening || transcribing) return;
    if (mode === "server") void startServer();
    else startBrowser();
  }, [listening, transcribing, mode, startServer, startBrowser]);

  const stop = useCallback(() => {
    if (!listening) return;
    if (mode === "server") void stopServer();
    else recRef.current?.stop(); // emits via onresult, then onend clears state
  }, [listening, mode, stopServer]);

  const toggle = useCallback(() => {
    listening ? stop() : start();
  }, [listening, start, stop]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (mode === "server") {
      if (listening) void stopRecording(); // release the mic, discard audio
    } else {
      recRef.current?.abort?.() ?? recRef.current?.stop();
    }
    setListening(false);
  }, [listening, mode]);

  const clearError = useCallback(() => setError(null), []);

  return { listening, transcribing, error, mode, start, stop, toggle, cancel, clearError };
}
