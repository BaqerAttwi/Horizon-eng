import { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage       from './pages/LoginPage';
import ProductsPage    from './pages/ProductsPage';
import UploadPage      from './pages/UploadPage';
import ProjectsPage    from './pages/ProjectsPage';
import CrmProjectPage  from './pages/CrmProjectPage';
import WorkersPage     from './pages/WorkersPage';
import ClientsPage     from './pages/ClientsPage';
import ReservationsPage from './pages/ReservationsPage';
import DiscountsPage   from './pages/DiscountsPage';
import Logo            from './components/Logo';

// Role badge colors
const ROLE_COLORS = { owner:'#a78bfa', accounting:'#60a5fa', engineer:'#4ade80', secretary:'#fbbf24' };
const ROLE_ICONS  = { owner:'👑', accounting:'💼', engineer:'⚙️', secretary:'📋' };

// Nav items with permission check
const NAV = [
  { to: '/products',     icon: '📦', label: 'Products',       perm: 'products' },
  { to: '/reservations', icon: '📊', label: 'Demand Tracker',  perm: 'reservations' },
  { to: '/upload',       icon: '⬆️', label: 'Import Excel',    perm: 'upload' },
  { to: '/projects',     icon: '🔧', label: 'Projects',       perm: 'projects' },
  { to: '/discounts',    icon: '🏷️', label: 'Brand Discounts', perm: 'discounts' },
  { to: '/workers',      icon: '👷', label: 'Workers',        perm: 'workers' },
  { to: '/clients',      icon: '🏢', label: 'Clients',        perm: 'clients' },
];

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

function Sidebar({ mobileOpen, setMobileOpen }) {
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
        <h1><Logo size={32} /></h1>
        <span>Manager v2.0</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.filter(n => !n.perm || can(n.perm)).map(n => (
          <NavLink
            key={n.to} to={n.to}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>

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
  const { worker } = useAuth();

  return (
    <div className="layout">
      {worker && <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />}
      {mobileOpen && <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:199 }} onClick={() => setMobileOpen(false)} />}

      <main className="main">
        {worker && (
          <div className="mobile-header">
            <button className="btn-icon" onClick={() => setMobileOpen(true)}>☰</button>
            <span style={{ fontWeight: 800, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Logo size={24} /></span>
          </div>
        )}

        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/"          element={<Navigate to="/products" replace />} />
          <Route path="/products"  element={<ProtectedRoute perm="products"><ProductsPage /></ProtectedRoute>} />
          <Route path="/reservations" element={<ProtectedRoute perm="reservations"><ReservationsPage /></ProtectedRoute>} />
          <Route path="/upload"    element={<ProtectedRoute perm="upload"><UploadPage /></ProtectedRoute>} />
          <Route path="/projects"  element={<ProtectedRoute perm="projects"><ProjectsPage /></ProtectedRoute>} />
          <Route path="/projects/:id/crm" element={<ProtectedRoute perm="projects"><CrmProjectPage /></ProtectedRoute>} />
          <Route path="/discounts"  element={<ProtectedRoute perm="discounts"><DiscountsPage /></ProtectedRoute>} />
          <Route path="/workers"   element={<ProtectedRoute perm="workers"><WorkersPage /></ProtectedRoute>} />
          <Route path="/clients"   element={<ProtectedRoute perm="clients"><ClientsPage /></ProtectedRoute>} />
          <Route path="*"          element={<Navigate to="/products" replace />} />
        </Routes>
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
