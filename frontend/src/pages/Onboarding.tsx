import { useState } from "react";
import { api, setBusinessId } from "@/api/client";
import type { Business } from "@/api/types";
import { Equalizer } from "@/components/LiveIndicator";
import { VoicePicker } from "@/components/VoicePicker";
import { ErrorNote, Spinner } from "@/components/ui";
import { IconArrowRight, IconCheck, IconPlus, IconTrash } from "@/components/icons";
import { classNames } from "@/lib/format";
import { LANGUAGES, defaultGreeting, detectLanguage } from "@/lib/languages";

// The setup wizard. Sonari ships with no business configured — whoever
// installs it describes their own business here, whatever industry it's in.

const STEPS = [
  { key: "business", label: "Business" },
  { key: "services", label: "Services" },
  { key: "knowledge", label: "Knowledge" },
  { key: "rules", label: "Rules" },
  { key: "voice", label: "Voice" },
];

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

type Hours = Record<string, [string, string] | null>;

const DEFAULT_HOURS: Hours = {
  mon: ["09:00", "17:00"],
  tue: ["09:00", "17:00"],
  wed: ["09:00", "17:00"],
  thu: ["09:00", "17:00"],
  fri: ["09:00", "17:00"],
  sat: null,
  sun: null,
};

interface ServiceDraft {
  name: string;
  duration_min: number;
  price: string;
}

interface FaqDraft {
  question: string;
  answer: string;
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Draft state -------------------------------------------------
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  );
  const [lang, setLang] = useState(detectLanguage());
  const [hours, setHours] = useState<Hours>(DEFAULT_HOURS);
  const [services, setServices] = useState<ServiceDraft[]>([
    { name: "", duration_min: 30, price: "" },
  ]);
  const [faqs, setFaqs] = useState<FaqDraft[]>([{ question: "", answer: "" }]);
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [maxPerDay, setMaxPerDay] = useState(20);
  const [buffer, setBuffer] = useState(0);
  const [threshold, setThreshold] = useState(0.45);
  const [voiceId, setVoiceId] = useState("default");
  const [greeting, setGreeting] = useState("");

  const effectiveGreeting = greeting.trim() || defaultGreeting(lang, name);

  // ---- Validation --------------------------------------------------
  const validService = services.filter((s) => s.name.trim());
  const canNext =
    step === 0 ? name.trim().length > 1 : step === 1 ? validService.length > 0 : true;

  // ---- Actions -----------------------------------------------------
  const loadDemo = async () => {
    setLoadingDemo(true);
    setError(null);
    try {
      const biz = await api.post<Business>("/demo/seed");
      setBusinessId(biz.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the sample data.");
      setLoadingDemo(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const biz = await api.post<Business>("/businesses", {
        name: name.trim(),
        // This wizard only ever builds a receptionist: it collects services,
        // hours and booking rules, and leaves instructions empty so the agent
        // runs the structured booking brain. Without this it was mislabelled
        // "assistant" while still behaving as a receptionist.
        agent_type: "receptionist",
        industry: industry.trim() || null,
        timezone,
        language: lang,
        greeting: effectiveGreeting,
        owner_phone: ownerPhone.trim() || null,
        owner_email: ownerEmail.trim() || null,
        phone_number: phoneNumber.trim() || null,
        hours,
        booking_buffer_min: buffer,
        max_bookings_per_day: maxPerDay,
        voice_id: voiceId,
        escalation_threshold: threshold,
        services: validService.map((s) => ({
          name: s.name.trim(),
          duration_min: s.duration_min,
          price: s.price === "" ? null : Number(s.price),
        })),
      });
      setBusinessId(biz.id);

      // FAQs are posted separately so each one gets embedded for retrieval.
      for (const f of faqs) {
        if (f.question.trim() && f.answer.trim()) {
          await api.post("/faqs", {
            question: f.question.trim(),
            answer: f.answer.trim(),
          });
        }
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your business.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-ink">
            <Equalizer size={16} className="text-brand-ink" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold text-ink">Sonari</p>
            <p className="text-[11px] text-ink-3">Set up your agent</p>
          </div>
          <button
            onClick={loadDemo}
            disabled={loadingDemo || saving}
            className="ml-auto text-xs font-medium text-ink-3 underline-offset-2 hover:text-brand hover:underline disabled:opacity-50"
          >
            {loadingDemo ? "Loading…" : "Just exploring? Load sample data"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Stepper */}
        <ol className="mb-8 flex items-center gap-1 sm:gap-2">
          {STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={s.key} className="flex flex-1 items-center gap-1 sm:gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={classNames(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
                      done
                        ? "bg-brand text-brand-ink"
                        : current
                          ? "bg-brand/15 text-brand ring-2 ring-brand/40"
                          : "bg-surface-2 text-ink-3",
                    )}
                  >
                    {done ? <IconCheck width={13} height={13} /> : i + 1}
                  </span>
                  <span
                    className={classNames(
                      "hidden truncate text-xs font-medium sm:block",
                      current ? "text-ink" : "text-ink-3",
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span
                    className={classNames(
                      "h-px flex-1",
                      done ? "bg-brand" : "bg-line",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>

        <div className="card p-5 sm:p-7">
          {/* ---------------- Step 1: Business ---------------- */}
          {step === 0 && (
            <Step
              title="Tell us about your business"
              hint="This is how your agent introduces itself to callers."
            >
              <Field label="Business name" required>
                <input
                  className="input"
                  autoFocus
                  placeholder="e.g. Riverside Auto Repair"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="What do you do?">
                <input
                  className="input"
                  placeholder="e.g. Auto repair shop, hair salon, law firm"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Language your agent speaks">
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
                </Field>
                <Field label="Time zone">
                  <input
                    className="input"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  />
                </Field>
              </div>

              <div className="mt-2">
                <span className="label mb-2 block">Opening hours</span>
                <div className="space-y-1.5">
                  {DAYS.map((d) => {
                    const open = hours[d.key];
                    return (
                      <div
                        key={d.key}
                        className="flex items-center gap-2 rounded-lg border border-line px-3 py-2"
                      >
                        <label className="flex w-28 shrink-0 cursor-pointer items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            className="accent-brand"
                            checked={!!open}
                            onChange={(e) =>
                              setHours({
                                ...hours,
                                [d.key]: e.target.checked ? ["09:00", "17:00"] : null,
                              })
                            }
                          />
                          {d.label}
                        </label>
                        {open ? (
                          <div className="flex flex-1 items-center gap-2">
                            <input
                              type="time"
                              className="input !py-1.5"
                              value={open[0]}
                              onChange={(e) =>
                                setHours({ ...hours, [d.key]: [e.target.value, open[1]] })
                              }
                            />
                            <span className="text-xs text-ink-3">to</span>
                            <input
                              type="time"
                              className="input !py-1.5"
                              value={open[1]}
                              onChange={(e) =>
                                setHours({ ...hours, [d.key]: [open[0], e.target.value] })
                              }
                            />
                          </div>
                        ) : (
                          <span className="flex-1 text-sm text-ink-3">Closed</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Step>
          )}

          {/* ---------------- Step 2: Services ---------------- */}
          {step === 1 && (
            <Step
              title="What can people book?"
              hint="Add anything a caller might book. You can change these later."
            >
              <div className="space-y-2">
                {services.map((s, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2.5"
                  >
                    <input
                      className="input !py-1.5 min-w-[140px] flex-1"
                      placeholder="Service name"
                      value={s.name}
                      onChange={(e) =>
                        setServices(
                          services.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={5}
                        step={5}
                        className="input !py-1.5 w-20"
                        value={s.duration_min}
                        onChange={(e) =>
                          setServices(
                            services.map((x, j) =>
                              j === i
                                ? { ...x, duration_min: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                      <span className="text-xs text-ink-3">min</span>
                    </div>
                    <input
                      type="number"
                      className="input !py-1.5 w-24"
                      placeholder="Price"
                      value={s.price}
                      onChange={(e) =>
                        setServices(
                          services.map((x, j) =>
                            j === i ? { ...x, price: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    {services.length > 1 && (
                      <button
                        className="rounded-lg p-2 text-ink-3 hover:bg-danger/10 hover:text-danger"
                        onClick={() => setServices(services.filter((_, j) => j !== i))}
                        aria-label="Remove service"
                      >
                        <IconTrash width={16} height={16} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="btn-ghost w-full justify-center"
                  onClick={() =>
                    setServices([...services, { name: "", duration_min: 30, price: "" }])
                  }
                >
                  <IconPlus width={16} height={16} /> Add another
                </button>
              </div>
            </Step>
          )}

          {/* ---------------- Step 3: Knowledge ---------------- */}
          {step === 2 && (
            <Step
              title="What do callers always ask?"
              hint="Your agent answers from this in its own words. Add a few now — you can add more any time."
            >
              <div className="space-y-3">
                {faqs.map((f, i) => (
                  <div key={i} className="rounded-xl border border-line p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <input
                          className="input !py-1.5"
                          placeholder="What are your opening hours?"
                          value={f.question}
                          onChange={(e) =>
                            setFaqs(
                              faqs.map((x, j) =>
                                j === i ? { ...x, question: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <textarea
                          className="input min-h-[70px] resize-y !py-1.5"
                          placeholder="Answer it the way you'd say it on the phone."
                          value={f.answer}
                          onChange={(e) =>
                            setFaqs(
                              faqs.map((x, j) =>
                                j === i ? { ...x, answer: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      {faqs.length > 1 && (
                        <button
                          className="rounded-lg p-2 text-ink-3 hover:bg-danger/10 hover:text-danger"
                          onClick={() => setFaqs(faqs.filter((_, j) => j !== i))}
                          aria-label="Remove question"
                        >
                          <IconTrash width={16} height={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  className="btn-ghost w-full justify-center"
                  onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}
                >
                  <IconPlus width={16} height={16} /> Add another question
                </button>
              </div>
            </Step>
          )}

          {/* ---------------- Step 4: Rules ---------------- */}
          {step === 3 && (
            <Step
              title="Booking rules and escalation"
              hint="Guardrails for the calendar, and where callers go when they need a person."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Max bookings per day">
                  <input
                    type="number"
                    className="input"
                    value={maxPerDay}
                    onChange={(e) => setMaxPerDay(Number(e.target.value))}
                  />
                </Field>
                <Field label="Buffer between bookings (min)">
                  <input
                    type="number"
                    className="input"
                    value={buffer}
                    onChange={(e) => setBuffer(Number(e.target.value))}
                  />
                </Field>
              </div>
              <Field label="Phone for a human (read out when escalating)">
                <input
                  className="input"
                  placeholder="+1 (555) 123-4567"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                />
              </Field>
              <Field label="Email for call summaries">
                <input
                  className="input"
                  placeholder="you@yourbusiness.com"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                />
              </Field>
              <Field
                label={`Escalate to a human below ${Math.round(threshold * 100)}% confidence`}
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-brand"
                />
              </Field>
            </Step>
          )}

          {/* ---------------- Step 5: Voice ---------------- */}
          {step === 4 && (
            <Step
              title="Pick a voice and a greeting"
              hint="Previews play through whichever TTS engine you've configured."
            >
              <Field label="Greeting">
                <textarea
                  className="input min-h-[70px] resize-y"
                  placeholder={effectiveGreeting}
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-ink-3">
                  Callers will hear: “{effectiveGreeting}”
                </p>
              </Field>
              <div className="mt-2">
                <span className="label mb-2 block">Voice</span>
                <VoicePicker value={voiceId} onChange={setVoiceId} language={lang} />
              </div>

              <div className="mt-5 rounded-xl border border-line bg-surface-2/60 p-4">
                <p className="text-sm font-semibold text-ink">Connecting your phone</p>
                <p className="mt-1 text-sm text-ink-2">
                  You can try your agent in the browser straight away. To take
                  real calls, connect the number callers will dial — a Twilio or
                  Exotel virtual number, or forward your existing line to it.
                </p>
                <div className="mt-3">
                  <Field label="Phone number (optional — you can add it later in Settings)">
                    <input
                      className="input font-mono"
                      placeholder="+911140000000"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </Step>
          )}

          {error && (
            <div className="mt-5">
              <ErrorNote message={error} />
            </div>
          )}

          {/* ---------------- Nav ---------------- */}
          <div className="mt-7 flex items-center justify-between border-t border-line pt-5">
            <button
              className="btn-ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || saving}
            >
              Back
            </button>

            <span className="text-xs text-ink-3">
              Step {step + 1} of {STEPS.length}
            </span>

            {step < STEPS.length - 1 ? (
              <button
                className="btn-primary"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
              >
                Continue <IconArrowRight width={16} height={16} />
              </button>
            ) : (
              <button className="btn-primary" onClick={finish} disabled={saving}>
                {saving ? <Spinner className="text-brand-ink" /> : "Take my calls"}
              </button>
            )}
          </div>
        </div>

        {step === 0 && (
          <p className="mt-4 text-center text-xs text-ink-3">
            Nothing here is industry-specific — Sonari works for any business that
            books appointments.
          </p>
        )}
      </main>
    </div>
  );
}

function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        {title}
      </h1>
      {hint && <p className="mt-1 text-sm text-ink-2">{hint}</p>}
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}
