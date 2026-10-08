import { useEffect, useRef, useState } from 'react';
import AppIcon from './AppIcon';

export const WORKSPACES = [
  { id: 'crm', label: 'CRM', icon: 'clients', color: '#3979df', description: 'Clients, projects & collaboration', routes: ['/projects', '/clients', '/messages', '/calendar'] },
  { id: 'inventory', label: 'Inventory', icon: 'products', color: '#159c87', description: 'Products, demand & procurement', routes: ['/products', '/reservations', '/procurement', '/groups', '/upload', '/notifications'] },
  { id: 'accounting', label: 'Accounting', icon: 'accounting', color: '#9160d5', description: 'Debt, discounts & reporting', routes: ['/debt', '/discounts', '/analytics'] },
  { id: 'admin', label: 'Administration', icon: 'workers', color: '#d18a28', description: 'Team, approvals & configuration', routes: ['/workers', '/requests', '/division-types'] },
  { id: 'execution', label: 'Execution', icon: 'technician', color: '#3979df', description: 'Your assigned projects', routes: ['/my-projects'] },
];

export default function WorkspaceLauncher({ workspaces, active, onSelect, worker, onMenu }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <header className="workspace-topbar">
    <button className="workspace-mobile-menu" aria-label="Open sidebar" onClick={onMenu}>☰</button>
    <div className="workspace-launcher" ref={root}>
      <button ref={trigger} className={`launcher-trigger${open ? ' selected' : ''}`} aria-label="Switch workspace" aria-expanded={open} aria-controls="workspace-apps" onClick={() => setOpen(!open)}>
        <span className="nine-dots" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
      </button>
      {open && <div className="launcher-panel" id="workspace-apps">
        <div className="launcher-heading">Your workspaces<span>Everything you need, in one place</span></div>
        <div className="launcher-grid">{workspaces.map(app => <button key={app.id} className={`launcher-app${active.id === app.id ? ' current' : ''}`} aria-pressed={active.id === app.id} onClick={() => { onSelect(app); setOpen(false); trigger.current?.focus(); }}>
          <span className="workspace-app-icon" style={{ '--app-color': app.color }}><AppIcon name={app.icon} size={25} /></span>
          <strong>{app.label}</strong><small>{app.description}</small>
        </button>)}</div>
      </div>}
    </div>
    <span className="topbar-brand">Horizon<span> / </span></span>
    <span className="topbar-workspace" style={{ color: active.color }}>{active.label}</span>
    <span className="topbar-spacer" />
    <span className="topbar-user">{worker.name}</span>
    <span className="topbar-avatar">{worker.name?.slice(0, 1).toUpperCase()}</span>
  </header>;
}
