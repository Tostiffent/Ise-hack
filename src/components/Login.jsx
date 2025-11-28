import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { Activity } from 'lucide-react';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [error, setError] = useState('');
    const { login, register } = useStore();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!username || !password) return;
        try {
            if (mode === 'login') {
                await login(username, password);
            } else {
                await register(username, password, phone);
            }
        } catch (err) {
            setError(err.message || 'Something went wrong');
        }
    };

    return (
        <div className="flex-center" style={{ minHeight: '100vh' }}>
            <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
                <div className="flex-center" style={{ flexDirection: 'column', marginBottom: '2rem' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                        padding: '1rem',
                        borderRadius: '12px',
                        marginBottom: '1rem',
                        boxShadow: '0 0 20px var(--primary-glow)'
                    }}>
                        <Activity size={32} color="white" />
                    </div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Welcome Back</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Sign in to manage family health</p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            Username
                        </label>
                        <input
                            type="text"
                            className="glass-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your username"
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            Password
                        </label>
                        <input
                            type="password"
                            className="glass-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>

                    {mode === 'register' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                Phone (for head of family)
                            </label>
                            <input
                                type="tel"
                                className="glass-input"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="Contact number"
                            />
                        </div>
                    )}

                    {error && (
                        <div style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>
                            {error}
                        </div>
                    )}

                    <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>
                        {mode === 'login' ? 'Login' : 'Register as Head of Family'}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {mode === 'login' ? (
                        <>
                            Don't have an account?{' '}
                            <button
                                type="button"
                                onClick={() => { setMode('register'); setError(''); }}
                                style={{ color: 'var(--primary)', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                                Register
                            </button>
                        </>
                    ) : (
                        <>
                            Already have an account?{' '}
                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(''); }}
                                style={{ color: 'var(--primary)', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                                Login
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;
