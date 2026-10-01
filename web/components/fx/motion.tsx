"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/// Rises out of a soft blur as it scrolls into view. Once only: a page that re-animates on every
/// scroll back up feels like it is performing rather than responding.
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  ...rest
}: { children: ReactNode; delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: "blur(10px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, delay, ease: EASE_OUT }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/// A headline that assembles word by word, each rising through a mask.
export function SplitWords({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.06,
  onLoad = false,
}: {
  text: string;
  className?: string;
  wordClassName?: (word: string, index: number) => string | undefined;
  delay?: number;
  stagger?: number;
  /// Animate on first paint with CSS instead of on scroll-into-view: for above-the-fold headlines,
  /// which must not wait for hydration to become visible.
  onLoad?: boolean;
}) {
  const words = text.split(" ");
  if (onLoad) {
    return (
      <span className={className}>
        <span className="sr-only">{text}</span>
        {words.map((word, i) => (
          <span key={`${word}-${i}`} aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <span
              className={`word-rise inline-block ${wordClassName?.(word, i) ?? ""}`}
              style={{ animationDelay: `${delay + i * stagger}s` }}
            >
              {word}
              {i < words.length - 1 ? " " : ""}
            </span>
          </span>
        ))}
      </span>
    );
  }
  return (
    // Screen readers get the sentence once, as text; the animated words are hidden from them.
    // (An aria-label on a plain span is not allowed, and is ignored by some readers.)
    <span className={className}>
      <span className="sr-only">{text}</span>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <motion.span
            className={`inline-block ${wordClassName?.(word, i) ?? ""}`}
            initial={{ y: "110%", rotate: 4, opacity: 0 }}
            whileInView={{ y: "0%", rotate: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: delay + i * stagger, ease: EASE_OUT }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/// A number that rolls to its value: on first sight, and smoothly on every change after.
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 1.4,
}: {
  value: number | undefined;
  format: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const current = useRef<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || value === undefined || !inView) return;
    if (reduced) {
      node.textContent = format(value);
      current.current = value;
      return;
    }
    const from = current.current ?? 0;
    const controls = animate(from, value, {
      duration: current.current === null ? duration : 0.6,
      ease: EASE_OUT,
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
    });
    current.current = value;
    return () => controls.stop();
  }, [value, inView, reduced, format, duration]);

  return (
    <span ref={ref} className={className}>
      {value === undefined ? "—" : format(0)}
    </span>
  );
}

/// Drifts toward the pointer while it hovers, and springs back when it leaves.
export function Magnetic({ children, strength = 0.3, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={`inline-block ${className ?? ""}`}
      style={{ x, y }}
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== "mouse") return;
        const rect = ref.current!.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) * strength);
        y.set((event.clientY - rect.top - rect.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/// Leans toward the pointer in 3D, with a highlight that follows it across the surface.
export function Tilt({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 160, damping: 18 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 160, damping: 18 });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, transformStyle: "preserve-3d" }}
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== "mouse") return;
        const rect = ref.current!.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = (event.clientY - rect.top) / rect.height;
        px.set(nx);
        py.set(ny);
        ref.current!.style.setProperty("--mx", `${nx * 100}%`);
        ref.current!.style.setProperty("--my", `${ny * 100}%`);
        ref.current!.style.setProperty("--spot", "1");
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
        ref.current!.style.setProperty("--spot", "0");
      }}
    >
      {children}
    </motion.div>
  );
}

/// Pointer handlers that drive the `.spotlight` light across a surface without tilting it —
/// for panels holding forms, where a moving target would be hostile.
export function spotlightHandlers() {
  return {
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      el.style.setProperty("--my", `${event.clientY - rect.top}px`);
      el.style.setProperty("--spot", "1");
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      event.currentTarget.style.setProperty("--spot", "0");
    },
  };
}

/// An endless horizontal ribbon. Content is rendered twice so the loop has no seam.
export function Marquee({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] ${className ?? ""}`}>
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
