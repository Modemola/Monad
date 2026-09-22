import type { Config } from "tailwindcss";

/// Design tokens mirror docs/design-tokens: a validated two-series categorical palette
/// on a dark trading surface. Values are not invented here — see lib/tokens.ts.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        plane: "#0d0d0d",
        surface: "#121211",
        raised: "#1a1a19",
        hairline: "#2c2c2a",
        axis: "#383835",
        ink: "#ffffff",
        "ink-secondary": "#c3c2b7",
        "ink-muted": "#898781",
        "series-1": "#3987e5",
        "series-2": "#d95926",
        good: "#0ca30c",
        warning: "#fab219",
        serious: "#ec835a",
        critical: "#d03b3b",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
