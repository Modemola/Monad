import type { Config } from "tailwindcss";

/// Molten Glass. An obsidian plane lit by three lights: cobalt (the brand), violet (Monad) and
/// molten gold (the ingot). Glass surfaces are translucent white over that light, never grey.
///
/// Token names are the ones the components already speak — `ink`, `hairline`, `good` — so a
/// colour can change here without touching a single component.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#03040a",
        plane: "rgba(6, 8, 18, 0.72)",
        surface: "rgba(255, 255, 255, 0.035)",
        raised: "rgba(255, 255, 255, 0.07)",
        hairline: "rgba(255, 255, 255, 0.08)",
        axis: "rgba(255, 255, 255, 0.16)",
        ink: "#f5f7ff",
        "ink-secondary": "#b8bfd8",
        "ink-muted": "#7c849f",
        cobalt: { DEFAULT: "#4f8cff", soft: "#8db4ff", deep: "#1f4fd1" },
        violet: { DEFAULT: "#8b6cff", soft: "#b7a6ff", deep: "#5232d6" },
        gold: { DEFAULT: "#f3c66f", soft: "#ffe3a6", deep: "#c4862c" },
        "series-1": "#5b9cff",
        "series-2": "#ff6b81",
        good: "#3ee6a8",
        warning: "#ffb547",
        serious: "#ff8a5c",
        critical: "#ff5c7a",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        display: ["'Instrument Serif'", "Georgia", "serif"],
      },
      boxShadow: {
        glass:
          "inset 0 1px 0 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.04), 0 30px 80px -30px rgba(0,0,0,0.8)",
        "glow-cobalt": "0 0 40px -6px rgba(79,140,255,0.55)",
        "glow-gold": "0 0 40px -6px rgba(243,198,111,0.55)",
        "glow-good": "0 0 32px -8px rgba(62,230,168,0.6)",
        "glow-critical": "0 0 32px -8px rgba(255,92,122,0.6)",
      },
      keyframes: {
        "sheen": {
          "0%": { transform: "translateX(-120%) skewX(-20deg)" },
          "100%": { transform: "translateX(220%) skewX(-20deg)" },
        },
        "marquee": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        "gradient-pan": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
      },
      animation: {
        sheen: "sheen 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
        marquee: "marquee 60s linear infinite",
        "pulse-ring": "pulse-ring 2.2s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        float: "float 6s ease-in-out infinite",
        "spin-slow": "spin-slow 24s linear infinite",
        "gradient-pan": "gradient-pan 8s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
