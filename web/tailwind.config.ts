import type { Config } from "tailwindcss";

/// Foundry. Warm black like the inside of a furnace, type the colour of bone, and one light:
/// molten gold. Everything else is restraint — hairline rules, square corners, small tracked
/// labels — so the gold, and the numbers, are what the eye finds.
///
/// Token names are the ones the components already speak (`ink`, `hairline`, `good`), so the
/// palette can move here without touching a component.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#090807",
        coal: "#100e0c",
        ash: "#16130f",
        slag: "#1e1a15",
        plane: "#0d0b09",
        surface: "rgba(243, 236, 223, 0.025)",
        raised: "rgba(243, 236, 223, 0.06)",
        hairline: "rgba(243, 236, 223, 0.09)",
        axis: "rgba(243, 236, 223, 0.18)",
        ink: "#f3ecdf",
        "ink-secondary": "#c4baa9",
        "ink-muted": "#867d70",
        gold: { DEFAULT: "#e8b661", soft: "#f6dca6", deep: "#b98535", ember: "#ff9d4d" },
        "series-1": "#e8b661",
        "series-2": "#d9674a",
        good: "#7fd1a6",
        warning: "#f0b04f",
        serious: "#e08a5c",
        critical: "#e0684d",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        display: ["'Newsreader Variable'", "Georgia", "serif"],
      },
      letterSpacing: {
        label: "0.2em",
      },
      keyframes: {
        sheen: {
          "0%": { transform: "translateX(-120%) skewX(-20deg)" },
          "100%": { transform: "translateX(240%) skewX(-20deg)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "gradient-pan": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        "rise": {
          "0%": { transform: "translateY(0)", opacity: "0" },
          "15%": { opacity: "1" },
          "100%": { transform: "translateY(-120px)", opacity: "0" },
        },
      },
      animation: {
        sheen: "sheen 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
        marquee: "marquee 70s linear infinite",
        "pulse-ring": "pulse-ring 2.2s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "spin-slow": "spin-slow 30s linear infinite",
        "gradient-pan": "gradient-pan 9s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
