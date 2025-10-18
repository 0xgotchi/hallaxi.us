"use client";

import type { Variants } from "framer-motion";
import { motion } from "framer-motion";
import type { PropsWithChildren } from "react";

export default function AnimatedPage({ children }: PropsWithChildren) {
  return (
    <motion.div
      className="space-y-8"
      initial="initial"
      animate="animate"
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: 0.08,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

const fadeInUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function FadeInUp({ children }: PropsWithChildren) {
  return (
    <motion.div initial="initial" animate="animate" variants={fadeInUp}>
      {children}
    </motion.div>
  );
}
