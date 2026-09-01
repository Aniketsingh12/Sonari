/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic tokens — resolved from CSS variables so light/dark swap
        // in one place (see src/index.css). Alpha-aware via <alpha-value>.
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-2": "rgb(var(--ink-2) / <alpha-value>)",
        "ink-3": "rgb(var(--ink-3) / <alpha-value>)",
        // Decorative grey for card meta and captions. Deliberately lighter than
        // ink-3 and not for body copy — it does not meet contrast as text.
        muted: "rgb(var(--muted) / <alpha-value>)",
        brand: "rgb(var(--brand) / <alpha-value>)",
        "brand-2": "rgb(var(--brand-2) / <alpha-value>)",
        "brand-ink": "rgb(var(--brand-ink) / <alpha-value>)",
        signal: "rgb(var(--signal) / <alpha-value>)",
        good: "rgb(var(--good) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        // One variable family across the whole product. `display` is kept as an
        // alias so existing markup keeps working; it resolves to the same face.
        sans: [
          "Figtree",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        display: [
          "Figtree",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontWeight: {
        // Real variable-font instances, not the usual 400/500/700 stops.
        light: "388",
        normal: "470",
        medium: "500",
        semibold: "511",
        bold: "577",
        black: "783",
      },
      fontSize: {
        display: ["var(--fs-display)", { lineHeight: "var(--lh-display)" }],
        title: ["var(--fs-title)", { lineHeight: "var(--lh-flat)" }],
        heading: ["var(--fs-heading)", { lineHeight: "var(--lh-flat)" }],
        body: ["var(--fs-body)", { lineHeight: "var(--lh-body)" }],
        eyebrow: ["var(--fs-eyebrow)", { lineHeight: "var(--lh-flat)" }],
        ui: ["var(--fs-ui)", { lineHeight: "var(--lh-flat)" }],
        meta: ["var(--fs-meta)", { lineHeight: "var(--lh-flat)" }],
        item: ["var(--fs-item)", { lineHeight: "var(--lh-flat)" }],
        caption: ["var(--fs-caption)", { lineHeight: "var(--lh-flat)" }],
        tab: ["var(--fs-tab)", { lineHeight: "var(--lh-flat)" }],
      },
      letterSpacing: {
        // Tailwind's stock `tracking-tight` (-0.025em) is looser than the
        // tracking body copy already inherits (-0.0475em), so headings using it
        // would read *wider* than their own paragraphs. Retuned to sit between
        // the display and heading tokens, which fixes every heading app-wide.
        tight: "-0.048em",
        tighter: "-0.057em",
        display: "var(--tr-display)",
        title: "var(--tr-title)",
        heading: "var(--tr-heading)",
        body: "var(--tr-body)",
        eyebrow: "var(--tr-eyebrow)",
        ui: "var(--tr-ui)",
        cta: "var(--tr-cta)",
        meta: "var(--tr-meta)",
        item: "var(--tr-item)",
        caption: "var(--tr-caption)",
        wordmark: "var(--tr-wordmark)",
      },
      borderRadius: {
        pill: "17px",
        xl: "12px",
        "2xl": "16px",
        nav: "26px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.03), 0 12px 32px -20px rgb(0 0 0 / 0.14)",
        pop: "0 18px 48px -20px rgb(0 0 0 / 0.28)",
      },
      transitionTimingFunction: {
        reveal: "cubic-bezier(.22, 1, .36, 1)",
        settle: "cubic-bezier(.16, 1, .30, 1)",
      },
      keyframes: {
        eq: {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        // Uses `translate`, not `transform`: elements that carry their own
        // transform (centering, scale) would otherwise have it overwritten.
        "fade-up": {
          "0%": { opacity: "0", translate: "0 6px" },
          "100%": { opacity: "1", translate: "0" },
        },
      },
      animation: {
        eq: "eq 900ms ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
        "fade-up": "fade-up 320ms cubic-bezier(.16, 1, .30, 1) both",
      },
    },
  },
  plugins: [],
};
