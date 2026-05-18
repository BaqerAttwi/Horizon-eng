import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/client';
import { FadeIn, StaggerContainer, StaggerItem } from '../components/AnimatedPage';

const STATUS_COLORS = {
  completed: 'var(--success)',
  active: 'var(--accent)',
  draft: 'var(--muted)',
};

function SummaryCard({ label, value, sub, color, icon }) {
  return (
    <motion.div
      className="stat-card"
      whileHover={{ scale: 1.02 }}
      style={{ borderTop: `3px solid ${color || 'var(--accent)'}` }}
    >
      <div style={{ fontSize: 28, marginBottom: 4 }}>{icon}</div>
      <div className="stat-value" style={{ fontSize: 22 }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </motion.div>
  );
}

function EngineerRow({ e, idx }) {
  const profit = parseFloat(e.total_profit);
  const profitColor = profit >= 0 ? 'var(--success)' : 'var(--danger)';
  const completionRate = e.total_projects > 0
    ? Math.round((e.completed_projects / e.total_projects) * 100)
    : 0;

  return (
    <tr>
      <td style={{ fontWeight: 700, color: 'var(--white)' }}>{e.name}</td>
      <td className="mono">{e.email || '—'}</td>
      <td className="mono" style={{ fontWeight: 700 }}>{e.total_projects}</td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontWeight: 700, color: STATUS_COLORS.completed }}>{e.completed_projects}</span>
          <div style={{ width: 60, height: 4, background: 'var(--panel2)', borderRadius: 2 }}>
            <div style={{ width: `${completionRate}%`, height: '100%', background: 'var(--success)', borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{completionRate}%</span>
        </div>
      </td>
      <td className="mono" style={{ color: STATUS_COLORS.active }}>{e.active_projects}</td>
      <td className="mono" style={{ fontWeight: 700, color: profitColor }}>
        ${profit.toFixed(0)}
      </td>
      <td className="mono" style={{ color: profitColor }}>
        ${parseFloat(e.avg_profit_per_project).toFixed(0)}
      </td>
      <td className="mono">{e.collaborated_on || 0}</td>
    </tr>
  );
}

function ClientRow({ c, idx }) {
  const profit = parseFloat(c.total_profit);
  const profitColor = profit >= 0 ? 'var(--success)' : 'var(--danger)';

  return (
    <tr>
      <td style={{ fontWeight: 700, color: 'var(--white)' }}>{c.name}</td>
      <td><span className={`badge ${c.type === 'company' ? 'badge-blue' : 'badge-purple'}`}>{c.type}</span></td>
      <td className="mono" style={{ fontWeight: 700 }}>{c.total_projects}</td>
      <td className="mono" style={{ color: STATUS_COLORS.completed }}>{c.completed_projects}</td>
      <td className="mono" style={{ fontWeight: 700 }}>${parseFloat(c.total_revenue).toFixed(0)}</td>
      <td className="mono" style={{ fontWeight: 700, color: profitColor }}>
        ${profit.toFixed(0)}
      </td>
      <td className="mono" style={{ color: profitColor }}>
        ${parseFloat(c.avg_profit_per_project).toFixed(0)}
      </td>
      <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.engineers_involved || '—'}
      </td>
    </tr>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  const [engineers, setEngineers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('summary');

  useEffect(() => {
    Promise.all([
      api.get('/analytics/summary'),
      api.get('/analytics/engineers'),
      api.get('/analytics/clients'),
    ]).then(([s, e, c]) => {
      setSummary(s.data);
      setEngineers(e.data.engineers || []);
      setClients(c.data.clients || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="empty"><span className="spinner" style={{ width: 32, height: 32 }} /></div></div>;

  const totals = summary?.totals || {};
  const topEng = summary?.top_engineer;
  const topCli = summary?.top_client;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📊 Analytics Dashboard</div>
          <div className="page-subtitle">Owner overview — engineer performance, client profitability & project insights</div>
        </div>
      </div>

      {/* Summary Cards */}
      <StaggerContainer>
        <StaggerItem>
          <div className="stats-row" style={{ marginBottom: 24 }}>
            <SummaryCard icon="🔧" label="Total Projects" value={totals.total_projects || 0}
              sub={`${totals.completed_projects || 0} completed`} color="var(--accent)" />
            <SummaryCard icon="💰" label="Total Revenue" value={`$${parseFloat(totals.total_revenue || 0).toFixed(0)}`}
              color="var(--primary)" />
            <SummaryCard icon="📈" label="Total Profit" value={`$${parseFloat(totals.total_profit || 0).toFixed(0)}`}
              sub={parseFloat(totals.total_profit) >= 0 ? 'Positive' : 'Negative'}
              color={parseFloat(totals.total_profit) >= 0 ? 'var(--success)' : 'var(--danger)'} />
            <SummaryCard icon="🏆" label="Top Engineer" value={topEng?.name || '—'}
              sub={topEng ? `$${parseFloat(topEng.profit).toFixed(0)} profit` : ''} color="var(--accent2)" />
            <SummaryCard icon="🏢" label="Top Client" value={topCli?.name || '—'}
              sub={topCli ? `$${parseFloat(topCli.profit).toFixed(0)} profit` : ''} color="var(--primary-light)" />
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Tabs */}
      <div className="tabs">
        <div className={`tab${tab === 'summary' ? ' active' : ''}`} onClick={() => setTab('summary')}>📊 Summary</div>
        <div className={`tab${tab === 'engineers' ? ' active' : ''}`} onClick={() => setTab('engineers')}>👷 Engineers</div>
        <div className={`tab${tab === 'clients' ? ' active' : ''}`} onClick={() => setTab('clients')}>🏢 Clients</div>
      </div>

      {/* Engineers Table */}
      {tab === 'engineers' && (
        <FadeIn>
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Engineer</th>
                      <th>Email</th>
                      <th>Total Projects</th>
                      <th>Completed</th>
                      <th>Active</th>
                      <th>Total Profit</th>
                      <th>Avg Profit/Project</th>
                      <th>Collaborations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engineers.length === 0 ? (
                      <tr><td colSpan={8} className="empty" style={{ padding: 32 }}>No engineers found</td></tr>
                    ) : (
                      engineers.map((e, i) => <EngineerRow key={e.id} e={e} idx={i} />)
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Clients Table */}
      {tab === 'clients' && (
        <FadeIn>
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Type</th>
                      <th>Total Projects</th>
                      <th>Completed</th>
                      <th>Total Revenue</th>
                      <th>Total Profit</th>
                      <th>Avg Profit/Project</th>
                      <th>Engineers Involved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.length === 0 ? (
                      <tr><td colSpan={8} className="empty" style={{ padding: 32 }}>No clients found</td></tr>
                    ) : (
                      clients.map((c, i) => <ClientRow key={c.id} c={c} idx={i} />)
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Summary Tab Content */}
      {tab === 'summary' && (
        <FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>📈 Project Breakdown</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Completed</span>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--success)' }}>{totals.completed_projects || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Active</span>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{totals.active_projects || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Draft</span>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--muted)' }}>{totals.draft_projects || 0}</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total Clients</span>
                    <span className="mono" style={{ fontWeight: 700 }}>{totals.total_clients || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total Engineers</span>
                    <span className="mono" style={{ fontWeight: 700 }}>{totals.total_engineers || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>💰 Financial Overview</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total Revenue</span>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--primary)' }}>${parseFloat(totals.total_revenue || 0).toFixed(0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total Cost</span>
                    <span className="mono" style={{ fontWeight: 700 }}>${parseFloat(totals.total_cost || 0).toFixed(0)}</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Net Profit</span>
                    <span className="mono" style={{ fontWeight: 700, color: parseFloat(totals.total_profit) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      ${parseFloat(totals.total_profit || 0).toFixed(0)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Profit Margin</span>
                    <span className="mono" style={{ fontWeight: 700, color: parseFloat(totals.total_profit) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {totals.total_revenue > 0 ? ((parseFloat(totals.total_profit) / parseFloat(totals.total_revenue)) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>🏆 Top Performers</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding: 10, background: 'rgba(26,95,168,0.06)', borderRadius: 8, border: '1px solid rgba(26,95,168,0.15)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Top Engineer by Profit</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{topEng?.name || 'N/A'}</div>
                    <div style={{ fontSize: 12, color: 'var(--success)' }}>${topEng ? parseFloat(topEng.profit).toFixed(0) : 0} profit</div>
                  </div>
                  <div style={{ padding: 10, background: 'rgba(74,143,196,0.06)', borderRadius: 8, border: '1px solid rgba(74,143,196,0.15)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Top Client by Profit</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>{topCli?.name || 'N/A'}</div>
                    <div style={{ fontSize: 12, color: 'var(--success)' }}>${topCli ? parseFloat(topCli.profit).toFixed(0) : 0} profit</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
