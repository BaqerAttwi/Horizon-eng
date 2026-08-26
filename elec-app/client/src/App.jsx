import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AnimatedPage }   from './components/AnimatedPage';
import NotificationBell from './components/NotificationBell';
import Logo            from './components/Logo';
import api             from './api/client';

// Route-level code splitting — each page ships as its own chunk and is only
// fetched when the user actually navigates there, instead of all pages
// bloating the initial bundle.
import LoginPage       from './pages/LoginPage';
const ProductsPage     = lazy(() => import('./pages/ProductsPage'));
const UploadPage       = lazy(() => import('./pages/UploadPage'));
const ProjectsPage     = lazy(() => import('./pages/ProjectsPage'));
const WorkersPage      = lazy(() => import('./pages/WorkersPage'));
const ClientsPage      = lazy(() => import('./pages/ClientsPage'));
const ReservationsPage = lazy(() => import('./pages/ReservationsPage'));
const DiscountsPage    = lazy(() => import('./pages/DiscountsPage'));
const CrmProjectPage   = lazy(() => import('./pages/CrmProjectPage'));
const ClientExportPage = lazy(() => import('./pages/ClientExportPage'));
const RequestsPage     = lazy(() => import('./pages/RequestsPage'));
const AnalyticsPage    = lazy(() => import('./pages/AnalyticsPage'));
const DashboardPage    = lazy(() => import('./pages/DashboardPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const GroupsPage       = lazy(() => import('./pages/GroupsPage'));
const MessagesPage     = lazy(() => import('./pages/MessagesPage'));
const CalendarPage     = lazy(() => import('./pages/CalendarPage'));
const TechnicianProjectsPage = lazy(() => import('./pages/TechnicianProjectsPage'));
const TechnicianExecutionPage = lazy(() => import('./pages/TechnicianExecutionPage'));
const DebtPage = lazy(() => import('./pages/DebtPage'));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage'));
const DivisionTypesPage = lazy(() => import('./pages/DivisionTypesPage'));
const ProcurementPage = lazy(() => import('./pages/ProcurementPage'));

function UpdatesLink({ mobile = false }) {
  const [unread, setUnread] = useState(0);
  const load = () => api.get('/updates').then(r=>setUnread(r.data.unread_count||0)).catch(()=>{});
  useEffect(() => { load(); window.addEventListener('updates-read',load); const timer=setInterval(load,60000); return()=>{clearInterval(timer);window.removeEventListener('updates-read',load);}; }, []);
  return <NavLink to="/updates" className={({isActive})=>mobile?'updates-mobile-link':`nav-link updates-nav${isActive?' active':''}`}>
    <span className="nav-icon">✨</span>{!mobile&&'What’s New'}{unread>0&&<span className="updates-count">{unread>99?'99+':unread}</span>}
  </NavLink>;
}

// Role badge colors
const ROLE_COLORS = { owner:'#a78bfa', head_engineer:'#22d3ee', stock_manager:'#f59e0b', accounting:'#60a5fa', engineer:'#4ade80', secretary:'#fbbf24', technician:'#94a3b8' };
const ROLE_ICONS  = { owner:'👑', head_engineer:'🧭', stock_manager:'📦', accounting:'💼', engineer:'⚙️', secretary:'📋', technician:'🛠️' };

// Technicians only get the execution-only "My Projects" view — no pricing/CRM access
const TECHNICIAN_NAV = [
  { to: '/my-projects', icon: '🛠️', label: 'My Projects', perm: null, group: 'main' },
];
const STOCK_MANAGER_NAV = [
  { to: '/procurement', icon: '✅', label: 'Procurement Queue', perm: 'procurement', group: 'crm' },
  { to: '/products', icon: '📦', label: 'Stock Management', perm: 'products', group: 'crm' },
  { to: '/reservations', icon: '📊', label: 'Demand Tracker', perm: 'reservations', group: 'crm' },
  { to: '/notifications', icon: '🔔', label: 'Stock Alerts', perm: 'notifications', group: 'crm' },
];

// Nav items with permission check
const NAV = [
  { to: '/dashboard',   icon: '🏠', label: 'Dashboard',      perm: null,       group: 'main' },
  { to: '/calendar',     icon: '📅', label: 'Calendar',       perm: null,       group: 'main' },
  { to: '/projects',     icon: '🔧', label: 'Projects',       perm: 'projects', group: 'main' },
  { to: '/products',     icon: '📦', label: 'Products',       perm: 'products', group: 'crm' },
  { to: '/reservations', icon: '📊', label: 'Demand Tracker',  perm: 'reservations', group: 'crm' },
  { to: '/procurement',  icon: '✅', label: 'Procurement Queue', perm: 'procurement', group: 'crm', roles:['owner','head_engineer'] },
  { to: '/groups',       icon: '📋', label: 'Item Groups',     perm: 'item-groups',   group: 'crm' },
  { to: '/messages',     icon: '📢', label: 'Announcements', perm: 'messages',       group: 'crm' },
  { to: '/requests',     icon: '🤝', label: 'Requests',       perm: 'requests', group: 'admin' },
  { to: '/upload',       icon: '⬆️', label: 'Import Excel',    perm: 'upload',   group: 'admin' },
  { to: '/discounts',    icon: '🏷️', label: 'Brand Discounts', perm: 'discounts', group: 'admin' },
  { to: '/analytics',    icon: '📈', label: 'Analytics',      perm: 'analytics', group: 'admin' },
  { to: '/debt',         icon: '💸', label: 'Debt',           perm: 'debt',     group: 'admin' },
  { to: '/workers',      icon: '👷', label: 'Workers',        perm: 'workers',  group: 'admin' },
  { to: '/clients',      icon: '🏢', label: 'Clients',        perm: 'clients',  group: 'admin' },
  { to: '/division-types',icon: '🧩', label: 'Division Types', perm: null, group: 'admin', roles:['owner','head_engineer'] },
];

const GROUP_LABELS = {
  main: 'General',
  crm: 'CRM & Products',
  admin: 'Administration',
};

// Protected route wrapper
function ProtectedRoute({ children, perm, roles }) {
  const { worker, loading, can } = useAuth();
  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh' }}><span className="spinner"/></div>;
  if (!worker)  return <Navigate to="/login" replace />;
  if (roles && !roles.includes(worker.role)) return <Navigate to="/dashboard" replace />;
  // Technicians only ever get execution-scoped routes — no dashboard, CRM, pricing, etc.
  if (worker.role === 'technician' && !['execution','updates'].includes(perm)) return <Navigate to="/my-projects" replace />;
  if (worker.role === 'stock_manager' && !['products','reservations','reports','notifications','updates','procurement'].includes(perm)) return <Navigate to="/products" replace />;
  if (perm && !['notifications','updates'].includes(perm) && !can(perm)) return (
    <div className="page">
      <div className="empty" style={{ paddingTop: 80 }}>
        <div className="empty-icon">🚫</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--white)' }}>Access Denied</p>
        <p style={{ marginTop: 6 }}>Your role <strong style={{ color: ROLE_COLORS[worker.role] }}>{worker.role}</strong> doesn't have permission for this page.</p>
      </div>
    </div>
  );
  return children;
}

function Sidebar({ mobileOpen, setMobileOpen, theme, toggleTheme }) {
  const { worker, logout, can, isRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('👋 Logged out');
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <h1><Logo size={160} /></h1>
        <span>Manager v2.0</span>
      </div>

      <nav className="sidebar-nav">
        {(() => {
          const visible = isRole('technician') ? TECHNICIAN_NAV : isRole('stock_manager') ? STOCK_MANAGER_NAV : NAV.filter(n => (!n.roles||n.roles.includes(worker.role))&&(!n.perm || can(n.perm)));
          const groups = [...new Set(visible.map(n => n.group))];
          return groups.flatMap((g, gi) => [
            <div key={`h-${g}`} className="nav-group-label">{GROUP_LABELS[g]}</div>,
            ...visible.filter(n => n.group === g).map(n => (
              <NavLink
                key={n.to} to={n.to}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="nav-icon">{n.icon}</span>
                {n.label}
              </NavLink>
            )),
          ]);
        })()}
      </nav>

      {/* Notification bell for desktop */}
      <div style={{ padding: '2px 8px 0' }}><UpdatesLink /></div>
      <div style={{ padding: '8px 12px' }}>
        <NotificationBell />
      </div>

      {/* Theme toggle */}
      <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        <span className="toggle-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
      </button>

      {/* Worker info at bottom */}
      {worker && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>{ROLE_ICONS[worker.role]}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', lineHeight: 1.2 }}>{worker.name}</div>
              <div style={{ fontSize: 10, color: ROLE_COLORS[worker.role], fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {worker.role}
              </div>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleLogout}
          >
            🚪 Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}

function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('horizon-theme') || 'dark');
  const { worker } = useAuth();
  const location = useLocation();

  // Mirror the theme onto <html> too — the Toaster portal renders as a sibling
  // of this component, outside the `.light-mode` div below, so it otherwise
  // never sees the light-mode color overrides and toasts stay dark-styled.
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', theme === 'light');
  }, [theme]);

  // Surface the result of the OneDrive OAuth redirect (lands back here from
  // /api/onedrive/callback) as a toast, then strip the query params so a
  // page refresh doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onedrive = params.get('onedrive');
    if (!onedrive) return;
    if (onedrive === 'connected') toast.success('✅ OneDrive connected');
    else if (onedrive === 'error') toast.error('❌ OneDrive connection failed: ' + (params.get('message') || 'unknown error'));
    params.delete('onedrive'); params.delete('message');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('horizon-theme', next);
  };

  return (
    <div className={`layout${theme === 'light' ? ' light-mode' : ''}`}>
      {worker && <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} theme={theme} toggleTheme={toggleTheme} />}

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.6)',
            zIndex:199, backdropFilter:'blur(2px)',
            WebkitBackdropFilter:'blur(2px)',
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="main">
        {worker && (
          <div className="mobile-header">
            <button className="btn-icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">☰</button>
            <Logo size={80} />
            <div style={{ flex: 1 }} />
            <UpdatesLink mobile />
        <NotificationBell />
          </div>
        )}

        <AnimatePresence mode="wait">
          <Suspense fallback={<div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'60vh' }}><span className="spinner"/></div>}>
            <Routes location={location} key={location.pathname}>
              <Route path="/login" element={<AnimatedPage><LoginPage /></AnimatedPage>} />
              <Route path="/"          element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<AnimatedPage><ProtectedRoute><DashboardPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/calendar"  element={<AnimatedPage><ProtectedRoute><CalendarPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/products"  element={<AnimatedPage><ProtectedRoute perm="products"><ProductsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/procurement" element={<AnimatedPage><ProtectedRoute perm="procurement" roles={['owner','head_engineer','stock_manager']}><ProcurementPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/reservations" element={<AnimatedPage><ProtectedRoute perm="reservations"><ReservationsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/upload"    element={<AnimatedPage><ProtectedRoute perm="upload"><UploadPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/projects"  element={<AnimatedPage><ProtectedRoute perm="projects"><ProjectsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/projects/:id/crm" element={<AnimatedPage><ProtectedRoute perm="projects"><CrmProjectPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/projects/:id/client-export" element={<AnimatedPage><ProtectedRoute perm="projects"><ClientExportPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/requests"  element={<AnimatedPage><ProtectedRoute perm="requests"><RequestsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/groups" element={<AnimatedPage><ProtectedRoute perm="item-groups"><GroupsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/messages" element={<AnimatedPage><ProtectedRoute perm="messages"><MessagesPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/discounts"  element={<AnimatedPage><ProtectedRoute perm="discounts"><DiscountsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/workers"   element={<AnimatedPage><ProtectedRoute perm="workers"><WorkersPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/clients"   element={<AnimatedPage><ProtectedRoute perm="clients"><ClientsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/analytics" element={<AnimatedPage><ProtectedRoute perm="analytics" roles={['owner']}><AnalyticsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/debt"      element={<AnimatedPage><ProtectedRoute perm="debt"><DebtPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/notifications" element={<AnimatedPage><ProtectedRoute perm="notifications"><NotificationsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/updates" element={<AnimatedPage><ProtectedRoute perm="updates"><UpdatesPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/division-types" element={<AnimatedPage><ProtectedRoute roles={['owner','head_engineer']}><DivisionTypesPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/my-projects"     element={<AnimatedPage><ProtectedRoute perm="execution"><TechnicianProjectsPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="/my-projects/:id" element={<AnimatedPage><ProtectedRoute perm="execution"><TechnicianExecutionPage /></ProtectedRoute></AnimatedPage>} />
              <Route path="*"          element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppLayout />
    </AuthProvider>
  );
}
