import Link from "next/link";

import { Hallmarks } from "@/components/ui";

/// A page that does not exist, assayed and found wanting.
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[78svh] w-full max-w-3xl items-center px-4 pb-16 pt-28 sm:px-6">
      <div className="relative w-full overflow-hidden border border-hairline bg-coal px-8 py-16 text-center">
        <Hallmarks />
        <div className="assay pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative">
          <div className="label text-gold/80">Assay result · no such page</div>
          <div className="mt-5 font-display text-[clamp(5rem,16vw,9rem)] font-light leading-none tracking-[-0.04em]">
            <span className="italic text-molten">404</span>
          </div>
          <p className="mx-auto mt-6 max-w-md text-[14.5px] leading-relaxed text-ink-secondary">
            This address was tested and holds nothing. The market, the loans and the underwriting
            vault are all one click away.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex border border-gold bg-gold px-6 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[#140e05] transition-colors hover:bg-gold-soft"
            >
              Back to the overview
            </Link>
            <Link
              href="/trade"
              className="inline-flex border border-hairline px-6 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-secondary transition-colors hover:border-gold/50 hover:text-ink"
            >
              Open the terminal →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
