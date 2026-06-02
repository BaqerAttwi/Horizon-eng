import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/client';
import { FadeIn, StaggerContainer, StaggerItem } from '../components/AnimatedPage';

const STATUS_COLORS = { completed: 'var(--success)', active: 'var(--accent)', draft: 'var(--muted)' };

const DATE_PRESETS = [
  { label: 'All Time', from: '', to: '' },
  { label: 'This Month', from: 'month', to: '' },
  { label: 'Last 3 Months', from: '3months', to: '' },
  { label: 'This Year', from: 'year', to: '' },
];

function getDateRange(preset) {
  if (!preset || preset === 'All Time') return { from: '', to: '' };
  const now = new Date();
  let from = new Date();
  if (preset === 'month') from.setMonth(now.getMonth());
  else if (preset === '3months') from.setMonth(now.getMonth() - 3);
  else if (preset === 'year') from.setFullYear(now.getFullYear(), 0, 1);
  return { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
}

function SummaryCard({ label, value, sub, color, icon }) {
  return (
    <motion.div className="stat-card" whileHover={{ scale: 1.02 }}
      style={{ borderTop: `3px solid ${color || 'var(--accent)'}` }}>
      <div style={{ fontSize: 28, marginBottom: 4 }}>{icon}</div>
      <div className="stat-value" style={{ fontSize: 22 }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </motion.div>
  );
}

function EngineerRow({ e }) {
  const profit = parseFloat(e.total_profit);
  const profitColor = profit >= 0 ? 'var(--success)' : 'var(--danger)';
  const completionRate = e.total_projects > 0 ? Math.round((e.completed_projects / e.total_projects) * 100) : 0;
  return (
    <tr>
      <td style={{ fontWeight: 700, color: 'var(--white)' }}>{e.name}</td>
      <td className="mono">{e.email || '—'}</td>
      <td className="mono" style={{ fontWeight: 700 }}>{e.total_projects}</td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontWeight: 700, color: STATUS_COLORS.completed }}>{e.completed_projects}</span>
          <div style={{ width: 50, height: 4, background: 'var(--panel2)', borderRadius: 2 }}>
            <div style={{ width: `${completionRate}%`, height: '100%', background: 'var(--success)', borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{completionRate}%</span>
        </div>
      </td>
      <td className="mono" style={{ color: STATUS_COLORS.active }}>{e.active_projects}</td>
      <td className="mono" style={{ fontWeight: 700, color: profitColor }}>${profit.toFixed(0)}</td>
      <td className="mono" style={{ color: profitColor }}>${parseFloat(e.avg_profit_per_project).toFixed(0)}</td>
      <td className="mono">{e.collaborated_on || 0}</td>
    </tr>
  );
}

function ClientRow({ c }) {
  const profit = parseFloat(c.total_profit);
  const profitColor = profit >= 0 ? 'var(--success)' : 'var(--danger)';
  return (
    <tr>
      <td style={{ fontWeight: 700, color: 'var(--white)' }}>{c.name}</td>
      <td><span className={`badge ${c.type === 'company' ? 'badge-blue' : 'badge-purple'}`}>{c.type}</span></td>
      <td className="mono" style={{ fontWeight: 700 }}>{c.total_projects}</td>
      <td className="mono" style={{ color: STATUS_COLORS.completed }}>{c.completed_projects}</td>
      <td className="mono" style={{ fontWeight: 700 }}>${parseFloat(c.total_revenue).toFixed(0)}</td>
      <td className="mono" style={{ fontWeight: 700, color: profitColor }}>${profit.toFixed(0)}</td>
      <td className="mono" style={{ color: profitColor }}>${parseFloat(c.avg_profit_per_project).toFixed(0)}</td>
      <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.engineers_involved || '—'}
      </td>
    </tr>
  );
}

// Simple bar chart component (CSS-only, no library needed)
function BarChart({ data, valueKey, labelKey, color, maxHeight = 150 }) {
  if (!data || data.length === 0) return <div className="empty" style={{ padding: 20 }}>No data</div>;
  const maxVal = Math.max(...data.map(d => parseFloat(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: maxHeight, padding: '8px 0' }}>
      {data.map((d, i) => {
        const val = parseFloat(d[valueKey]) || 0;
        const pct = (val / maxVal) * 100;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span className="mono" style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>
              ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
            </span>
            <div style={{
              width: '100%', maxWidth: 40, height: `${Math.max(pct, 2)}%`,
              background: color || 'var(--accent)', borderRadius: '4px 4px 0 0',
              minHeight: 4, transition: 'height 0.3s',
            }} />
            <span style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.1, maxHeight: 24, overflow: 'hidden' }}>
              {d[labelKey]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Line chart using SVG
function LineChart({ data, xKey, yKey, color, label, maxHeight = 150 }) {
  if (!data || data.length < 2) return <div className="empty" style={{ padding: 20 }}>Need at least 2 data points</div>;
  const values = data.map(d => parseFloat(d[yKey]) || 0);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;
  const w = 100;
  const h = maxHeight;
  const pad = 30;

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((parseFloat(d[yKey]) || 0) - minVal) / range * (h - pad * 2);
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${h - pad} L ${points[0].x} ${h - pad} Z`;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color || 'var(--accent)'} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color || 'var(--accent)'} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
          <line key={i} x1={pad} y1={h - pad - pct * (h - pad * 2)} x2={w - pad} y2={h - pad - pct * (h - pad * 2)}
            stroke="var(--border)" strokeWidth="0.3" strokeDasharray="2,2" />
        ))}
        {/* Area fill */}
        <path d={areaD} fill={`url(#grad-${label})`} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={color || 'var(--accent)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color || 'var(--accent)'} />
        ))}
      </svg>
      {/* X labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 0', fontSize: 9, color: 'var(--muted)' }}>
        {data.map((d, i) => (
          <span key={i} style={{ textAlign: 'center' }}>{d[xKey]}</span>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  const [engineers, setEngineers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('summary');
  const [datePreset, setDatePreset] = useState('All Time');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = () => {
    const { from, to } = getDateRange(datePreset);
    const params = new URLSearchParams();
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    const qs = params.toString();

    setLoading(true);
    Promise.all([
      api.get(`/analytics/summary?${qs}`),
      api.get(`/analytics/engineers?${qs}`),
      api.get(`/analytics/clients?${qs}`),
    ]).then(([s, e, c]) => {
      setSummary(s.data);
      setEngineers(e.data.engineers || []);
      setClients(c.data.clients || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [datePreset]);

  if (loading) return <div className="page"><div className="empty"><span className="spinner" style={{ width: 32, height: 32 }} /></div></div>;

  const totals = summary?.totals || {};
  const topEng = summary?.top_engineer;
  const topCli = summary?.top_client;
  const monthlyData = summary?.monthly_revenue || [];
  const engComparison = summary?.engineer_comparison || [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📊 Analytics Dashboard</div>
          <div className="page-subtitle">Owner overview — engineer performance, client profitability & project insights</div>
        </div>
        <a href="/api/export/analytics" className="btn btn-secondary" style={{ textDecoration: 'none' }}>📥 Export CSV</a>
      </div>

      {/* Date Filter */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Period:</span>
        {DATE_PRESETS.map(p => (
          <button key={p.label}
            className={`btn btn-sm ${datePreset === p.label ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setDatePreset(p.label)}>
            {p.label}
          </button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
          {dateFrom || 'All time'} {dateTo ? `→ ${dateTo}` : ''}
        </span>
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

      {/* Charts Row */}
      {tab === 'summary' && monthlyData.length > 0 && (
        <FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>📈 Monthly Revenue</h3>
                <LineChart data={monthlyData} xKey="month" yKey="revenue" color="var(--accent)" label="revenue" />
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>💰 Monthly Profit</h3>
                <LineChart data={monthlyData} xKey="month" yKey="profit" color="var(--success)" label="profit" />
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>👷 Engineer Profit Comparison</h3>
                <BarChart data={engComparison} valueKey="profit" labelKey="name" color="var(--accent)" />
              </div>
            </div>
          </div>
        </FadeIn>
      )}

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
                      <th>Engineer</th><th>Email</th><th>Total</th><th>Completed</th>
                      <th>Active</th><th>Total Profit</th><th>Avg Profit</th><th>Collabs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engineers.length === 0 ? (
                      <tr><td colSpan={8} className="empty" style={{ padding: 32 }}>No engineers found</td></tr>
                    ) : engineers.map(e => <EngineerRow key={e.id} e={e} />)}
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
                      <th>Client</th><th>Type</th><th>Total</th><th>Completed</th>
                      <th>Revenue</th><th>Profit</th><th>Avg Profit</th><th>Engineers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.length === 0 ? (
                      <tr><td colSpan={8} className="empty" style={{ padding: 32 }}>No clients found</td></tr>
                    ) : clients.map(c => <ClientRow key={c.id} c={c} />)}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>📈 Project Breakdown</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Completed', value: totals.completed_projects || 0, color: 'var(--success)' },
                    { label: 'Active', value: totals.active_projects || 0, color: 'var(--accent)' },
                    { label: 'Draft', value: totals.draft_projects || 0, color: 'var(--muted)' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.label}</span>
                      <span className="mono" style={{ fontWeight: 700, color: item.color }}>{item.value}</span>
                    </div>
                  ))}
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
