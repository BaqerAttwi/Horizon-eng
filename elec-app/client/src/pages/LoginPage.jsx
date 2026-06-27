import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

const ROLE_COLORS = {
  owner:      '#a78bfa',
  accounting: '#60a5fa',
  engineer:   '#4ade80',
  secretary:  '#fbbf24',
};

export default function LoginPage() {
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { toast.error('Enter email and password'); return; }
    setLoading(true);
    try {
      const worker = await login(email.trim(), password);
      toast.success(`✅ Welcome, ${worker.name}!`);
      navigate('/products');
    } catch (err) {
      toast.error('❌ ' + err.message);
      console.error('[Login] Failed:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
  };
  const childVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
        backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(26,95,168,0.1) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(74,143,196,0.06) 0%, transparent 50%)',
      }}
    >
      <motion.div variants={childVariants} style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>

        {/* Logo */}
        <motion.div variants={childVariants} style={{ textAlign: 'center', marginBottom: 32, paddingTop: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--white)', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Logo size={280} style={{ filter: 'drop-shadow(0 0 30px rgba(26,95,168,0.4))' }} /></h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            Manager — Sign in to continue
          </p>
        </motion.div>

        {/* Login Card */}
        <motion.div variants={childVariants}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <form onSubmit={handleLogin} style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPass(e.target.value)}
                />
              </div>
              <motion.button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '11px', marginTop: 4 }}
                disabled={loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? <><span className="spinner" /> Signing in...</> : '🔑 Sign In'}
              </motion.button>
            </form>

            <div style={{ borderTop: '1px solid var(--border)', padding: '14px 28px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Role Access Levels
              </div>
              {[
                { role: 'owner',      icon: '👑', access: 'Full access — all features' },
                { role: 'accounting', icon: '💼', access: 'Products, projects, clients, reports' },
                { role: 'engineer',   icon: '⚙️', access: 'Products, projects, reservations' },
                { role: 'secretary',  icon: '📋', access: 'Products, clients, reservations' },
              ].map(r => (
                <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 13 }}>{r.icon}</span>
                  <span style={{ fontSize: 10, color: ROLE_COLORS[r.role], fontWeight: 700, width: 75, fontFamily: 'var(--font-mono)' }}>
                    {r.role}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{r.access}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.p variants={childVariants} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11, marginTop: 16, fontFamily: 'var(--font-mono)' }}>
          Contact the owner to get your account
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
