const number = value => Number(value) || 0;
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export default function DashboardCharts({ kpis, showFinancials }) {
  const total = number(kpis.total_projects);
  const segments = [
    { label: 'Active', value: number(kpis.active_projects), color: '#3979df' },
    { label: 'Completed', value: number(kpis.completed_projects), color: '#159c87' },
    { label: 'Other', value: Math.max(0, total - number(kpis.active_projects) - number(kpis.completed_projects)), color: '#a3b1c6' },
  ];
  let offset = 0;
  const revenue = number(kpis.total_revenue);
  const profit = number(kpis.total_profit);
  const financials = [
    { label: 'Revenue', value: revenue, color: '#3979df' },
    { label: 'Cost', value: revenue - profit, color: '#a3b1c6' },
    { label: 'Net profit', value: profit, color: profit < 0 ? '#e15b64' : '#159c87' },
  ];
  const scale = Math.max(...financials.map(item => Math.abs(item.value)), 1);
  const completedPercent = total ? Math.round(number(kpis.completed_projects) / total * 100) : 0;
  return <div className="dashboard-charts">
    <section className="insight-card">
      <div className="insight-heading"><div><h3>Project overview</h3><p>Current portfolio by status</p></div><span className="insight-badge">{total} projects</span></div>
      <div className="portfolio-chart">
        <div className="donut-wrap">
          <svg viewBox="0 0 200 200" role="img" aria-label={`Project status: ${segments.map(s => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`}>
            <circle cx="100" cy="100" r="76" fill="none" stroke="var(--border)" strokeWidth="22" />
            {segments.map(segment => {
              const length = total ? segment.value / total * 100 : 0;
              const start = offset; offset += length;
              return <circle key={segment.label} cx="100" cy="100" r="76" fill="none" stroke={segment.color} strokeWidth="22" pathLength="100" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} transform="rotate(-90 100 100)"><title>{segment.label}: {segment.value}</title></circle>;
            })}
          </svg>
          <div className="donut-label"><strong>{completedPercent}%</strong><span>completed</span></div>
        </div>
        <div className="chart-legend">{segments.map(segment => <div key={segment.label}><i style={{ background: segment.color }} /><span>{segment.label}</span><strong>{segment.value}</strong></div>)}</div>
      </div>
      {!total && <p className="chart-note">Your project chart will appear when projects are added.</p>}
    </section>
    <section className="insight-card">
      <div className="insight-heading"><div><h3>{showFinancials ? 'Financial snapshot' : 'Project completion'}</h3><p>{showFinancials ? 'Approved projects · all time · USD' : 'Completed projects across your portfolio'}</p></div><span className="insight-badge">Live totals</span></div>
      {showFinancials ? <div className="financial-chart">{financials.map(item => <div className="financial-row" key={item.label}>
        <div><span>{item.label}</span><strong>{money(item.value)}</strong></div>
        <div className="financial-track"><div style={{ width: `${Math.abs(item.value) / scale * 100}%`, background: item.color }} /></div>
      </div>)}</div> : <div className="completion-insight"><strong>{completedPercent}%</strong><div className="financial-track"><div style={{ width: `${completedPercent}%`, background: '#159c87' }} /></div><p>{number(kpis.completed_projects)} of {total} projects completed</p></div>}
      <p className="chart-note">{showFinancials ? 'Cost = revenue − net profit. Bars compare amounts; negative profit indicates a loss.' : 'Keep your project statuses updated to track progress.'}</p>
    </section>
  </div>;
}
