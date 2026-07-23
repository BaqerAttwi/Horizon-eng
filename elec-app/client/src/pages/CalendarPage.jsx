import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api/client';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function CalendarPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(new Date());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  useEffect(() => {
    api.get('/projects')
      .then(r => {
        const withDeadlines = (r.data || []).filter(p => p.deadline && p.status !== 'completed' && p.status !== 'cancelled');
        setProjects(withDeadlines);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else { setViewMonth(m => m - 1); } };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else { setViewMonth(m => m + 1); } };

  const getDeadlinesForDay = (day) => {
    const date = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return projects.filter(p => p.deadline && p.deadline.startsWith(date));
  };

  const isToday = (day) => {
    return today.getDate() === day && today.getMonth() === viewMonth && today.getFullYear() === viewYear;
  };

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📅 Calendar</div>
          <div className="page-subtitle">Project deadlines overview</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={prevMonth}>← {MONTHS[viewMonth === 0 ? 11 : viewMonth - 1]}</button>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)' }}>{MONTHS[viewMonth]} {viewYear}</h3>
          <button className="btn btn-secondary btn-sm" onClick={nextMonth}>{MONTHS[viewMonth === 11 ? 0 : viewMonth + 1]} →</button>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2,
          background: 'var(--border)', borderRadius: 6, overflow: 'hidden',
        }}>
          {WEEKDAYS.map(d => (
            <div key={d} style={{
              background: 'var(--panel)', padding: '8px 4px', textAlign: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
            }}>{d}</div>
          ))}
          {days.map((day, i) => (
            <div key={i} style={{
              background: 'var(--bg)', minHeight: 90, padding: 6,
              border: isToday(day) ? '2px solid var(--accent)' : 'none',
              position: 'relative',
            }}>
              {day && (
                <>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: isToday(day) ? 'var(--accent)' : 'var(--text)',
                    marginBottom: 4,
                  }}>{day}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {getDeadlinesForDay(day).slice(0, 3).map(p => (
                      <Link key={p.id} to={`/projects/${p.id}/crm`} target="_blank" rel="noopener noreferrer"
                        style={{
                          fontSize: 10, padding: '2px 4px', borderRadius: 3,
                          background: 'rgba(26,95,168,0.12)', color: 'var(--accent)',
                          textDecoration: 'none', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                        {p.project_name}
                      </Link>
                    ))}
                    {getDeadlinesForDay(day).length > 3 && (
                      <div style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center' }}>
                        +{getDeadlinesForDay(day).length - 3} more
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>📋 Upcoming Deadlines</h3>
          {projects.filter(p => p.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 20).map(p => (
            <Link key={p.id} to={`/projects/${p.id}/crm`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
              }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{p.project_name}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {new Date(p.deadline).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
          {!projects.filter(p => p.deadline).length && (
            <div className="empty"><p>No upcoming deadlines</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
