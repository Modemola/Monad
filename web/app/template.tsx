"use client";

import { motion } from "motion/react";

/// Every route arrives the same way: up out of a soft blur. A template, not a layout, so it
/// re-mounts — and re-plays — on each navigation.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: "blur(12px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
