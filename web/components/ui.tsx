"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, type ReactNode } from "react";

import { spotlightHandlers } from "./fx/motion";

/// Four corner marks, like the registration stamps on an assayed bar. The motif that ties every
/// panel on Ingot to the object it is named after.
export function Hallmarks({ tone = "gold" }: { tone?: "gold" | "ink" }) {
  const colour = tone === "gold" ? "border-gold/50" : "border-ink/25";
  const base = `pointer-events-none absolute h-2.5 w-2.5 ${colour}`;
  return (
    <>
      <span aria-hidden className={`${base} -left-px -top-px border-l border-t`} />
      <span aria-hidden className={`${base} -right-px -top-px border-r border-t`} />
      <span aria-hidden className={`${base} -bottom-px -left-px border-b border-l`} />
      <span aria-hidden className={`${base} -bottom-px -right-px border-b border-r`} />
    </>
  );
}

/// A panel on the foundry floor: one hairline, hallmarked corners, and an optional lot serial —
/// the small stamped code in the top-right that says what this panel is.
export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
  eyebrow,
  serial,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  serial?: string;
}) {
  return (
    <section className={`glass spotlight ${className}`} {...spotlightHandlers()}>
      <Hallmarks />
      {title && (
        <header className="relative z-[2] flex items-start gap-3 border-b border-hairline px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
            <h2 className="font-display text-[21px] font-light leading-tight tracking-[-0.01em] text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{subtitle}</p>}
          </div>
          {(action || serial) && (
            <div className="ml-auto flex shrink-0 items-start gap-3">
              {serial && <span className="label pt-0.5 text-ink-muted/70">{serial}</span>}
              {action}
            </div>
          )}
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
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-hairline py-2.5 last:border-0">
      <span className="text-[12.5px] text-ink-muted">
        {label}
        {hint && <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted/60">{hint}</span>}
      </span>
      <Ticking value={value} className="tnum font-mono text-[13px]" textClassName={TONES[tone]} />
    </div>
  );
}

/// `textClassName` lands on the element that holds the glyphs, so colour and gradient text both
/// paint correctly even while the value animates.
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

/// A headline figure. Several sit side by side in a strip divided by hairlines — the exchange
/// board above the pit.
export function Stat({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "default" | "good" | "critical";
  accent?: string;
}) {
  const toneClass = { default: "text-ink", good: "text-good", critical: "text-critical" }[tone];
  return (
    <div className="relative min-w-0 bg-coal px-4 py-5 sm:px-5">
      <div className="label">{label}</div>
      {/* Money like "$2,003,067.82" is too wide for half a phone screen at full size. */}
      <div
        className={`tnum mt-3 font-mono leading-none tracking-tight sm:text-[26px] ${value.length > 9 ? "text-[17px]" : "text-[24px]"}`}
      >
        <Ticking value={value} className="" textClassName={toneClass} />
      </div>
      {detail && <div className="mt-2 text-[12px] text-ink-muted">{detail}</div>}
    </div>
  );
}

/// The strip the stats sit in: a single hairline frame, cells divided by hairlines.
export function StatStrip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative grid gap-px border border-hairline bg-hairline ${className}`}>
      <Hallmarks />
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label text-ink-secondary">{label}</span>
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
  shortcuts,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  suffix?: string;
  invalid?: boolean;
  /// Quick fills shown inside the field, e.g. "Max".
  shortcuts?: { label: string; value: string | undefined }[];
}) {
  return (
    <div
      className={`relative flex items-center gap-2 border bg-void px-3.5 py-3 transition-colors duration-300 ${
        invalid ? "border-critical/70" : "border-hairline hover:border-axis focus-within:border-gold/70"
      }`}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/,/g, ""))}
        placeholder={placeholder}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        className="tnum w-full min-w-0 bg-transparent font-mono text-[16px] text-ink outline-none placeholder:text-ink-muted/40"
      />
      {shortcuts?.map((shortcut) => (
        <button
          key={shortcut.label}
          type="button"
          disabled={shortcut.value === undefined}
          onClick={() => shortcut.value !== undefined && onChange(shortcut.value)}
          className="shrink-0 border border-gold/30 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-gold/80 transition-colors hover:border-gold/70 hover:text-gold disabled:opacity-30"
        >
          {shortcut.label}
        </button>
      ))}
      {suffix && <span className="label shrink-0">{suffix}</span>}
    </div>
  );
}

const BUTTONS = {
  primary: "border border-gold bg-gold text-[#140e05] hover:border-gold-soft hover:bg-gold-soft",
  gold: "border border-gold bg-gold text-[#140e05] hover:border-gold-soft hover:bg-gold-soft",
  good: "border border-good bg-good text-[#06140c] hover:brightness-110",
  critical: "border border-critical bg-critical text-[#1a0703] hover:brightness-110",
  ghost: "border border-hairline bg-transparent text-ink-secondary hover:border-gold/50 hover:text-ink",
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
      whileTap={disabled ? undefined : { scale: 0.985 }}
      className={`gloss w-full px-4 py-3 font-mono text-[11.5px] font-medium uppercase tracking-[0.18em] transition-[background,border-color,color,filter,opacity] duration-300 disabled:cursor-not-allowed disabled:opacity-30 ${BUTTONS[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

/// Risk disclosure. This track judges whether a trader would trust the interface with capital,
/// and hiding the downside is how you lose that.
export function Disclosure({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 border-t border-hairline pt-4 text-[11.5px] leading-relaxed text-ink-muted">{children}</p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-[13px] leading-relaxed text-ink-muted">{children}</div>;
}

/// A segmented control: square cells in a hairline frame, the selection a slab of gold-tinted
/// light that slides between them.
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
    <div className="relative flex items-center border border-hairline">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            onClick={() => onChange(option)}
            className={`tnum relative px-2.5 py-1 font-mono text-[11px] transition-colors ${
              active ? "text-gold" : "text-ink-muted hover:text-ink-secondary"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 bg-gold/10 shadow-[inset_0_-1px_0_rgba(232,182,97,0.9)]"
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
  const colour = { good: "bg-good", gold: "bg-gold", cobalt: "bg-gold" }[tone];
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className={`absolute inset-0 rounded-full ${colour} animate-pulse-ring`} />
      <span className={`relative h-2 w-2 rounded-full ${colour}`} />
    </span>
  );
}
