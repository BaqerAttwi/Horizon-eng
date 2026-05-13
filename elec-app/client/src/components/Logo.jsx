import { LOGO_SVG } from '../utils/logo';

export default function Logo({ size = 36, showText = true, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
      <span dangerouslySetInnerHTML={{
        __html: LOGO_SVG.replace('<svg', `<svg width="${size}" height="${size}" style="border-radius:4px"`)
      }} />
      {showText && <span style={{ fontWeight: 800, fontSize: size * 0.45, color: 'var(--accent)', letterSpacing: 1 }}>HORIZON</span>}
    </span>
  );
}
