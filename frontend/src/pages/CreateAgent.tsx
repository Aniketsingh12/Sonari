import { useState } from "react";
import { api, setBusinessId } from "@/api/client";
import type { Business } from "@/api/types";
import { Equalizer } from "@/components/LiveIndicator";
import { VoicePicker } from "@/components/VoicePicker";
import { IconArrowRight, IconMoon, IconSun } from "@/components/icons";
import { LANGUAGES } from "@/lib/languages";
import { TEMPLATES, type AgentTemplate } from "@/lib/templates";
import { useTheme } from "@/lib/useTheme";

// The builder's front door: pick a starter agent, tune its name / instructions /
// voice, and create it. Instructions ARE the behaviour — the agent runs the
// general instruction-driven brain (the Receptionist template leaves them empty
// to use the structured booking brain instead).

export function CreateAgent() {
  const { theme, toggle } = useTheme();
  const [tpl, setTpl] = useState<AgentTemplate | null>(null);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [greeting, setGreeting] = useState("");
  const [lang, setLang] = useState("en-US");
  const [voiceId, setVoiceId] = useState("default");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (t: AgentTemplate) => {
    // The receptionist isn't instruction-driven — it runs the structured booking
    // brain, which needs services, hours and FAQs. Hand it to the full setup
    // wizard rather than duplicating all that here.
    if (t.id === "receptionist") {
      window.location.assign("/setup");
      return;
    }
    setTpl(t);
    setName(t.id === "custom" ? "" : t.name);
    setInstructions(t.system_prompt);
    setGreeting(t.greeting);
  };

  const create = async () => {
    if (!tpl || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const biz = await api.post<Business>("/businesses", {
        name: name.trim(),
        agent_type: tpl.id,
        language: lang,
        greeting: greeting.trim() || tpl.greeting,
        system_prompt: instructions.trim() || null,
        voice_id: voiceId,
      });
      setBusinessId(biz.id);
      window.location.assign("/dashboard"); // into the new agent's workspace
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the agent.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5 px-4 py-3.5 sm:px-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-ink">
            <Equalizer size={16} className="text-brand-ink" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold text-ink">New agent</p>
            <p className="text-[11px] text-ink-3">
              {tpl ? "Tune it, then create" : "Pick a starting point"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn-ghost !px-2" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
            <a href="/agents" className="btn-ghost text-sm">
              Cancel
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {!tpl ? (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
              What kind of agent?
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              Start from a template — you can rewrite its instructions in the next step.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => choose(t)}
                  className="card group flex flex-col p-5 text-left transition hover:border-brand/40 hover:shadow-pop"
                >
                  <span className="text-2xl">{t.emoji}</span>
                  <p className="mt-3 font-display text-base font-semibold text-ink group-hover:text-brand">
                    {t.name}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{t.tagline}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-2xl">
            <button
              onClick={() => setTpl(null)}
              className="text-sm text-ink-3 hover:text-ink"
            >
              ← Choose a different template
            </button>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-3xl">{tpl.emoji}</span>
              <div>
                <h1 className="font-display text-xl font-bold text-ink">{tpl.name}</h1>
                <p className="text-sm text-ink-2">{tpl.tagline}</p>
              </div>
            </div>

            <div className="card mt-6 space-y-4 p-5 sm:p-6">
              <label className="block">
                <span className="label mb-1.5 block">Agent name</span>
                <input
                  className="input"
                  placeholder="e.g. Professor Ada"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </label>

              <label className="block">
                <span className="label mb-1.5 block">
                  Instructions — how it should behave
                </span>
                <textarea
                  className="input min-h-[130px] resize-y leading-relaxed"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Describe the agent's role, tone, and what it should (and shouldn't) do…"
                />
                <span className="mt-1 block text-xs text-ink-3">
                  This is the agent's brain — edit it freely. It's spoken aloud, so
                  it will keep replies short and conversational.
                </span>
              </label>

              <label className="block">
                <span className="label mb-1.5 block">Opening line</span>
                <input
                  className="input"
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label mb-1.5 block">Language</span>
                  <select
                    className="input"
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag} {l.native} ({l.name})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <span className="label mb-2 block">Voice</span>
                <VoicePicker value={voiceId} onChange={setVoiceId} language={lang} />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="flex justify-end border-t border-line pt-4">
                <button
                  className="btn-primary"
                  onClick={create}
                  disabled={saving || !name.trim()}
                >
                  {saving ? "Creating…" : "Create agent"}
                  {!saving && <IconArrowRight width={16} height={16} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
