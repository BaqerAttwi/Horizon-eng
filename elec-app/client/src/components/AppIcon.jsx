const paths = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
  projects: <><path d="M14.7 6.3a4 4 0 0 0-5-5l2.1 2.1-2.4 2.4-2.1-2.1a4 4 0 0 0 5 5L4 17l3 3 7.7-8.3a4 4 0 0 0 5-5l-2.1 2.1-2.4-2.4z"/></>,
  products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4.3 7.7 12 12l7.7-4.3M12 12v9"/></>,
  demand: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  procurement: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 8"/></>,
  groups: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  announcements: <><path d="m3 11 16-7v16L3 13zM7 14l2 6h4l-2-7"/><path d="M19 9a3 3 0 0 1 0 6"/></>,
  requests: <><path d="M8 12h8M12 8l4 4-4 4"/><rect x="3" y="3" width="18" height="18" rx="4"/></>,
  upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></>,
  discounts: <><path d="m20 13-7 7L4 11V4h7l9 9z"/><circle cx="8.5" cy="8.5" r="1"/><path d="m10 16 6-6"/></>,
  analytics: <><path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-7"/></>,
  debt: <><circle cx="12" cy="12" r="9"/><path d="M16 8h-5a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H8m4-10v12"/></>,
  workers: <><circle cx="9" cy="8" r="4"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0M17 8h5M19.5 5.5v5"/></>,
  clients: <><path d="M4 21V6l8-3v18M12 8h8v13M2 21h20M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01"/></>,
  divisions: <><path d="M12 3v6M6 21v-5h12v5M6 16v-4h12v4"/><circle cx="12" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="21" r="2"/></>,
  updates: <><path d="m12 3 1.5 5.2L19 10l-5.5 1.8L12 17l-1.5-5.2L5 10l5.5-1.8z"/><path d="m19 3 .6 2.4L22 6l-2.4.6L19 9l-.6-2.4L16 6l2.4-.6z"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.9.5-1.3 1-1.3 2M12 17h.01"/></>,
  owner: <><path d="m3 7 4 4 5-7 5 7 4-4-2 11H5zM5 21h14"/></>,
  head_engineer: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></>,
  stock_manager: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4.3 7.7 12 12l7.7-4.3M12 12v9"/></>,
  accounting: <><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2"/></>,
  engineer: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></>,
  secretary: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 9h8M8 13h8M8 17h5"/></>,
  technician: <><path d="M14.7 6.3a4 4 0 0 0-5-5l2.1 2.1-2.4 2.4-2.1-2.1a4 4 0 0 0 5 5L4 17l3 3 7.7-8.3"/></>,
};

export default function AppIcon({ name, size = 18, strokeWidth = 1.8, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.help}</svg>;
}
