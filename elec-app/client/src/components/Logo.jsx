export default function Logo({ size = 36, showText = true, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
      <img src="/LogoHorizonLB.png" alt="Horizon LB" width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover' }} />
      {showText && <span style={{ fontWeight: 800, fontSize: size * 0.45, color: 'var(--accent)', letterSpacing: 1 }}>HORIZON</span>}
    </span>
  );
}
