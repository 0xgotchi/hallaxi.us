"use client";

import type { Variants } from "framer-motion";
import { motion } from "framer-motion";
import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";

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
  animate: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const fadeOut: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeInOut",
    },
  },
};

export function FadeInUp({ children }: PropsWithChildren) {
  return (
    <motion.div initial="initial" animate="animate" variants={fadeInUp}>
      {children}
    </motion.div>
  );
}

export function FadeOut({ children }: PropsWithChildren) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [lastScrollY]);

  return (
    <motion.div
      initial="initial"
      animate={isVisible ? "animate" : "initial"}
      variants={fadeOut}
    >
      {children}
    </motion.div>
  );
}
