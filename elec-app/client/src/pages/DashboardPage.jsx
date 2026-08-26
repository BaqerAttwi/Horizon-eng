import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { FadeIn } from '../components/AnimatedPage';

const STATUS_COLORS = {
  completed: 'var(--success)',
  active: 'var(--accent)',
  draft: 'var(--muted)',
};

function KpiCard({ icon, label, value, sub, color, delay }) {
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1, duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -2 }}
      style={{ borderTop: `3px solid ${color || 'var(--accent)'}` }}
    >
      <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
      <div className="stat-value" style={{ fontSize: 20 }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </motion.div>
  );
}

function ActivityItem({ item }) {
  const icons = {
    project_created: '🔧',
    panel_completed: '✅',
    status_changed: '🔄',
  };
  return (
    <Link to={item.link} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '8px 0', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{icons[item.action] || '📌'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {item.actor} · {new Date(item.ts).toLocaleDateString()}
          </div>
        </div>
      </div>
    </Link>
  );
}

function DeadlineItem({ d }) {
  const urgent = d.days_left <= 1;
  const warning = d.days_left <= 3;
  return (
    <Link to={`/projects/${d.id}/crm`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center',
        padding: '8px 0', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: urgent ? 'rgba(239,68,68,0.15)' : warning ? 'rgba(245,158,11,0.15)' : 'rgba(26,95,168,0.1)',
          color: urgent ? 'var(--danger)' : warning ? 'var(--accent2)' : 'var(--accent)',
          fontFamily: 'var(--font-mono)',
        }}>
          {d.days_left}d
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.project_name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {d.engineer_name} · {d.client_name || 'No client'}
          </div>
        </div>
      </div>
    </Link>
  );
}

function StockAlert({ item }) {
  const outOfStock = item.stock_qty === 0;
  return (
    <Link to="/products" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center',
        padding: '8px 0', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: outOfStock ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
          color: outOfStock ? 'var(--danger)' : 'var(--accent2)',
          fontFamily: 'var(--font-mono)',
        }}>
          {item.stock_qty}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.reference}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {item.description || 'No description'}
          </div>
        </div>
      </div>
    </Link>
  );
}

function EngineerSummaryRow({ e }) {
  const profit = parseFloat(e.total_profit);
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)' }}>{e.name}{Number(e.active_projects)>5 && <span style={{color:'var(--danger)',marginLeft:6}}>⚠ overloaded</span>}</span>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{e.active_projects || 0} active • {Number(e.avg_progress||0).toFixed(0)}% • {e.overdue_projects || 0} overdue</span>
        <span className="mono" style={{ fontSize: 11, color: profit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
          ${profit.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'overview',    label: '📊 Overview',   roles: ['owner','head_engineer','accounting','engineer'] },
  { key: 'performance', label: '👷 Performance', roles: ['owner','head_engineer'] },
  { key: 'stock',       label: '📦 Stock',      roles: ['owner','accounting'] },
];

export default function DashboardPage() {
  const { isRole } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    api.get('/dashboard')
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="empty"><span className="spinner" style={{ width: 32, height: 32 }} /></div></div>;

  const kpis = data?.kpis || {};
  const profit = parseFloat(kpis.total_profit || 0);
  const profitColor = profit >= 0 ? 'var(--success)' : 'var(--danger)';

  const visibleTabs = TABS.filter(t => t.roles.some(r => isRole(r)));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🏠 Dashboard</div>
          <div className="page-subtitle">Welcome back — here's what's happening</div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0, flexWrap: 'wrap', overflowX: 'auto' }}>
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            background: 'none', border: 'none', color: tab === t.key ? 'var(--accent)' : 'var(--muted)',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all 0.15s', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* KPI Cards — shown on every tab */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <KpiCard icon="🔧" label="Total Projects" value={kpis.total_projects || 0}
          sub={`${kpis.active_projects || 0} active`} color="var(--accent)" delay={0} />
        <KpiCard icon="✅" label="Completed" value={kpis.completed_projects || 0}
          color="var(--success)" delay={1} />
        {!(isRole('engineer') || isRole('secretary')) && <KpiCard icon="💰" label="Total Revenue" value={`$${parseFloat(kpis.total_revenue || 0).toFixed(0)}`}
          color="var(--primary)" delay={2} />}
        {!isRole('engineer') && <KpiCard icon="📈" label="Net Profit" value={`$${profit.toFixed(0)}`}
          sub={profit >= 0 ? 'Positive' : 'Negative'} color={profitColor} delay={3} />}
        <KpiCard icon="⏳" label="Pending Approvals" value={kpis.pending_approvals || 0}
          sub={kpis.pending_approvals > 0 ? 'Needs attention' : 'All clear'}
          color={kpis.pending_approvals > 0 ? 'var(--danger)' : 'var(--success)'} delay={4} />
      </div>

      {/* ── Overview Tab ───────────────────────────────── ─*/}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <FadeIn>
            <div className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>📅 Upcoming Deadlines</h3>
                  <Link to="/projects" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>View all →</Link>
                </div>
                {(data?.deadlines ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No upcoming deadlines 🎉</div>
                ) : (
                  (data?.deadlines ?? []).map(d => <DeadlineItem key={d.id} d={d} />)
                )}
              </div>
            </div>
          </FadeIn>
          <FadeIn>
            <div className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>🕐 Recent Activity</h3>
                </div>
                {(data?.activity ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No recent activity</div>
                ) : (
                  (data?.activity ?? []).map((a, i) => <ActivityItem key={i} item={a} />)
                )}
              </div>
            </div>
          </FadeIn>
        </div>
      )}

      {/* ── Performance Tab (owner only) ────────────────── */}
      {tab === 'performance' && isRole('owner','head_engineer') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <FadeIn>
            <div className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>👷 Engineer Performance</h3>
                  <Link to="/analytics" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>Full report →</Link>
                </div>
                {(data?.engineer_summary ?? []).map(e => <EngineerSummaryRow key={e.id} e={e} />)}
              </div>
            </div>
          </FadeIn>
        </div>
      )}

      {/* ── Stock Tab (owner/accounting) ────────────────── */}
      {tab === 'stock' && !isRole('engineer') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <FadeIn>
            <div className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)' }}>⚠️ Low Stock Alerts</h3>
                  <Link to="/products" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>Manage →</Link>
                </div>
                {(data?.low_stock ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>All stocked up ✅</div>
                ) : (
                  (data?.low_stock ?? []).map(s => <StockAlert key={s.id} item={s} />)
                )}
              </div>
            </div>
          </FadeIn>
        </div>
      )}

      {/* My Projects (shown for engineers at the bottom of overview) */}
      {data?.my_projects?.length > 0 && tab === 'overview' && (
        <div style={{ marginTop: 16 }}>
          <FadeIn>
            <div className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>🔧 My Projects</h3>
                  <Link to="/projects" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>View all →</Link>
                </div>
                {data?.my_projects?.map(p => (
                  <Link key={p.id} to={`/projects/${p.id}/crm`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--white)' }}>{p.project_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.client_name || 'No client'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {p.completed_panels}/{p.panel_count}
                        </span>
                        <span className="badge" style={{
                          background: `${STATUS_COLORS[p.status] || 'var(--muted)'}22`,
                          color: STATUS_COLORS[p.status] || 'var(--muted)',
                        }}>{p.status}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      )}
    </div>
  );
}
