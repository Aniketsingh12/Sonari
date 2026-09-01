import { useState } from "react";
import { api } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { Business, Health, Service } from "@/api/types";
import { ProviderCard } from "@/components/ProviderBadge";
import { VoicePicker } from "@/components/VoicePicker";
import { PageHeader, Toggle } from "@/components/ui";
import { IconPlus, IconServer, IconTrash } from "@/components/icons";
import { classNames, formatMoney } from "@/lib/format";
import { LANGUAGES } from "@/lib/languages";

type Draft = Pick<
  Business,
  | "name"
  | "industry"
  | "greeting"
  | "owner_phone"
  | "owner_email"
  | "timezone"
  | "language"
  | "max_bookings_per_day"
  | "booking_buffer_min"
  | "escalation_threshold"
  | "voice_id"
  | "agent_live"
  | "phone_number"
  | "system_prompt"
>;

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    // min-w-0: grid items default to min-width:auto, so a `truncate` child
    // (white-space:nowrap) would otherwise force the whole column wider than
    // the viewport on mobile instead of ellipsising.
    <section className="card min-w-0 p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
      {desc && <p className="mt-0.5 text-sm text-ink-2">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Settings({
  business,
  onSaved,
}: {
  business: Business | null;
  onSaved: () => void;
}) {
  const health = useQuery<Health>("/health");
  const [draft, setDraft] = useState<Draft | null>(() =>
    business ? pick(business) : null,
  );
  const [services, setServices] = useState<Service[]>(business?.services ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!business || !draft)
    return <PageHeader title="Settings" subtitle="Loading…" />;

  // Receptionist-only surface (phone line, escalation, services, bookings) is
  // keyed off the SAVED agent, not the draft, so sections don't pop in and out
  // while someone is mid-edit in the instructions box.
  const books = !business.system_prompt;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch("/businesses/me", draft);
      if (books) {
        await api.put(
          "/businesses/me/services",
          services.map((s) => ({
            name: s.name,
            duration_min: s.duration_min,
            price: s.price,
            description: s.description,
          })),
        );
      }
      onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const addService = () =>
    setServices((s) => [
      ...s,
      { id: `new-${Date.now()}`, name: "New service", duration_min: 30, price: null, description: null },
    ]);

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={
          books
            ? "Tune how your agent answers, books, and escalates."
            : "Tune how your agent behaves, sounds, and is shared."
        }
        actions={
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
          </button>
        }
      />

      <ShareAgent businessId={business.id} />

      <div className="mb-6">
        <Section
          title="Instructions"
          desc="The agent's brain — how it behaves, its tone, what it should and shouldn't do."
        >
          <textarea
            className="input min-h-[140px] resize-y leading-relaxed"
            placeholder="Describe the agent's role and behaviour…"
            value={draft.system_prompt ?? ""}
            onChange={(e) => set("system_prompt", e.target.value || null)}
          />
          <p className="mt-1.5 text-xs text-ink-3">
            Spoken aloud, so replies stay short and conversational. Leave empty to use
            the structured receptionist brain (calls &amp; bookings).
          </p>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Agent status" desc="Turn the agent on or off.">
          <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">
                {draft.agent_live ? "Live" : "Paused"}
              </p>
              <p className="text-xs text-ink-3">
                {draft.agent_live
                  ? books
                    ? "Answering on the web agent and any connected phone line"
                    : "Answering on your shared agent page"
                  : "Not answering"}
              </p>
            </div>
            <Toggle
              checked={draft.agent_live}
              onChange={(v) => set("agent_live", v)}
              label="Agent live"
            />
          </div>
        </Section>

        {books && (
        <Section
          title="Phone calls (optional add-on)"
          desc="Connect a real phone number so the agent also answers calls. Not required — the shareable web agent above works on its own."
        >
          <div className="space-y-3">
            <Field label="Connected phone number">
              <input
                className="input font-mono"
                placeholder="+911140000000"
                value={draft.phone_number ?? ""}
                onChange={(e) => set("phone_number", e.target.value || null)}
              />
            </Field>
            <div className="rounded-xl border border-line bg-surface-2/60 p-4 text-sm text-ink-2">
              <p>
                The virtual number (Twilio, Exotel, …) callers dial — or that you
                forward your existing line to. It's how Sonari knows which
                business an incoming call belongs to. Enter it exactly as your
                provider formats it.
              </p>
              <p className="mt-2">
                In your provider, point the inbound-call webhook at{" "}
                <code className="rounded bg-surface px-1 font-mono text-xs">
                  /call/incoming
                </code>{" "}
                (Twilio) or the Voicebot applet at{" "}
                <code className="rounded bg-surface px-1 font-mono text-xs">
                  /exotel/media
                </code>
                , then turn <span className="font-medium text-ink">Agent status</span>{" "}
                on above.
              </p>
            </div>
          </div>
        </Section>
        )}

        <Section
          title={books ? "Business info" : "Agent info"}
          desc={books ? "How the agent introduces you." : "How your agent introduces itself."}
        >
          <div className="space-y-3">
            <Field label={books ? "Business name" : "Agent name"}>
              <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label={books ? "Industry" : "Category (shown on the public page)"}>
              <input
                className="input"
                value={draft.industry ?? ""}
                onChange={(e) => set("industry", e.target.value)}
              />
            </Field>
            <Field label="Language the agent speaks">
              <select
                className="input"
                value={draft.language}
                onChange={(e) => set("language", e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.native} ({l.name})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Greeting">
              <textarea
                className="input min-h-[70px] resize-y"
                value={draft.greeting}
                onChange={(e) => set("greeting", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        {books && (
        <Section title="Escalation" desc="Where callers go when they need a human.">
          <div className="space-y-3">
            <Field label="Owner phone (read out on escalation)">
              <input
                className="input"
                value={draft.owner_phone ?? ""}
                onChange={(e) => set("owner_phone", e.target.value)}
              />
            </Field>
            <Field label="Owner email (call summaries)">
              <input
                className="input"
                value={draft.owner_email ?? ""}
                onChange={(e) => set("owner_email", e.target.value)}
              />
            </Field>
            <Field label={`Escalate below ${Math.round(draft.escalation_threshold * 100)}% confidence`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={draft.escalation_threshold}
                onChange={(e) => set("escalation_threshold", Number(e.target.value))}
                className="w-full accent-brand"
              />
            </Field>
          </div>
        </Section>
        )}

        {books && (
        <Section title="Booking rules" desc="Guardrails for the calendar.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max per day">
              <input
                type="number"
                className="input"
                value={draft.max_bookings_per_day}
                onChange={(e) => set("max_bookings_per_day", Number(e.target.value))}
              />
            </Field>
            <Field label="Buffer (min)">
              <input
                type="number"
                className="input"
                value={draft.booking_buffer_min}
                onChange={(e) => set("booking_buffer_min", Number(e.target.value))}
              />
            </Field>
          </div>
        </Section>
        )}

        {books && (
        <Section title="Services" desc="What can be booked, and for how long.">
          <div className="space-y-2">
            {services.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 rounded-xl border border-line p-2.5">
                <input
                  className="input !py-1.5 flex-1"
                  value={s.name}
                  onChange={(e) =>
                    setServices((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                />
                <input
                  className="input !py-1.5 w-20"
                  type="number"
                  value={s.duration_min}
                  onChange={(e) =>
                    setServices((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, duration_min: Number(e.target.value) } : x)),
                    )
                  }
                />
                <input
                  className="input !py-1.5 w-24"
                  type="number"
                  placeholder="Price"
                  value={s.price ?? ""}
                  onChange={(e) =>
                    setServices((arr) =>
                      arr.map((x, j) =>
                        j === i ? { ...x, price: e.target.value ? Number(e.target.value) : null } : x,
                      ),
                    )
                  }
                />
                <button
                  className="rounded-lg p-2 text-ink-3 hover:bg-danger/10 hover:text-danger"
                  onClick={() => setServices((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remove service"
                >
                  <IconTrash width={16} height={16} />
                </button>
              </div>
            ))}
            <button className="btn-ghost w-full justify-center" onClick={addService}>
              <IconPlus width={16} height={16} /> Add service
            </button>
          </div>
        </Section>
        )}

        <Section title="Voice" desc="Pick how your agent sounds. Preview plays the live TTS.">
          <VoicePicker
            value={draft.voice_id}
            onChange={(id) => set("voice_id", id)}
            language={draft.language}
          />
        </Section>

        <Section title="AI pipeline" desc="The engines behind speech, reasoning, and retrieval.">
          {health.data ? (
            <div className="space-y-2">
              {health.data.providers.map((p) => (
                <ProviderCard key={p.kind} p={p} />
              ))}
              <p className="flex items-start gap-2 pt-1 text-xs text-ink-3">
                <IconServer width={14} height={14} className="mt-0.5 shrink-0" />
                Set each layer independently in the backend{" "}
                <code className="rounded bg-surface-2 px-1 font-mono">.env</code>:
                self-hosted (faster-whisper, Piper, Ollama), hosted open models
                (Together, Groq, Gemini), or paid (OpenAI, ElevenLabs, Anthropic).
                The cards above are live — they show what is running right now.
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-3">Loading pipeline status…</p>
          )}
        </Section>

        {books && (
        <Section title="Menu preview" desc="A quick look at bookable services.">
          <ul className="divide-y divide-line text-sm">
            {services.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="text-ink">{s.name}</span>
                <span className="font-mono text-ink-3">
                  {s.duration_min}m · {formatMoney(s.price)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        )}

        <Section
          title="Start over"
          desc={
            books
              ? "Erase this business and run setup again from scratch."
              : "Erase this agent and start again from scratch."
          }
        >
          <StartOver onReset={onSaved} />
        </Section>
      </div>
    </div>
  );
}

function StartOver({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  const reset = async () => {
    setWorking(true);
    try {
      await api.post("/demo/reset");
      onReset(); // refetch -> no business -> the setup wizard
    } finally {
      setWorking(false);
    }
  };

  if (!confirming) {
    return (
      <button className="btn-outline text-danger" onClick={() => setConfirming(true)}>
        <IconTrash width={16} height={16} /> Start over
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
      <p className="text-sm font-medium text-ink">
        This deletes the business, its calls, bookings and knowledge base.
      </p>
      <p className="mt-1 text-sm text-ink-2">This can't be undone.</p>
      <div className="mt-3 flex gap-2">
        <button
          className="btn bg-danger text-white hover:bg-danger/90"
          onClick={reset}
          disabled={working}
        >
          {working ? "Erasing…" : "Yes, erase everything"}
        </button>
        <button className="btn-ghost" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

// The headline of Settings: your agent is a shareable product on its own — a
// public page anyone can talk to, or an embed for the business's website. No
// phone number required (that's an optional add-on further down).
function ShareAgent({ businessId }: { businessId: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/agent/${businessId}`;
  const embed = `<iframe src="${link}" width="420" height="640" style="border:0;border-radius:16px" allow="microphone"></iframe>`;
  return (
    <section className="card mb-6 border-brand/25 bg-gradient-to-br from-brand/[0.06] to-transparent p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">
            Share your voice agent
          </h2>
          <p className="mt-0.5 max-w-md text-sm text-ink-2">
            A live page anyone can talk to — put it on your website or send the
            link. No phone number needed.
          </p>
        </div>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="btn-primary !py-2 shrink-0"
        >
          Open agent →
        </a>
      </div>
      <div className="mt-4 space-y-3">
        <CopyField label="Shareable link" value={link} />
        <CopyField label="Embed on your website" value={embed} mono />
      </div>
    </section>
  );
}

function CopyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };
  return (
    <div>
      <span className="label mb-1.5 block">{label}</span>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={classNames("input", mono && "font-mono text-xs")}
        />
        <button className="btn-outline !py-2 shrink-0" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function pick(b: Business): Draft {
  return {
    name: b.name,
    industry: b.industry,
    greeting: b.greeting,
    owner_phone: b.owner_phone,
    owner_email: b.owner_email,
    timezone: b.timezone,
    language: b.language,
    max_bookings_per_day: b.max_bookings_per_day,
    booking_buffer_min: b.booking_buffer_min,
    escalation_threshold: b.escalation_threshold,
    voice_id: b.voice_id,
    agent_live: b.agent_live,
    phone_number: b.phone_number,
    system_prompt: b.system_prompt,
  };
}
