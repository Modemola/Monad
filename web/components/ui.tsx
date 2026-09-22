import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-hairline bg-surface ${className}`}
    >
      {title && (
        <header className="flex items-start gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-medium text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-ink-muted">{subtitle}</p>}
          </div>
          {action && <div className="ml-auto shrink-0">{action}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/// A label/value row. Values are tabular so columns of them line up.
export function Row({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "critical" | "muted";
}) {
  const toneClass = {
    default: "text-ink",
    good: "text-good",
    critical: "text-critical",
    muted: "text-ink-muted",
  }[tone];

  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[12px] text-ink-muted">
        {label}
        {hint && <span className="ml-1 text-ink-muted/70">{hint}</span>}
      </span>
      <span className={`tnum text-[13px] ${toneClass}`}>{value}</span>
    </div>
  );
}

/// A single headline figure. Proportional figures by choice — this is not a column.
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
}) {
  const toneClass = {
    default: "text-ink",
    good: "text-good",
    critical: "text-critical",
  }[tone];

  return (
    <div className="rounded-lg border border-hairline bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold leading-tight ${toneClass}`}>{value}</div>
      {detail && <div className="mt-0.5 text-[12px] text-ink-muted">{detail}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[12px] text-ink-secondary">{label}</span>
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
      className={`flex items-center gap-2 rounded border bg-plane px-3 py-2 ${
        invalid ? "border-critical/60" : "border-hairline focus-within:border-axis"
      }`}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="tnum w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-muted/60"
      />
      {suffix && <span className="shrink-0 text-[12px] text-ink-muted">{suffix}</span>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "good" | "critical" | "ghost";
  type?: "button" | "submit";
}) {
  const variants = {
    primary: "bg-ink text-plane hover:opacity-90",
    good: "bg-good text-plane hover:opacity-90",
    critical: "bg-critical text-plane hover:opacity-90",
    ghost: "border border-hairline text-ink-secondary hover:border-axis hover:text-ink",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded px-3 py-2 text-[13px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-35 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

/// Risk disclosure. This track judges whether a trader would trust the interface with
/// capital, and hiding the downside is how you lose that.
export function Disclosure({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-ink-muted">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="py-8 text-center text-[13px] text-ink-muted">{children}</div>
  );
}
