// The languages the agent can speak, mirroring backend app/agent/i18n.LANGUAGES.
// `code` is the BCP-47 tag stored on the business and used for STT (speech
// recognition), TTS (voice selection), and Twilio.

export interface Language {
  code: string; // e.g. "es-ES"
  base: string; // e.g. "es" — used to match browser voices
  name: string; // English name
  native: string; // endonym, shown in the picker
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: "en-US", base: "en", name: "English", native: "English", flag: "🇺🇸" },
  { code: "es-ES", base: "es", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "fr-FR", base: "fr", name: "French", native: "Français", flag: "🇫🇷" },
  { code: "de-DE", base: "de", name: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "hi-IN", base: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "pt-BR", base: "pt", name: "Portuguese", native: "Português", flag: "🇧🇷" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function language(code: string | undefined | null): Language {
  return (code && BY_CODE.get(code)) || LANGUAGES[0];
}

export function languageBase(code: string | undefined | null): string {
  return language(code).base;
}

// Default greeting per language (mirrors backend i18n default_greeting).
const GREETINGS: Record<string, (name: string) => string> = {
  en: (n) => `Thanks for calling${n ? " " + n : ""}! How can I help you today?`,
  es: (n) => `¡Gracias por llamar${n ? " a " + n : ""}! ¿En qué puedo ayudarle hoy?`,
  fr: (n) => `Merci d'appeler${n ? " " + n : ""} ! Comment puis-je vous aider aujourd'hui ?`,
  de: (n) => `Danke für Ihren Anruf${n ? " bei " + n : ""}! Wie kann ich Ihnen heute helfen?`,
  hi: (n) => `${n ? n + " पर " : ""}कॉल करने के लिए धन्यवाद! मैं आपकी क्या मदद कर सकता हूँ?`,
  pt: (n) => `Obrigado por ligar${n ? " para " + n : ""}! Como posso ajudar hoje?`,
};

export function defaultGreeting(code: string | undefined | null, businessName = ""): string {
  const base = languageBase(code);
  return (GREETINGS[base] ?? GREETINGS.en)(businessName.trim());
}

/** Best-guess the closest supported language from the browser locale. */
export function detectLanguage(): string {
  const nav = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const base = nav.slice(0, 2).toLowerCase();
  return LANGUAGES.find((l) => l.base === base)?.code ?? "en-US";
}
