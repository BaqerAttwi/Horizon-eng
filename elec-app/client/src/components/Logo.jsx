export default function Logo({ size = 48, showText = true, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...style }}>
      <span style={{ display: 'inline-flex', background: '#fff', borderRadius: 6, padding: 2 }}>
        <img src="/LogoHorizonLB.png" alt="Horizon LB" width={size} height={size} style={{ borderRadius: 4, display: 'block' }} />
      </span>
      {showText && <span style={{ fontWeight: 800, fontSize: size * 0.45, color: 'var(--accent)', letterSpacing: 1 }}>HORIZON</span>}
    </span>
  );
}
