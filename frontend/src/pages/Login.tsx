import { useState } from "react";
import { api, setAdminToken } from "@/api/client";
import { Equalizer } from "@/components/LiveIndicator";
import { ErrorNote } from "@/components/ui";

// Shown when the backend has ADMIN_PASSWORD set and we don't hold a valid token.
// Only the owner dashboard is gated — shared voice-agent links stay public.

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ token: string }>("/auth/login", { password });
      setAdminToken(res.token);
      onSignedIn();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not sign in. Please try again.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-bg px-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 sm:p-7">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-brand-ink">
            <Equalizer size={17} className="text-brand-ink" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-base font-bold text-ink">Sonari</p>
            <p className="text-[11px] text-ink-3">AI voice agents</p>
          </div>
        </div>

        <h1 className="mt-5 font-display text-lg font-semibold text-ink">
          Sign in to your dashboard
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          Shared agent links keep working without this — only management is protected.
        </p>

        <label className="mt-5 block">
          <span className="label mb-1.5 block">Dashboard password</span>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div className="mt-3">
            <ErrorNote message={error} />
          </div>
        )}

        <button
          type="submit"
          className="btn-primary mt-5 w-full justify-center"
          disabled={busy || !password}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
