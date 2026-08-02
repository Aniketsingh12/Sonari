import { useState } from "react";
import { api } from "@/api/client";
import { useQuery } from "@/api/hooks";
import type { Faq } from "@/api/types";
import { EmptyState, PageHeader, Spinner } from "@/components/ui";
import { IconBook, IconPlus, IconTrash } from "@/components/icons";

export function Knowledge() {
  const { data, loading, refetch } = useQuery<Faq[]>("/faqs");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ question: "", answer: "" });

  const add = async () => {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    try {
      await api.post("/faqs", { question: question.trim(), answer: answer.trim() });
      setQuestion("");
      setAnswer("");
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const save = async (id: string) => {
    await api.patch(`/faqs/${id}`, draft);
    setEditing(null);
    refetch();
  };

  const remove = async (id: string) => {
    await api.del(`/faqs/${id}`);
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="Knowledge base"
        subtitle="What your agent knows. Answers are retrieved live during calls (RAG)."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Add form */}
        <div className="lg:col-span-2">
          <div className="card sticky top-24 p-5">
            <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink">
              <IconPlus width={16} height={16} className="text-brand" /> Add an answer
            </h2>
            <label className="label">Question</label>
            <input
              className="input mt-1.5"
              placeholder="What are your opening hours?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <label className="label mt-4 block">Answer</label>
            <textarea
              className="input mt-1.5 min-h-[120px] resize-y"
              placeholder="Write it the way you'd say it out loud — the agent answers in its own words."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <button
              className="btn-primary mt-4 w-full"
              onClick={add}
              disabled={saving || !question.trim() || !answer.trim()}
            >
              {saving ? <Spinner className="text-brand-ink" /> : "Add to knowledge base"}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="grid place-items-center py-16">
              <Spinner className="text-ink-3" />
            </div>
          ) : data && data.length ? (
            <div className="space-y-3">
              {data.map((f) => (
                <div key={f.id} className="card p-4">
                  {editing === f.id ? (
                    <div className="space-y-2">
                      <input
                        className="input"
                        value={draft.question}
                        onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                      />
                      <textarea
                        className="input min-h-[90px] resize-y"
                        value={draft.answer}
                        onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <button className="btn-primary !py-2" onClick={() => save(f.id)}>
                          Save
                        </button>
                        <button className="btn-ghost !py-2" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{f.question}</p>
                        <p className="mt-1 text-sm text-ink-2">{f.answer}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          className="rounded-lg p-2 text-ink-3 hover:bg-surface-2 hover:text-ink"
                          onClick={() => {
                            setEditing(f.id);
                            setDraft({ question: f.question, answer: f.answer });
                          }}
                          aria-label="Edit"
                        >
                          <IconBook width={16} height={16} />
                        </button>
                        <button
                          className="rounded-lg p-2 text-ink-3 hover:bg-danger/10 hover:text-danger"
                          onClick={() => remove(f.id)}
                          aria-label="Delete"
                        >
                          <IconTrash width={16} height={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconBook width={28} height={28} />}
              title="No answers yet"
              hint="Add the questions callers ask most. Your agent will answer them in its own words."
            />
          )}
        </div>
      </div>
    </div>
  );
}
