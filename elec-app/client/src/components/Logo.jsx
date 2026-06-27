export default function Logo({ size = 120, showText = true, style }) {
  const imgW = typeof size === 'number' ? size : parseInt(size);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...style }}>
      <span style={{ display: 'inline-flex', background: '#fff', borderRadius: 6, padding: 2, lineHeight: 0 }}>
        <img src="/LogoHorizonLB.png" alt="Horizon LB" width={imgW} style={{ borderRadius: 4, height: 'auto', objectFit: 'contain' }} />
      </span>
      {showText && <span style={{ fontWeight: 800, fontSize: Math.max(11, imgW * 0.15), color: 'var(--accent)', letterSpacing: 1 }}>HORIZON</span>}
    </span>
  );
}
