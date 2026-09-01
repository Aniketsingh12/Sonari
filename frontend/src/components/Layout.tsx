import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, getAdminToken, setAdminToken } from "@/api/client";
import type { Business } from "@/api/types";
import { classNames } from "@/lib/format";
import { useTheme } from "@/lib/useTheme";
import { Equalizer } from "./LiveIndicator";
import { IconMoon, IconSun } from "./icons";

// The shell is a single floating pill: brand on the left, the agent's sections
// through the middle, controls on the right. There is no sidebar — every page
// gets the full width, and the pill is the only chrome. Below xl the links
// collapse into a menu that drops out of the pill itself.

const NAV = [
  { to: "/dashboard", label: "Dashboard", end: true },
  { to: "/calls", label: "Conversations" },
  { to: "/bookings", label: "Bookings", books: true },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/analytics", label: "Analytics" },
  { to: "/simulator", label: "Voice agent" },
  { to: "/settings", label: "Settings" },
];

function Burger({
  open,
  onClick,
}: {
  open: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      aria-controls="nav-menu"
      className="ml-1 flex h-[34px] w-[34px] shrink-0 flex-col justify-center gap-[5px] rounded-pill border-0 bg-transparent px-[7px] xl:hidden"
    >
      <span
        className="block h-0.5 w-full rounded-[1px] bg-bg transition-transform duration-200"
        style={open ? { transform: "translateY(3.5px) rotate(45deg)" } : undefined}
      />
      <span
        className="block h-0.5 w-full rounded-[1px] bg-bg transition-transform duration-200"
        style={open ? { transform: "translateY(-3.5px) rotate(-45deg)" } : undefined}
      />
    </button>
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
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);

  // Only the receptionist (no instructions → structured booking brain) takes
  // appointments, so booking-only nav is hidden for every other agent.
  const books = !business?.system_prompt;
  const items = NAV.filter((i) => books || !i.books);

  useEffect(() => setMenu(false), [location.pathname]);

  // Click-outside and Escape close the menu, as a dropdown should.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <div className="min-h-full bg-bg">
      <header className="sticky top-0 z-30 px-4 pt-4 sm:px-6 sm:pt-5">
        <nav
          ref={navRef}
          className="nav-pill anim-drop relative mx-auto h-[52px] w-full max-w-[1120px] pl-3.5 pr-2.5"
        >
          {/* Brand → back to the agents home to switch agents. */}
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5 no-underline"
            aria-label="All agents"
          >
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-brand-ink">
              <Equalizer size={15} className="text-brand-ink" />
            </span>
            <span className="hidden text-[17.1px] font-black tracking-wordmark text-bg sm:inline">
              Sonari
            </span>
          </Link>

          {/* Sections — the middle of the pill on wide screens. */}
          <div className="ml-7 hidden items-center gap-6 xl:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  classNames(
                    "nav-pill__link",
                    isActive && "nav-pill__link--active",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5 pl-3">
            {business?.agent_live && (
              <span className="hidden items-center gap-1.5 pr-1.5 sm:flex">
                <Equalizer live size={13} className="text-brand" />
                <span className="text-caption font-medium tracking-caption text-bg/70">
                  Live
                </span>
              </span>
            )}

            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-pill text-bg/70 transition-opacity hover:text-bg"
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>

            {/* The active agent reads as the pill's CTA. */}
            <Link to="/" className="nav-pill__cta max-w-[190px]">
              <span className="truncate">{business?.name ?? "Agents"}</span>
            </Link>

            <Burger
              open={menu}
              onClick={(e) => {
                e.stopPropagation();
                setMenu((v) => !v);
              }}
            />
          </div>

          {/* Dropdown out of the pill, mirroring its shape. */}
          <div
            id="nav-menu"
            hidden={!menu}
            className={classNames(
              "absolute right-0 top-[calc(100%+8px)] flex min-w-[228px] flex-col rounded-[20px] bg-ink p-2.5 transition-all duration-200 xl:!hidden",
              menu
                ? "pointer-events-auto translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-1.5 opacity-0",
            )}
            style={{ display: "flex" }}
          >
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenu(false)}
                className={({ isActive }) =>
                  classNames(
                    "rounded-xl px-3.5 py-2.5 text-ui font-medium tracking-ui text-bg no-underline transition-colors hover:bg-bg/10",
                    isActive && "bg-bg/10",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            {getAdminToken() && (
              <button
                onClick={() => {
                  setAdminToken(null);
                  window.location.assign("/");
                }}
                className="mt-1.5 rounded-pill bg-bg px-3.5 py-2.5 text-center text-ui font-bold tracking-cta text-ink"
              >
                Sign out
              </button>
            )}
          </div>
        </nav>
      </header>

      {business?.is_demo && <DemoBanner onReset={onReset} />}

      <main className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-6 sm:py-9">
        <Outlet />
      </main>
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
    <div className="mx-auto mt-4 w-full max-w-[1120px] px-4 sm:px-6">
      <div className="row-item flex flex-wrap items-center gap-x-3 gap-y-1.5 border-signal/35 bg-signal/10 px-4 py-2.5">
        <span className="text-ui font-medium tracking-ui text-ink">
          You’re exploring with sample data.
        </span>
        <span className="text-ui font-light tracking-body text-ink-2">
          Nothing here is yours — clear it whenever you like.
        </span>
        <button
          onClick={exitDemo}
          disabled={working}
          className="btn-primary ml-auto !min-h-[30px] !px-3 !text-caption"
        >
          {working ? "Clearing…" : "Exit sample data"}
        </button>
      </div>
    </div>
  );
}
