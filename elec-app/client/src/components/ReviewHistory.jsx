import { useEffect, useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function ReviewHistory({ projectId, reviewStatus, submitted }) {
  const { isRole } = useAuth();
  const [history, setHistory] = useState([]);
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const [reviews, deliveries] = await Promise.all([api.get(`/projects/${projectId}/review-history`), api.get(`/projects/${projectId}/email-deliveries`)]);
      setHistory(reviews.data); setEmails(deliveries.data); setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [projectId, reviewStatus, submitted]);
  return <section className="workflow-card" aria-label="Review and email history">
    <details><summary>Review history and email status</summary>
      {error && <p role="alert">Unable to load history: {error}</p>}
      {!history.length && !error && <p>No review events yet.</p>}
      {history.map(row => <div key={row.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
        <strong>{row.action.replaceAll('_', ' ')} · {row.status}</strong>
        <div>{row.reviewer_name || 'System'} · {new Date(row.created_at).toLocaleString()}</div>
        {row.note && <p style={{ whiteSpace: 'pre-wrap' }}>{row.note}</p>}
      </div>)}
      <h4>Email notifications</h4>
      <p>“Accepted” means the email provider accepted the message; inbox delivery is not confirmed.</p>
      {!emails.length && <p>No tracked emails yet.</p>}
      {emails.map(row => <div key={row.id} style={{ padding: '8px 0' }}>
        <strong>{row.subject}</strong> · {row.status} · {row.attempts} attempt(s)
        {row.last_error && <p role="status">{row.last_error}</p>}
        {row.status === 'failed' && isRole('owner','head_engineer') && <button className="btn btn-secondary btn-sm" onClick={async () => {
          try { await api.post(`/email-deliveries/${row.id}/retry`); await load(); toast.success('Email queued for retry'); } catch (e) { toast.error(e.message); }
        }}>Retry email</button>}
      </div>)}
    </details>
  </section>;
}
