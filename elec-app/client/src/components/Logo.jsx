export default function Logo({ size = 80, showText = true, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
      <span style={{ display: 'inline-flex', background: '#fff', borderRadius: '50%', padding: 2 }}>
        <img src="/LogoHorizonLB.png" alt="Horizon LB" width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
      </span>
      {showText && <span style={{ fontWeight: 800, fontSize: Math.max(12, size * 0.22), color: 'var(--accent)', letterSpacing: 1 }}>HORIZON</span>}
    </span>
  );
}
