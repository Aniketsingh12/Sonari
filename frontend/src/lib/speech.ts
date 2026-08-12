// Speaking, with a real voice.
//
// If a TTS engine is configured (Piper, ElevenLabs), audio comes from the
// backend so you hear exactly what a phone caller hears. If it isn't, we fall
// back to the browser's own speech synthesis — real system voices, no download,
// no API key — rather than the backend's placeholder tone. That keeps "hear the
// agent" honest out of the box.

import type { Health } from "@/api/types";

export type SpeechMode = "browser" | "server";

export interface VoiceOption {
  id: string;
  name: string;
  descriptor: string;
}

let modePromise: Promise<SpeechMode> | null = null;

/** Ask the backend once whether it can really synthesize speech. */
export function getSpeechMode(): Promise<SpeechMode> {
  if (!modePromise) {
    modePromise = fetch("/api/health")
      .then((r) => (r.ok ? (r.json() as Promise<Health>) : null))
      .then((h) => {
        const tts = h?.providers.find((p) => p.kind === "tts");
        // A mock/unavailable engine can't speak — use the browser instead.
        const serverCanSpeak = !!tts && tts.mode !== "mock" && tts.available;
        return serverCanSpeak ? "server" : "browser";
      })
      .catch(() => "browser" as SpeechMode);
  }
  return modePromise;
}

/** Reset the cached probe (after changing providers). */
export function resetSpeechMode() {
  modePromise = null;
  sttModePromise = null;
  ttsProviderPromise = null;
}

// Which engine is actually speaking. The voice *picker* needs this: engines
// differ in how a voice is chosen — the browser has named system voices, while
// Fish Audio takes an opaque voice ("reference") id you copy from their site.
let ttsProviderPromise: Promise<string> | null = null;

export function getTtsProvider(): Promise<string> {
  if (!ttsProviderPromise) {
    ttsProviderPromise = fetch("/api/health")
      .then((r) => (r.ok ? (r.json() as Promise<Health>) : null))
      .then((h) => h?.providers.find((p) => p.kind === "tts")?.provider ?? "mock")
      .catch(() => "mock");
  }
  return ttsProviderPromise;
}

// ---------------------------------------------------------------- listening
let sttModePromise: Promise<SpeechMode> | null = null;

/**
 * Whether the *server* can transcribe (Groq/OpenAI/faster-whisper configured),
 * in which case the mic records audio and sends it to `/api/transcribe`.
 * Otherwise we use the browser's own speech recognition.
 */
export function getSttMode(): Promise<SpeechMode> {
  if (!sttModePromise) {
    sttModePromise = fetch("/api/health")
      .then((r) => (r.ok ? (r.json() as Promise<Health>) : null))
      .then((h) => {
        const stt = h?.providers.find((p) => p.kind === "stt");
        return stt && stt.mode !== "mock" && stt.available ? "server" : "browser";
      })
      .catch(() => "browser" as SpeechMode);
  }
  return sttModePromise;
}

/** Send a recorded clip to the server STT provider. Returns "" on failure. */
export async function transcribeBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  const ext = blob.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", blob, `clip.${ext}`);
  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    if (!res.ok) return "";
    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  } catch {
    return "";
  }
}

// Browser mic recorder for the server-STT path. Resolves to the audio blob.
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export async function startRecording(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start();
}

/** Stop recording and resolve with the captured audio. */
export function stopRecording(): Promise<Blob> {
  return new Promise((resolve) => {
    const rec = mediaRecorder;
    if (!rec || rec.state === "inactive") {
      resolve(new Blob(recordedChunks, { type: "audio/webm" }));
      return;
    }
    rec.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop()); // release the mic
      resolve(new Blob(recordedChunks, { type: rec.mimeType || "audio/webm" }));
    };
    rec.stop();
  });
}

// ---------------------------------------------------------------- voices
function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;
}

/** getVoices() is populated asynchronously in most browsers. */
function browserVoices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const ready = s.getVoices();
  if (ready.length) return Promise.resolve(ready);
  return new Promise((resolve) => {
    const done = () => resolve(s.getVoices());
    s.addEventListener("voiceschanged", done, { once: true });
    // Safety net: some browsers never fire the event.
    setTimeout(() => resolve(s.getVoices()), 1000);
  });
}

/** Kokoro voices on Together AI (the default TTS model there). Prefix decodes
 *  as: a=American, b=British; f=female, m=male. Not exhaustive — the field also
 *  accepts any other voice name the configured model supports. */
export const TOGETHER_VOICES: VoiceOption[] = [
  { id: "af_heart", name: "Heart", descriptor: "American · female · warm" },
  { id: "af_bella", name: "Bella", descriptor: "American · female · bright" },
  { id: "af_alloy", name: "Alloy", descriptor: "American · female · neutral" },
  { id: "am_adam", name: "Adam", descriptor: "American · male · steady" },
  { id: "am_michael", name: "Michael", descriptor: "American · male · warm" },
  { id: "bf_alice", name: "Alice", descriptor: "British · female" },
  { id: "bm_daniel", name: "Daniel", descriptor: "British · male" },
];

const SERVER_VOICES: VoiceOption[] = [
  { id: "default", name: "Ava", descriptor: "Warm · neutral American" },
  { id: "rachel", name: "Rachel", descriptor: "Calm · professional" },
  { id: "amy", name: "Amy", descriptor: "Bright · friendly" },
  { id: "marcus", name: "Marcus", descriptor: "Deep · reassuring" },
];

/**
 * The voices actually available to speak with, named honestly.
 * When `langBase` is given (e.g. "es"), browser voices are filtered to it so a
 * Spanish business only picks Spanish voices.
 */
export async function listVoices(langBase = "en"): Promise<VoiceOption[]> {
  const mode = await getSpeechMode();
  if (mode === "server") {
    // Together exposes real, named voices — show those rather than a generic
    // list, so picking one actually changes what you hear.
    const provider = await getTtsProvider();
    if (provider === "together") return TOGETHER_VOICES;
    return SERVER_VOICES;
  }

  const all = await browserVoices();
  const matching = all.filter((v) => v.lang.toLowerCase().startsWith(langBase));
  const voices = matching.length ? matching : all;
  if (!voices.length) return SERVER_VOICES;

  return voices.slice(0, 6).map((v) => ({
    id: v.voiceURI,
    name: v.name
      .replace(/^Microsoft\s+/, "")
      .replace(/\s+-\s+[A-Za-z].*$/, ""),
    descriptor: `${v.lang}${v.localService ? " · on your device" : " · online"}`,
  }));
}

// ---------------------------------------------------------------- speaking
let audioEl: HTMLAudioElement | null = null;

export interface SpeakOptions {
  voiceId?: string;
  lang?: string; // BCP-47, e.g. "es-ES"
}

export function cancelSpeech() {
  synth()?.cancel();
  audioEl?.pause();
}

/**
 * Speak `text`, resolving when playback finishes.
 * Never rejects and never hangs — callers sequence on it.
 */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  const mode = await getSpeechMode();
  return mode === "server"
    ? speakServer(text, opts.voiceId)
    : speakBrowser(text, opts);
}

function speakServer(text: string, voiceId?: string): Promise<void> {
  return new Promise((resolve) => {
    if (!audioEl) audioEl = new Audio();
    const el = audioEl;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = window.setTimeout(done, 15000);
    el.onended = () => {
      window.clearTimeout(timer);
      done();
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      done();
    };
    const q = new URLSearchParams({ text: text.slice(0, 600) });
    if (voiceId) q.set("voice", voiceId);
    el.src = `/api/tts?${q.toString()}`;
    el.play().catch(() => {
      window.clearTimeout(timer);
      done();
    });
  });
}

async function speakBrowser(text: string, opts: SpeakOptions): Promise<void> {
  const s = synth();
  if (!s) return;
  s.cancel(); // never queue on top of a previous line

  const base = (opts.lang ?? "en").slice(0, 2).toLowerCase();
  const voices = await browserVoices();
  const chosen =
    voices.find((v) => v.voiceURI === opts.voiceId) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices[0];

  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    if (chosen) u.voice = chosen;
    // Prefer the requested language so the engine applies the right
    // pronunciation rules even when only an off-language voice is installed.
    u.lang = opts.lang ?? chosen?.lang ?? "en-US";
    u.rate = 1.02; // a receptionist's pace, not a robot's
    u.pitch = 1;

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    // Chrome drops long utterances silently; bound the wait on word count.
    const guard = window.setTimeout(done, 2000 + text.split(/\s+/).length * 700);
    u.onend = () => {
      window.clearTimeout(guard);
      done();
    };
    s.speak(u);
  });
}
