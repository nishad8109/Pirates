import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateKeyPair, exportPublicKeyJWK } from '../crypto/keys.js';
import { saveKeyPair } from '../storage/indexedDB.js';
import { registerUser } from '../services/api.js';

export default function Register() {
  const [view, setView] = useState('home'); // 'home' | 'login'
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Intersection Observer for feature cards animation
  useEffect(() => {
    if (view === 'home') {
      const cards = document.querySelectorAll('.feature-card');
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
              entry.target.style.animationDelay = `${i * 0.1}s`;
              entry.target.style.animation = 'fadeInUp 0.6s ease forwards';
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2 }
      );
      cards.forEach((card) => observer.observe(card));
      return () => observer.disconnect();
    }
  }, [view]);

  const [authMode, setAuthMode] = useState('register'); // 'register' | 'login'
  const [password, setPassword] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    setError('');

    try {
      setStatus('Generating 4096-bit RSA key pair...');
      const keyPair = await generateKeyPair();

      setStatus('Exporting public key...');
      const publicKeyJWK = await exportPublicKeyJWK(keyPair.publicKey);

      setStatus('Storing private key securely...');
      await saveKeyPair(username, keyPair.publicKey, keyPair.privateKey);

      setStatus('Registering with server...');
      
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          password, 
          public_key: JSON.stringify(publicKeyJWK) 
        }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Registration failed');
      }

      setStatus('Registration complete! Redirecting...');
      setTimeout(() => navigate(`/chat?user=${username}`), 800);
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      if (!status.includes('Redirecting')) {
        setLoading(false);
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    setError('');
    setStatus('Verifying credentials...');

    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Invalid username or password');
      }

      // Important Zero-Knowledge Check: Ensure the private key is actually in this browser
      setStatus('Verifying local encryption keys...');
      const { getPrivateKey } = await import('../storage/indexedDB.js');
      const pk = await getPrivateKey(username);
      
      if (!pk) {
        throw new Error(`Login successful, but encryption keys for '${username}' are not present on this device. You can only log in from the device where you registered.`);
      }

      setStatus('Keys verified! Redirecting...');
      setTimeout(() => navigate(`/chat?user=${username}`), 800);
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      if (!status.includes('Redirecting')) {
        setLoading(false);
      }
    }
  };

  const scrollToFeatures = (e) => {
    e.preventDefault();
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <div id="page-home" className={`page homepage ${view === 'home' ? 'active' : ''}`}>
        {/* Navbar */}
        <nav className="navbar" id="navbar">
          <div className="navbar-brand">
            <div className="navbar-logo">
              <svg viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
              </svg>
            </div>
            <span className="navbar-name">VaultDrop</span>
          </div>

          <div className="navbar-links">
            <a href="#features" onClick={scrollToFeatures} className="navbar-link">
              Features
            </a>
            <button className="navbar-cta" onClick={() => setView('login')}>
              <span>Get Started</span>
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="hero">
          <div className="hero-bg">
            <div className="hero-grid"></div>
            <div className="hero-glow"></div>
          </div>

          <div className="hero-badge">
            <span className="hero-badge-dot"></span>
            End-to-end encrypted
          </div>

          <h1 className="hero-title">
            Transfers that <br /> stay <span className="highlight">private</span>
          </h1>

          <p className="hero-subtitle">
            Encrypt your messages and gigabyte files before they ever leave your device. Share securely. Chat confidently. No compromises.
          </p>

          <div className="hero-actions">
            <button className="btn-primary" onClick={() => setView('login')}>
              Get Started <span className="arrow">→</span>
            </button>
            <button className="btn-secondary" onClick={scrollToFeatures}>
              Learn More
            </button>
          </div>
        </section>

        {/* Features Section */}
        <section className="features" id="features">
          <div className="features-header">
            <p className="features-label">Why VaultDrop</p>
            <h2 className="features-title">Built for privacy</h2>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
                </svg>
              </div>
              <h3>Encrypt</h3>
              <p>Military-grade AES-256-GCM encryption protects every message and file before it ever leaves your local browser.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7V9zm4 0h2v2h-2V9zm4 0h2v2h-2V9z" />
                </svg>
              </div>
              <h3>Chat</h3>
              <p>Real-time messaging with strict zero-knowledge architecture. Not even our servers can read your conversations.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
                </svg>
              </div>
              <h3>Share Files</h3>
              <p>Send gigabyte-scale documents and media with scalable chunking. Files are encrypted in transit and safely at rest.</p>
            </div>
          </div>
        </section>

        {/* Footer Trust Bar */}
        <footer className="homepage-footer">
          <div className="trust-bar">
            <div className="trust-item">
              <svg viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
              <span>AES-256 Encrypted</span>
            </div>
            <div className="trust-item">
              <svg viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              <span>Zero-Knowledge</span>
            </div>
            <div className="trust-item">
              <svg viewBox="0 0 24 24">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
              <span>Open Source</span>
            </div>
          </div>
        </footer>
      </div>

      <div id="page-login" className={`page login-page ${view === 'login' ? 'active' : ''}`}>
        <div className="login-bg">
          <div className="login-bg-grid"></div>
          <div className="login-bg-glow"></div>
        </div>

        <div className="login-container">
          <div className="login-back" onClick={() => setView('home')}>
            <svg viewBox="0 0 24 24">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            Back to home
          </div>

          <div className="login-card">
            <div className="login-header">
              <div className="login-logo">
                <svg viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
                </svg>
              </div>
              <h2>VaultDrop</h2>
              
              <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-tertiary)', padding: '6px', borderRadius: '12px', marginTop: '16px' }}>
                <button 
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: authMode === 'login' ? 'var(--bg-card)' : 'transparent', color: authMode === 'login' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', transition: 'var(--transition)' }}
                  onClick={() => { setAuthMode('login'); setError(''); setStatus(''); }}
                >
                  Log In
                </button>
                <button 
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: authMode === 'register' ? 'var(--bg-card)' : 'transparent', color: authMode === 'register' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', transition: 'var(--transition)' }}
                  onClick={() => { setAuthMode('register'); setError(''); setStatus(''); }}
                >
                  Register
                </button>
              </div>
            </div>

            <form onSubmit={authMode === 'register' ? handleRegister : handleLogin}>
              <div className="form-group">
                <label className="form-label" htmlFor="username">
                  Username
                </label>
                <div className="form-input-icon">
                  <input
                    type="text"
                    id="username"
                    className="form-input"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    autoComplete="off"
                    autoFocus
                  />
                  <svg className="icon" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label" htmlFor="password">
                  Password
                </label>
                <div className="form-input-icon">
                  <input
                    type="password"
                    id="password"
                    className="form-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                  <svg className="icon" viewBox="0 0 24 24">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
                  </svg>
                </div>
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px', marginTop: '16px', lineHeight: '1.4' }}>
                  {error}
                </div>
              )}

              {status && (
                <div style={{ color: 'var(--accent)', fontSize: '13px', marginBottom: '16px', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="hero-badge-dot" style={{ width: '6px', height: '6px' }}></span>
                  {status}
                </div>
              )}

              <button type="submit" disabled={loading || !username.trim() || !password.trim()} className="btn-login" style={{ marginTop: '24px' }}>
                {loading ? 'Processing...' : (authMode === 'register' ? 'Generate Keys & Register' : 'Unlock & Log In')}
              </button>
              
              {authMode === 'register' && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '16px', lineHeight: '1.5' }}>
                  A unique RSA-4096 key pair will be generated and saved only to this browser. You must log in from this exact device to read your messages.
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
