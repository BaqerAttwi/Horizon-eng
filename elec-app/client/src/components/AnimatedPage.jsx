import { motion } from 'framer-motion';

const fadeSlide = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

export function AnimatedPage({ children, className, ...props }) {
  return (
    <motion.div
      variants={fadeSlide}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function FadeIn({ children, delay = 0, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function SlideUp({ children, delay = 0, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function ScaleIn({ children, delay = 0, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, delay, ease: 'easeOut' }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};

export function StaggerContainer({ children, ...props }) {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" {...props}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...props }) {
  return (
    <motion.div variants={itemVariants} {...props}>
      {children}
    </motion.div>
  );
}

export function HoverScale({ children, scale = 1.02, ...props }) {
  return (
    <motion.div whileHover={{ scale }} transition={{ duration: 0.15 }} {...props}>
      {children}
    </motion.div>
  );
}
