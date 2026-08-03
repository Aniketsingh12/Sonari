import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { setBusinessId } from "./api/client";
import { useQuery } from "./api/hooks";
import type { AgentSummary, Business } from "./api/types";
import { Layout } from "./components/Layout";
import { Equalizer } from "./components/LiveIndicator";
import { Agents } from "./pages/Agents";
import { Analytics } from "./pages/Analytics";
import { CreateAgent } from "./pages/CreateAgent";
import { Bookings } from "./pages/Bookings";
import { CallDetail } from "./pages/CallDetail";
import { Calls } from "./pages/Calls";
import { Dashboard } from "./pages/Dashboard";
import { Knowledge } from "./pages/Knowledge";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Onboarding } from "./pages/Onboarding";
import { PublicAgent } from "./pages/PublicAgent";
import { Settings } from "./pages/Settings";
import { Simulator } from "./pages/Simulator";

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand text-brand-ink shadow-pop">
          <Equalizer size={24} className="text-brand-ink" />
        </span>
        <p className="text-sm font-medium text-ink-2">Loading your agents…</p>
      </div>
    </div>
  );
}

// Reload into whichever agent is now active (after create/switch/demo-load).
const reloadHome = () => window.location.assign("/");

export default function App() {
  const location = useLocation();

  // Is the dashboard password-protected, and are we signed in?
  const authQ = useQuery<{ auth_required: boolean; authenticated: boolean }>(
    "/auth/status",
  );

  // The set of agents the owner has built, and the currently-active one (which
  // the dashboard is scoped to via the X-Business-Id header).
  const agentsQ = useQuery<AgentSummary[]>("/businesses");
  const meQ = useQuery<Business>("/businesses/me");

  useEffect(() => {
    if (meQ.data?.id) setBusinessId(meQ.data.id);
  }, [meQ.data?.id]);

  // The public, embeddable voice agent is tenant-less: it fetches its own config
  // by id from the URL and never depends on the owner's session.
  if (location.pathname.startsWith("/agent/")) {
    return (
      <Routes>
        <Route path="/agent/:businessId" element={<PublicAgent />} />
      </Routes>
    );
  }

  // Everything below is the owner dashboard, so the gate comes first.
  if (authQ.loading) return <FullScreenLoader />;
  if (authQ.data?.auth_required && !authQ.data.authenticated) {
    // Reload so every query refetches with the new token.
    return <Login onSignedIn={() => window.location.reload()} />;
  }

  if (agentsQ.loading) return <FullScreenLoader />;

  if (agentsQ.error) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-6">
        <div className="card max-w-md p-6 text-center">
          <h1 className="font-display text-lg font-semibold text-ink">
            Can’t reach the backend
          </h1>
          <p className="mt-2 text-sm text-ink-2">{agentsQ.error}</p>
          <p className="mt-3 text-sm text-ink-3">
            Start the API with{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
              uvicorn app.main:app --reload
            </code>{" "}
            then retry.
          </p>
          <button className="btn-primary mt-5" onClick={agentsQ.refetch}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const agents = agentsQ.data ?? [];
  const refetchAll = () => {
    agentsQ.refetch();
    meQ.refetch();
  };

  // No agents yet — the landing page is home, with the setup wizard behind it.
  if (agents.length === 0) {
    return (
      <Routes>
        <Route path="/new" element={<CreateAgent />} />
        <Route path="/setup" element={<Onboarding onDone={reloadHome} />} />
        <Route path="*" element={<Landing onDemoLoaded={reloadHome} />} />
      </Routes>
    );
  }

  // Agents exist; wait for the active one to resolve before scoping the dashboard.
  if (!meQ.data) return <FullScreenLoader />;
  const business = meQ.data;

  return (
    <Routes>
      <Route path="/welcome" element={<Landing onDemoLoaded={reloadHome} configured />} />
      <Route path="/new" element={<CreateAgent />} />
      <Route path="/setup" element={<Onboarding onDone={reloadHome} />} />
      {/* Home is the platform: all your agents. An individual agent's workspace
          lives under /dashboard, entered by opening one from here. */}
      <Route
        index
        element={<Agents agents={agents} activeId={business.id} onChange={refetchAll} />}
      />
      <Route
        path="/agents"
        element={<Navigate to="/" replace />}
      />
      <Route element={<Layout business={business} onReset={reloadHome} />}>
        <Route path="dashboard" element={<Dashboard business={business} />} />
        <Route path="calls" element={<Calls business={business} />} />
        <Route path="calls/:id" element={<CallDetail />} />
        <Route path="bookings" element={<Bookings business={business} />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="analytics" element={<Analytics business={business} />} />
        <Route path="simulator" element={<Simulator business={business} />} />
        <Route path="settings" element={<Settings business={business} onSaved={refetchAll} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
