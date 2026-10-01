"use client";

import { AnimatePresence, motion } from "motion/react";

import { dismissToast, useToasts, type ToastStatus } from "@/lib/tx";
import { Hallmarks } from "./ui";

const STATUS: Record<ToastStatus, { label: string; tone: string; bar: string }> = {
  signing: { label: "Sign", tone: "text-gold", bar: "bg-gold" },
  pending: { label: "Pending", tone: "text-gold", bar: "bg-gold" },
  success: { label: "Confirmed", tone: "text-good", bar: "bg-good" },
  error: { label: "Failed", tone: "text-critical", bar: "bg-critical" },
};

/// Every transaction, followed from signature to block. Sits above the mobile dock, out of the
/// ticket's way on desktop, and announces itself to screen readers.
export function Toasts() {
  const toasts = useToasts();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-24 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const look = STATUS[toast.status];
          const working = toast.status === "signing" || toast.status === "pending";
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              role={toast.status === "error" ? "alert" : "status"}
              className="pointer-events-auto relative w-full max-w-sm overflow-hidden border border-hairline bg-coal/95 px-4 py-3.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur"
            >
              <Hallmarks />
              <div className="flex items-start gap-3">
                <span className="relative mt-1 flex h-2 w-2 shrink-0">
                  {working && <span className={`absolute inset-0 animate-ping ${look.bar} opacity-60`} />}
                  <span className={`relative h-2 w-2 ${look.bar}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-ink">{toast.title}</span>
                    <span className={`shrink-0 font-mono text-[9.5px] uppercase tracking-[0.2em] ${look.tone}`}>{look.label}</span>
                  </div>
                  {toast.detail && <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{toast.detail}</p>}
                  {toast.explorer && (
                    <a
                      href={toast.explorer}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-block font-mono text-[10.5px] uppercase tracking-[0.16em] text-gold/80 hover:text-gold"
                    >
                      View on MonadScan ↗
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss"
                  className="-mr-1 -mt-1 p-1 text-ink-muted transition-colors hover:text-ink"
                >
                  ×
                </button>
              </div>
              {working && (
                <motion.span
                  className={`absolute bottom-0 left-0 h-px ${look.bar}`}
                  initial={{ width: "0%" }}
                  animate={{ width: ["0%", "70%", "92%"] }}
                  transition={{ duration: 6, ease: "easeOut" }}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
