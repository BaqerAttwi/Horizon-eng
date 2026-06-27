export default function Logo({ size = 160, style }) {
  return (
    <img
      src="/LogoHorizonLB.png"
      alt="Horizon LB"
      style={{ width: size, maxWidth: '100%', height: 'auto', display: 'block', borderRadius: 4, ...style }}
    />
  );
}
