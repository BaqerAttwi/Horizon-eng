export default function Logo({ size = 160, style, className = '' }) {
  return (
    <span className={`logo-wrapper ${className}`} style={{ display: 'inline-flex', background: '#fff', borderRadius: 4, padding: 3, lineHeight: 0, ...style }}>
      <img src="/LogoHorizonLB.png" alt="Horizon LB" style={{ width: size, maxWidth: '100%', height: 'auto', display: 'block', borderRadius: 2 }} />
    </span>
  );
}
