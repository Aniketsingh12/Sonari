// Drives the one-shot entrance timeline armed in index.html.
//
// The document starts at data-enter="pending" (resting state in CSS). Once the
// variable font has actually loaded we flip to "run" so the wipe and rises play
// against final glyphs rather than re-flowing mid-animation, then to "done",
// which drops every entrance rule so the rest state is plain authored CSS.

const START_FALLBACK_MS = 1200;
const DONE_FALLBACK_MS = 3000;

let started = false;

export function runEntrance(): void {
  if (started) return;
  started = true;

  const root = document.documentElement;
  if (root.getAttribute("data-enter") !== "pending") return; // reduced motion

  const finish = () => {
    if (root.getAttribute("data-enter") === "done") return;
    root.setAttribute("data-enter", "done");
  };

  const start = () => {
    if (root.getAttribute("data-enter") !== "pending") return;
    root.setAttribute("data-enter", "run");
    window.setTimeout(finish, DONE_FALLBACK_MS);
  };

  // Two frames after fonts settle: one to apply "run", one to let the browser
  // paint the resting state first so the animation has somewhere to start from.
  const armed = window.setTimeout(start, START_FALLBACK_MS);
  const ready = document.fonts?.ready ?? Promise.resolve();
  ready.then(() => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.clearTimeout(armed);
        start();
      }),
    );
  });
}
