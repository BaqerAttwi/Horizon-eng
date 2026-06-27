import { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AnimatedPage }   from './components/AnimatedPage';
import LoginPage       from './pages/LoginPage';
import ProductsPage    from './pages/ProductsPage';
import UploadPage      from './pages/UploadPage';
import ProjectsPage    from './pages/ProjectsPage';
import CrmProjectPage  from './pages/CrmProjectPage';
import WorkersPage     from './pages/WorkersPage';
import ClientsPage     from './pages/ClientsPage';
import ReservationsPage from './pages/ReservationsPage';
import DiscountsPage   from './pages/DiscountsPage';
import RequestsPage    from './pages/RequestsPage';
import AnalyticsPage   from './pages/AnalyticsPage';
import DashboardPage   from './pages/DashboardPage';
import NotificationsPage from './pages/NotificationsPage';
import PriceChangesPage from './pages/PriceChangesPage';
import GroupsPage from './pages/GroupsPage';
import MessagesPage from './pages/MessagesPage';
import CalendarPage from './pages/CalendarPage';
import NotificationBell from './components/NotificationBell';
import Logo            from './components/Logo';

// Role badge colors
const ROLE_COLORS = { owner:'#a78bfa', accounting:'#60a5fa', engineer:'#4ade80', secretary:'#fbbf24' };
const ROLE_ICONS  = { owner:'👑', accounting:'💼', engineer:'⚙️', secretary:'📋' };

// Nav items with permission check
const NAV = [
  { to: '/dashboard',   icon: '🏠', label: 'Dashboard',      perm: null,       group: 'main' },
  { to: '/calendar',     icon: '📅', label: 'Calendar',       perm: null,       group: 'main' },
  { to: '/projects',     icon: '🔧', label: 'Projects',       perm: 'projects', group: 'main' },
  { to: '/products',     icon: '📦', label: 'Products',       perm: 'products', group: 'crm' },
  { to: '/reservations', icon: '📊', label: 'Demand Tracker',  perm: 'reservations', group: 'crm' },
  { to: '/price-changes', icon: '💰', label: 'Price Changes',  perm: 'price-changes', group: 'crm' },
  { to: '/groups',       icon: '📋', label: 'Item Groups',     perm: 'item-groups',   group: 'crm' },
  { to: '/messages',     icon: '📢', label: 'Announcements', perm: 'messages',       group: 'crm' },
  { to: '/requests',     icon: '🤝', label: 'Requests',       perm: 'requests', group: 'admin' },
  { to: '/upload',       icon: '⬆️', label: 'Import Excel',    perm: 'upload',   group: 'admin' },
  { to: '/discounts',    icon: '🏷️', label: 'Brand Discounts', perm: 'discounts', group: 'admin' },
  { to: '/analytics',    icon: '📈', label: 'Analytics',      perm: 'analytics', group: 'admin' },
  { to: '/workers',      icon: '👷', label: 'Workers',        perm: 'workers',  group: 'admin' },
  { to: '/clients',      icon: '🏢', label: 'Clients',        perm: 'clients',  group: 'admin' },
];

const GROUP_LABELS = {
  main: 'General',
  crm: 'CRM & Products',
  admin: 'Administration',
};

// Protected route wrapper
function ProtectedRoute({ children, perm }) {
  const { worker, loading, can } = useAuth();
  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh' }}><span className="spinner"/></div>;
  if (!worker)  return <Navigate to="/login" replace />;
  if (perm && !can(perm)) return (
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
  const { worker, logout, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('👋 Logged out');
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <h1><Logo size={48} /></h1>
        <span>Manager v2.0</span>
      </div>

      <nav className="sidebar-nav">
        {(() => {
          const visible = NAV.filter(n => !n.perm || can(n.perm));
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
            <span style={{ fontWeight: 800, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Logo size={32} showText={false} /></span>
            <div style={{ flex: 1 }} />
        <NotificationBell />
          </div>
        )}

        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/login" element={<AnimatedPage><LoginPage /></AnimatedPage>} />
            <Route path="/"          element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<AnimatedPage><ProtectedRoute><DashboardPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/calendar"  element={<AnimatedPage><ProtectedRoute><CalendarPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/products"  element={<AnimatedPage><ProtectedRoute perm="products"><ProductsPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/reservations" element={<AnimatedPage><ProtectedRoute perm="reservations"><ReservationsPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/upload"    element={<AnimatedPage><ProtectedRoute perm="upload"><UploadPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/projects"  element={<AnimatedPage><ProtectedRoute perm="projects"><ProjectsPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/projects/:id/crm" element={<AnimatedPage><ProtectedRoute perm="projects"><CrmProjectPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/requests"  element={<AnimatedPage><ProtectedRoute perm="requests"><RequestsPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/price-changes" element={<AnimatedPage><ProtectedRoute perm="price-changes"><PriceChangesPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/groups" element={<AnimatedPage><ProtectedRoute perm="item-groups"><GroupsPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/messages" element={<AnimatedPage><ProtectedRoute perm="messages"><MessagesPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/discounts"  element={<AnimatedPage><ProtectedRoute perm="discounts"><DiscountsPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/workers"   element={<AnimatedPage><ProtectedRoute perm="workers"><WorkersPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/clients"   element={<AnimatedPage><ProtectedRoute perm="clients"><ClientsPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/analytics" element={<AnimatedPage><ProtectedRoute perm="analytics"><AnalyticsPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="/notifications" element={<AnimatedPage><ProtectedRoute><NotificationsPage /></ProtectedRoute></AnimatedPage>} />
            <Route path="*"          element={<Navigate to="/dashboard" replace />} />
          </Routes>
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
