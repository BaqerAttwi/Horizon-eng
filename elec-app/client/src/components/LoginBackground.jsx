import { motion } from 'framer-motion';

// Decorative, theme-aware animated backdrop for the login screen — slow glowing
// orbs + a faint pulsing circuit-line pattern + drifting spark particles.
// Pure CSS/SVG (no external image assets), sits behind the login card at z-index 0.

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  left: (i * 137.5) % 100, // golden-angle spread for even, non-repeating distribution
  size: 2 + (i % 3),
  duration: 10 + (i % 6) * 2,
  delay: (i % 7) * 1.3,
}));

export default function LoginBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, overflow: 'hidden',
        zIndex: 0, pointerEvents: 'none',
      }}
    >
      {/* Slow-drifting glow orbs */}
      <motion.div
        style={{
          position: 'absolute', width: 520, height: 520, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(26,95,168,0.22) 0%, transparent 70%)',
          top: '-10%', left: '-8%', filter: 'blur(10px)',
        }}
        animate={{ x: [0, 40, -10, 0], y: [0, 30, 60, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute', width: 460, height: 460, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(74,143,196,0.18) 0%, transparent 70%)',
          bottom: '-12%', right: '-6%', filter: 'blur(10px)',
        }}
        animate={{ x: [0, -30, 20, 0], y: [0, -40, -10, 0], scale: [1, 0.94, 1.1, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      <motion.div
        style={{
          position: 'absolute', width: 340, height: 340, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.10) 0%, transparent 70%)',
          top: '35%', right: '15%', filter: 'blur(14px)',
        }}
        animate={{ x: [0, 25, -25, 0], y: [0, -20, 20, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* Faint pulsing circuit-line pattern */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
        <defs>
          <pattern id="circuit" width="120" height="120" patternUnits="userSpaceOnUse">
            <path
              d="M0 60 H40 M40 60 V20 H80 M80 60 V100 H120 M40 60 V100"
              fill="none" stroke="var(--accent)" strokeWidth="1"
            />
            <circle cx="40" cy="60" r="2.5" fill="var(--accent)" />
            <circle cx="80" cy="20" r="2.5" fill="var(--accent)" />
            <circle cx="80" cy="100" r="2.5" fill="var(--accent)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#circuit)" />
      </svg>

      {/* Drifting spark particles */}
      {PARTICLES.map(p => (
        <motion.span
          key={p.id}
          style={{
            position: 'absolute', left: `${p.left}%`, bottom: -20,
            width: p.size, height: p.size, borderRadius: '50%',
            background: 'var(--primary-light)',
            boxShadow: '0 0 6px 1px var(--primary-light)',
          }}
          animate={{ y: ['0vh', '-100vh'], opacity: [0, 0.8, 0.8, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'linear' }}
        />
      ))}
    </div>
  );
}
