import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AnimatedPage }   from './components/AnimatedPage';
import NotificationBell from './components/NotificationBell';
import Logo            from './components/Logo';
import AppIcon         from './components/AppIcon';
import RoleTutorial    from './components/RoleTutorial';
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
    <span className="nav-icon"><AppIcon name="updates" /></span>{!mobile&&<span className="nav-label">What’s New</span>}{unread>0&&<span className="updates-count">{unread>99?'99+':unread}</span>}
  </NavLink>;
}

// Role badge colors
const ROLE_COLORS = { owner:'#a78bfa', head_engineer:'#22d3ee', stock_manager:'#f59e0b', accounting:'#60a5fa', engineer:'#4ade80', secretary:'#fbbf24', technician:'#94a3b8' };

// Technicians only get the execution-only "My Projects" view — no pricing/CRM access
const TECHNICIAN_NAV = [
  { to: '/my-projects', icon: 'technician', label: 'My Projects', perm: null, group: 'main', tone:'#38bdf8' },
];
const STOCK_MANAGER_NAV = [
  { to: '/procurement', icon: 'procurement', label: 'Procurement Queue', perm: 'procurement', group: 'crm', tone:'#22c55e' },
  { to: '/products', icon: 'products', label: 'Stock Management', perm: 'products', group: 'crm', tone:'#8b5cf6' },
  { to: '/reservations', icon: 'demand', label: 'Demand Tracker', perm: 'reservations', group: 'crm', tone:'#06b6d4' },
  { to: '/notifications', icon: 'announcements', label: 'Stock Alerts', perm: 'notifications', group: 'crm', tone:'#f59e0b' },
];

// Nav items with permission check
const NAV = [
  { to: '/dashboard', icon:'dashboard', label:'Dashboard', perm:null, group:'main', tone:'#38bdf8' },
  { to: '/calendar', icon:'calendar', label:'Calendar', perm:null, group:'main', tone:'#818cf8' },
  { to: '/projects', icon:'projects', label:'Projects', perm:'projects', group:'main', tone:'#22d3ee' },
  { to: '/products', icon:'products', label:'Products', perm:'products', group:'crm', tone:'#8b5cf6' },
  { to: '/reservations', icon:'demand', label:'Demand Tracker', perm:'reservations', group:'crm', tone:'#06b6d4' },
  { to: '/procurement', icon:'procurement', label:'Procurement Queue', perm:'procurement', group:'crm', roles:['owner','head_engineer'], tone:'#22c55e' },
  { to: '/groups', icon:'groups', label:'Item Groups', perm:'item-groups', group:'crm', tone:'#a78bfa' },
  { to: '/messages', icon:'announcements', label:'Announcements', perm:'messages', group:'crm', tone:'#f59e0b' },
  { to: '/requests', icon:'requests', label:'Requests', perm:'requests', group:'admin', tone:'#34d399' },
  { to: '/upload', icon:'upload', label:'Import Excel', perm:'upload', group:'admin', tone:'#60a5fa' },
  { to: '/discounts', icon:'discounts', label:'Brand Discounts', perm:'discounts', group:'admin', tone:'#fb7185' },
  { to: '/analytics', icon:'analytics', label:'Analytics', perm:'analytics', group:'admin', tone:'#2dd4bf' },
  { to: '/debt', icon:'debt', label:'Debt', perm:'debt', group:'admin', tone:'#f97316' },
  { to: '/workers', icon:'workers', label:'Workers', perm:'workers', group:'admin', tone:'#c084fc' },
  { to: '/clients', icon:'clients', label:'Clients', perm:'clients', group:'admin', tone:'#fbbf24' },
  { to: '/division-types', icon:'divisions', label:'Division Types', perm:null, group:'admin', roles:['owner','head_engineer'], tone:'#94a3b8' },
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

function Sidebar({ mobileOpen, setMobileOpen, theme, toggleTheme, onOpenTutorial }) {
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
        <div className="sidebar-brand-glow" />
        <h1><Logo size={160} /></h1>
        <span><i /> Control center · 2026</span>
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
                style={{ '--nav-tone': n.tone || '#38bdf8' }}
              >
                <span className="nav-icon"><AppIcon name={n.icon} /></span>
                <span className="nav-label">{n.label}</span>
                <span className="nav-arrow">›</span>
              </NavLink>
            )),
          ]);
        })()}
      </nav>

      {/* Notification bell for desktop */}
      <div className="sidebar-updates"><UpdatesLink /></div>
      <div className="sidebar-help">
        <button className="nav-link tutorial-nav" onClick={onOpenTutorial}>
          <span className="nav-icon"><AppIcon name="help" /></span>
          <span className="nav-label">Help & Tutorial</span>
          <span className="nav-arrow">›</span>
        </button>
      </div>
      <div className="sidebar-notifications">
        <NotificationBell />
      </div>

      {/* Theme toggle */}
      <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        <span className="toggle-icon">{theme === 'dark' ? '☼' : '◐'}</span>
        <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        <i className="theme-switch"><b /></i>
      </button>

      {/* Worker info at bottom */}
      {worker && (
        <div className="sidebar-profile">
          <div className="sidebar-user">
            <span className="sidebar-avatar" style={{ '--role-tone': ROLE_COLORS[worker.role] }}><AppIcon name={worker.role} /></span>
            <div className="sidebar-user-copy">
              <div className="sidebar-user-name">{worker.name}</div>
              <div className="sidebar-user-role" style={{ color: ROLE_COLORS[worker.role] }}>
                {worker.role}
              </div>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleLogout}
          >
            <span>↪</span> Sign Out
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
  const [tutorialRequest, setTutorialRequest] = useState(0);

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
      {worker && <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} theme={theme} toggleTheme={toggleTheme} onOpenTutorial={() => { setMobileOpen(false); setTutorialRequest(v => v + 1); }} />}
      {worker && <RoleTutorial worker={worker} openRequest={tutorialRequest} onCloseRequest={() => {}} />}

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
              <Route path="/analytics" element={<AnimatedPage><ProtectedRoute perm="analytics" roles={['owner','head_engineer']}><AnalyticsPage /></ProtectedRoute></AnimatedPage>} />
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
