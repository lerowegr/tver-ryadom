'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Плавное появление блока при попадании во вьюпорт (scroll reveal). */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.65, 0.32, 0.9] }}
    >
      {children}
    </motion.div>
  );
}
