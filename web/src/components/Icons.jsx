// Small inline icons (no icon library needed)
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const BusIcon = ({ size = 20 }) => (
  <svg {...base} width={size} height={size}>
    <rect x="4" y="3" width="16" height="15" rx="3" />
    <path d="M4 11h16M8 18v2M16 18v2" />
    <circle cx="8.5" cy="14.5" r=".6" fill="currentColor" />
    <circle cx="15.5" cy="14.5" r=".6" fill="currentColor" />
  </svg>
)
export const BackIcon = () => <svg {...base}><path d="m15 18-6-6 6-6" /></svg>
export const SlidersIcon = () => <svg {...base}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
export const WarnIcon = () => <svg {...base}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v5M12 18h.01" /></svg>
export const CloseIcon = () => <svg {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>

// The same bus drawn as an HTML string, for the map markers
export const busSvgString = (size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v2M16 18v2"/></svg>`
