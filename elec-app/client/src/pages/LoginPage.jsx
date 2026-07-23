import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import LoginBackground from '../components/LoginBackground';

const QUOTES = [
  '"Powering your world with precision engineering"',
  '"Intelligent electrical solutions for tomorrow"',
];

export default function LoginPage() {
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const { login } = useAuth();
  const navigate  = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setQuoteIdx(i => (i + 1) % QUOTES.length), 3500);
    return () => clearInterval(t);
  }, []);

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
        position: 'relative',
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', overflow: 'hidden',
      }}
    >
      <LoginBackground />
      <motion.div variants={childVariants} style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400, padding: '0 20px' }}>

        {/* Logo */}
        <motion.div variants={childVariants} style={{ textAlign: 'center', marginBottom: 32, paddingTop: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--white)', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Logo size={280} style={{ filter: 'drop-shadow(0 0 30px rgba(26,95,168,0.4))' }} /></h1>
          <p style={{ color: 'var(--accent)', fontSize: 16, fontWeight: 700, marginTop: 8, letterSpacing: 2 }}>
            Horizon LB
          </p>
          <div style={{ position: 'relative', height: 20, marginTop: 6 }}>
            <AnimatePresence mode="wait">
              <motion.p
                key={quoteIdx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.6 }}
                style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', color: 'var(--muted)', fontSize: 11, fontStyle: 'italic', fontFamily: 'var(--font-mono)' }}
              >
                {QUOTES[quoteIdx]}
              </motion.p>
            </AnimatePresence>
          </div>
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
          </div>
        </motion.div>

        <motion.p variants={childVariants} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11, marginTop: 16, fontFamily: 'var(--font-mono)' }}>
          Contact the owner to get your account
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
