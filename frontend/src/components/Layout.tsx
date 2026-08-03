import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, getAdminToken, setAdminToken } from "@/api/client";
import type { Business } from "@/api/types";
import { classNames } from "@/lib/format";
import { useTheme } from "@/lib/useTheme";
import { Equalizer, LivePill } from "./LiveIndicator";
import {
  IconArrowRight,
  IconBook,
  IconCalendar,
  IconChart,
  IconDashboard,
  IconMenu,
  IconMoon,
  IconPhone,
  IconSettings,
  IconSun,
  IconWand,
  IconX,
} from "./icons";

// `books` marks nav that only makes sense for the receptionist (the one agent
// type that takes appointments); everything else is shown for every agent.
const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: IconDashboard, end: true },
  { to: "/calls", label: "Conversations", icon: IconPhone },
  { to: "/bookings", label: "Bookings", icon: IconCalendar, books: true },
  { to: "/knowledge", label: "Knowledge", icon: IconBook },
  { to: "/analytics", label: "Analytics", icon: IconChart },
  { to: "/simulator", label: "Voice agent", icon: IconWand },
  { to: "/settings", label: "Settings", icon: IconSettings },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-ink shadow-sm">
        <Equalizer size={16} className="text-brand-ink" />
      </span>
      <div className="leading-tight">
        <p className="font-display text-[15px] font-bold tracking-tight text-ink">
          Sonari
        </p>
        <p className="text-[11px] font-medium text-ink-3">AI voice agent</p>
      </div>
    </div>
  );
}

// Shows the active agent and links back to the agents list to switch or create.
function AgentSwitcher({ name, onNavigate }: { name?: string; onNavigate?: () => void }) {
  return (
    <Link
      to="/"
      onClick={onNavigate}
      className="mt-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 transition hover:border-brand/30 hover:bg-surface-2"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand">
        <Equalizer size={13} className="text-brand" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">
          {name ?? "Agent"}
        </span>
        <span className="block text-[11px] text-ink-3">Switch agent</span>
      </span>
      <IconArrowRight width={14} height={14} className="text-ink-3" />
    </Link>
  );
}

function NavItems({
  books,
  onNavigate,
}: {
  books: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => books || !item.books).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            classNames("nav-link", isActive && "nav-link-active")
          }
        >
          <Icon width={18} height={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout({
  business,
  onReset,
}: {
  business: Business | null;
  onReset?: () => void;
}) {
  const { theme, toggle } = useTheme();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();

  // Only the receptionist (no instructions → structured booking brain) takes
  // appointments, so booking-only nav is hidden for every other agent.
  const books = !business?.system_prompt;

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <div className="min-h-full">
      {/* ---- Desktop sidebar ---- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <Brand />
        <AgentSwitcher name={business?.name} />
        <div className="mt-6 flex-1">
          <NavItems books={books} />
        </div>
        <div className="rounded-xl border border-line bg-surface-2/60 p-3">
          <p className="label mb-1.5">Status</p>
          <LivePill live={!!business?.agent_live} />
          {books && business?.phone_number && (
            <p className="mt-2 font-mono text-[11px] text-ink-3">
              {business.phone_number}
            </p>
          )}
        </div>
      </aside>

      {/* ---- Mobile drawer ---- */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawer(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col border-r border-line bg-surface px-4 py-5 animate-fade-up">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                className="btn-ghost !px-2"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
              >
                <IconX />
              </button>
            </div>
            <AgentSwitcher name={business?.name} onNavigate={() => setDrawer(false)} />
            <div className="mt-6 flex-1">
              <NavItems books={books} onNavigate={() => setDrawer(false)} />
            </div>
            <LivePill live={!!business?.agent_live} />
          </aside>
        </div>
      )}

      {/* ---- Main column ---- */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-md sm:px-6">
          <button
            className="btn-ghost !px-2 lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
          >
            <IconMenu />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/12 text-brand lg:hidden">
              <Equalizer size={14} className="text-brand" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {business?.name ?? "Sonari"}
              </p>
              <p className="hidden text-xs text-ink-3 sm:block">
                {business?.industry ?? "Your AI voice agent"}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <LivePill live={!!business?.agent_live} />
            </div>
            <button
              className="btn-ghost !px-2"
              onClick={toggle}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
            {getAdminToken() && (
              <button
                className="btn-ghost text-sm"
                onClick={() => {
                  setAdminToken(null);
                  window.location.assign("/");
                }}
              >
                Sign out
              </button>
            )}
          </div>
        </header>

        {business?.is_demo && <DemoBanner onReset={onReset} />}

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Shown on every page while the loaded business is the sample data, so there's
// always an obvious way back to a clean start (rather than it being buried in
// Settings).
function DemoBanner({ onReset }: { onReset?: () => void }) {
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);

  const exitDemo = async () => {
    setWorking(true);
    try {
      await api.post("/demo/reset");
      onReset?.(); // refetch -> no business -> home page
      navigate("/");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="border-b border-signal/30 bg-signal/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-sm sm:px-6">
        <span className="font-medium text-ink">
          You’re exploring with sample data.
        </span>
        <span className="text-ink-2">
          Nothing here is yours — clear it whenever you like.
        </span>
        <button
          onClick={exitDemo}
          disabled={working}
          className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
        >
          {working ? "Clearing…" : "Exit sample data"}
        </button>
      </div>
    </div>
  );
}
