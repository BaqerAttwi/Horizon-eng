import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import './RoleAssistant.css';

export default function RoleAssistant({ worker }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ reply:`Hi ${worker.name}! Ready to get started? I can show your work today or help you with your ${worker.role.replaceAll('_',' ')} tools.`, suggestions:[] }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState();
  const request = useRef(null);
  const end = useRef(null);
  const field = useRef(null);
  const launcher = useRef(null);
  const navigate = useNavigate();
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (open) { field.current?.focus(); end.current?.scrollIntoView({ block:'nearest' }); } }, [open, messages, busy]);
  const close = () => { setOpen(false); launcher.current?.focus(); };
  const send = async (value = input) => {
    const message = value.trim();
    if (!message || busy || message.length > 1000) return;
    setBusy(true); setError(''); setInput('');
    setMessages(old => [...old.slice(-38), { user:message }]);
    const controller = new AbortController(); request.current = controller;
    try {
      const { data } = await api.post('/assistant/chat', { message, previousTopic:topic }, { signal:controller.signal, timeout:15000 });
      setMessages(old => [...old, data]); setTopic(data.topic);
    } catch (e) {
      if (!controller.signal.aborted) { setError(e.message || 'Unable to connect. Please try again.'); setInput(message); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const latest = [...messages].reverse().find(m => m.reply);
  const rolePrompts = {
    owner:['Show pending approvals','Show my requests','Show outstanding payments','Show stock shortages'],
    head_engineer:['Show pending approvals','Show my requests','Show outstanding payments','Show stock shortages'],
    engineer:['Show pending approvals','Show my requests','Show my projects'],
    accounting:['Show outstanding payments','Show my projects','Show clients'],
    stock_manager:['Show stock shortages','How do I approve procurement?'],
    secretary:['Show clients','How do I check deadlines?'],
    technician:['Show my assignments','How do I record testing?'],
  };
  const quickPrompts = ['What do I have today?', ...(rolePrompts[worker.role] || []), 'My role and tools', ...(topic ? ['What next?'] : [])];
  const suggestions = [...new Map([...quickPrompts.map(label => ({label})), ...(latest?.suggestions || [])].map(s => [s.label,s])).values()];
  return <div className="role-assistant">
    {open && <section className="assistant-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-title" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <header><img src="/assistant-avatar.png" alt="" /><div><strong id="assistant-title">Horizon Assistant</strong><small>Local help · {worker.role.replaceAll('_',' ')}</small></div><button type="button" onClick={close} aria-label="Close assistant">×</button></header>
      <p className="assistant-note">Live records and guidance for your role. Chats stay in memory and clear when you sign out.</p>
      <div className="assistant-history" role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((m,i) => <div key={i} className={`assistant-message ${m.user ? 'from-user' : ''}`}><span>{m.user || m.reply}</span>{m.links?.map(l => <button type="button" key={l.path} onClick={() => { navigate(l.path); close(); }}>Open {l.label} →</button>)}</div>)}
        {busy && <p>Checking your request…</p>}<div ref={end} />
      </div>
      <div className="assistant-quick-actions" aria-label="Suggested questions">
        <p>Choose what you need</p>
        <div className="assistant-suggestions">{suggestions.map(s => <button type="button" key={s.label} disabled={busy} onClick={() => send(s.label)}>{s.label}</button>)}</div>
      </div>
      {error && <p className="assistant-error" role="alert">{error}</p>}
      <form onSubmit={e => { e.preventDefault(); send(); }}><label className="assistant-input-label" htmlFor="assistant-input">Ask for help</label><textarea ref={field} id="assistant-input" value={input} maxLength={1000} rows={2} onChange={e => setInput(e.target.value)} placeholder="How do I…?" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} /><button type="submit" disabled={busy || !input.trim()}>Send</button></form>
      <button className="assistant-clear" type="button" disabled={busy} onClick={() => { setMessages([{ reply:`Hello ${worker.name}, how can I help you today?`, suggestions:[] }]); setTopic(undefined); setError(''); setInput(''); }}>Clear chat</button>
    </section>}
    <button ref={launcher} type="button" className="assistant-launcher" onClick={() => setOpen(v => !v)} aria-label={open ? 'Close role assistant' : 'Open role assistant'} aria-expanded={open}><img src="/assistant-avatar.png" alt="" /><span>Ask Horizon</span></button>
  </div>;
}
