"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, type ReactNode } from "react";

import { spotlightHandlers } from "./fx/motion";

/// A pane of liquid glass. The light behind the page reads through it, a highlight catches its
/// top-left edge, and a soft spotlight follows the cursor across it.
export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
  eyebrow,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
}) {
  return (
    <section className={`glass spotlight rounded-3xl ${className}`} {...spotlightHandlers()}>
      {title && (
        <header className="relative z-[2] flex items-start gap-3 px-5 pb-1 pt-5 sm:px-6">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
            <h2 className="text-[15px] font-medium tracking-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{subtitle}</p>}
          </div>
          {action && <div className="ml-auto shrink-0">{action}</div>}
        </header>
      )}
      <div className="relative z-[2] p-5 sm:p-6">{children}</div>
    </section>
  );
}

const TONES = {
  default: "text-ink",
  good: "text-good",
  critical: "text-critical",
  muted: "text-ink-muted",
  gold: "text-gold",
} as const;

/// A label/value row. Values are tabular so columns of them line up, and they cross-fade when
/// they change so a live figure ticks rather than jumps.
export function Row({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.04] py-2 last:border-0">
      <span className="text-[12.5px] text-ink-muted">
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-ink-muted/60">{hint}</span>}
      </span>
      <Ticking value={value} className={`tnum font-mono text-[13px] ${TONES[tone]}`} />
    </div>
  );
}

/// `textClassName` lands on the element that holds the glyphs: gradient text (background-clip)
/// only paints on its own text, never through a transformed child.
function Ticking({ value, className, textClassName = "" }: { value: ReactNode; className: string; textClassName?: string }) {
  const key = typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  if (key === undefined) return <span className={`${className} ${textClassName}`}>{value}</span>;
  return (
    <span className={`relative inline-flex ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={key}
          className={textClassName}
          initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/// A headline figure on glass. Proportional figures by choice — this is not a column.
export function Stat({
  label,
  value,
  detail,
  tone = "default",
  accent = "cobalt",
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "default" | "good" | "critical";
  accent?: "cobalt" | "violet" | "gold" | "good" | "critical";
}) {
  const toneClass = { default: "text-chrome", good: "text-good", critical: "text-critical" }[tone];
  const glow = {
    cobalt: "from-cobalt/40",
    violet: "from-violet/40",
    gold: "from-gold/40",
    good: "from-good/40",
    critical: "from-critical/40",
  }[accent];

  return (
    <div className="glass spotlight group overflow-hidden rounded-2xl px-5 py-4" {...spotlightHandlers()}>
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${glow} to-transparent opacity-50 blur-2xl transition-opacity duration-700 group-hover:opacity-90`} />
      <div className="relative z-[2]">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-muted">{label}</div>
        <div className="mt-2 text-[26px] font-semibold leading-none tracking-tight">
          <Ticking value={value} className="" textClassName={`${toneClass} pb-0.5`} />
        </div>
        {detail && <div className="mt-2 text-[12px] text-ink-muted">{detail}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12.5px] text-ink-secondary">{label}</span>
        {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  suffix,
  invalid,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  suffix?: string;
  invalid?: boolean;
}) {
  return (
    <div
      className={`group relative flex items-center gap-2 rounded-xl border bg-black/30 px-3.5 py-2.5 transition-all duration-300 ${
        invalid
          ? "border-critical/60 shadow-glow-critical"
          : "border-white/[0.08] hover:border-white/[0.16] focus-within:border-cobalt/60 focus-within:shadow-glow-cobalt"
      }`}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="tnum w-full bg-transparent font-mono text-[15px] text-ink outline-none placeholder:text-ink-muted/50"
      />
      {suffix && <span className="shrink-0 text-[12px] text-ink-muted">{suffix}</span>}
    </div>
  );
}

const BUTTONS = {
  primary:
    "bg-gradient-to-b from-white to-[#cfd7f5] text-[#0a0d1c] shadow-[0_10px_30px_-10px_rgba(180,200,255,0.65),inset_0_1px_0_rgba(255,255,255,0.9)] hover:shadow-[0_14px_40px_-10px_rgba(180,200,255,0.85),inset_0_1px_0_rgba(255,255,255,0.9)]",
  gold:
    "bg-gradient-to-b from-gold-soft via-gold to-gold-deep text-[#1d1203] shadow-[0_10px_30px_-10px_rgba(243,198,111,0.8),inset_0_1px_0_rgba(255,255,255,0.7)] hover:shadow-[0_14px_44px_-8px_rgba(243,198,111,0.95),inset_0_1px_0_rgba(255,255,255,0.7)]",
  good:
    "bg-gradient-to-b from-[#6ff3c2] to-[#1fbf85] text-[#03140d] shadow-[0_10px_30px_-10px_rgba(62,230,168,0.8),inset_0_1px_0_rgba(255,255,255,0.6)] hover:shadow-[0_14px_44px_-8px_rgba(62,230,168,0.95),inset_0_1px_0_rgba(255,255,255,0.6)]",
  critical:
    "bg-gradient-to-b from-[#ff8ea1] to-[#e5385a] text-[#1a0308] shadow-[0_10px_30px_-10px_rgba(255,92,122,0.8),inset_0_1px_0_rgba(255,255,255,0.55)] hover:shadow-[0_14px_44px_-8px_rgba(255,92,122,0.95),inset_0_1px_0_rgba(255,255,255,0.55)]",
  ghost:
    "border border-white/[0.1] bg-white/[0.04] text-ink-secondary backdrop-blur-md hover:border-white/[0.22] hover:bg-white/[0.08] hover:text-ink",
} as const;

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: keyof typeof BUTTONS;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={`gloss w-full rounded-xl px-4 py-2.5 text-[13.5px] font-semibold tracking-tight transition-[box-shadow,background,border-color,color,opacity] duration-300 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none ${BUTTONS[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

/// Risk disclosure. This track judges whether a trader would trust the interface with capital,
/// and hiding the downside is how you lose that.
export function Disclosure({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 border-t border-white/[0.06] pt-4 text-[11.5px] leading-relaxed text-ink-muted">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-[13px] leading-relaxed text-ink-muted">{children}</div>;
}

/// A segmented control whose selection is a lit bead of glass that slides between options.
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  render: (option: T) => string;
}) {
  const id = useId();
  return (
    <div className="relative flex items-center gap-0.5 rounded-full border border-white/[0.06] bg-black/30 p-0.5">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            onClick={() => onChange(option)}
            className={`tnum relative rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors ${
              active ? "text-ink" : "text-ink-muted hover:text-ink-secondary"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{render(option)}</span>
          </button>
        );
      })}
    </div>
  );
}

/// A small live indicator: a dot with a ring that keeps breathing outward.
export function LiveDot({ tone = "good" }: { tone?: "good" | "gold" | "cobalt" }) {
  const colour = { good: "bg-good", gold: "bg-gold", cobalt: "bg-cobalt" }[tone];
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className={`absolute inset-0 rounded-full ${colour} animate-pulse-ring`} />
      <span className={`relative h-2 w-2 rounded-full ${colour}`} />
    </span>
  );
}
