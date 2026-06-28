import React, { useState } from 'react';
import { User, Lock, ArrowRight, ArrowLeft, Loader2, Mail, ShieldCheck } from 'lucide-react';

const LogoSVG = () => (
  <svg width="64" height="64" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.5))' }}>
    <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" stroke="url(#logo-grad-auth)" strokeWidth="8" fill="rgba(255,255,255,0.02)" />
    <path d="M50 10 L50 50 L90 30" stroke="url(#logo-grad-auth)" strokeWidth="6" />
    <path d="M10 30 L50 50 L50 90" stroke="url(#logo-grad-auth)" strokeWidth="6" />
    <circle cx="50" cy="50" r="12" fill="#fff" />
    <defs>
      <linearGradient id="logo-grad-auth" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3b82f6" />
        <stop offset="1" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
  </svg>
);

interface AuthScreenProps {
  onLogin: (user: any, token: string) => void;
  onBack: () => void;
}

export default function AuthScreen({ onLogin, onBack }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [isCompany, setIsCompany] = useState(false);
  const [empresaNome, setEmpresaNome] = useState('');
  const [codigoConvite, setCodigoConvite] = useState(() => new URLSearchParams(window.location.search).get('code') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isLogin) {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Erro ao iniciar sessão.');
        }
        
        onLogin(data.user, data.access_token);
      } else {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email, 
            password, 
            nome, 
            empresaNome: isCompany ? empresaNome : undefined,
            codigoConvite: !isCompany ? codigoConvite : undefined
          })
        });
        
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao registar.');
        }
        
        setSuccess(data.message + ' Verifique a sua caixa de entrada e confirme o email antes de fazer login.');
        setTimeout(() => setIsLogin(true), 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado. Verifique a sua ligação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Botão de Voltar absoluto */}
      <button 
        onClick={onBack}
        style={{ position: 'absolute', top: '24px', left: '24px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', fontWeight: 500, cursor: 'pointer', padding: '10px 18px', borderRadius: '30px', transition: 'all 0.3s', zIndex: 10 }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <ArrowLeft size={18} />
        Início
      </button>

      {/* Lado Esquerdo - Branding (Escondido em ecrãs pequenos) */}
      <div style={{ flex: 1, position: 'relative', background: '#0c1319', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '60px', paddingTop: '100px', color: 'white', overflow: 'hidden' }}>
        {/* Background abstract shapes */}
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.3) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(40px)' }}></div>
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(40px)' }}></div>

        <div style={{ zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
             <LogoSVG />
             <span style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-1px', color: 'white' }}>BusinessOS</span>
          </div>

          <h1 style={{ fontSize: '48px', fontWeight: 800, lineHeight: 1.1, marginBottom: '24px', maxWidth: '500px', letterSpacing: '-1px' }}>
            O seu negócio,<br />
            <span style={{ color: '#60a5fa' }}>numa só plataforma.</span>
          </h1>
          <p style={{ fontSize: '18px', color: '#94a3b8', lineHeight: 1.6, maxWidth: '450px' }}>
            Faça a gestão de vendas, recursos humanos, suporte omnicanal e inteligência artificial num ambiente seguro e integrado.
          </p>
        </div>


      </div>

      {/* Lado Direito - Formulário */}
      <div style={{ flex: 1, display: 'flex', padding: '40px', backgroundColor: 'white', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '420px', margin: 'auto', padding: '20px 0' }}>
          
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
              {isLogin ? 'Bem-vindo de volta' : 'Crie a sua conta'}
            </h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: '15px' }}>
              {isLogin ? 'Introduza as suas credenciais para aceder ao sistema.' : 'Registe-se e aguarde aprovação do administrador.'}
            </p>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444', color: '#b91c1c', borderRadius: '4px', fontSize: '14px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={18} /> {error}
            </div>
          )}

          {success && (
            <div style={{ padding: '12px 16px', backgroundColor: '#f0fdf4', borderLeft: '4px solid #22c55e', color: '#15803d', borderRadius: '4px', fontSize: '14px', marginBottom: '24px' }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {!isLogin && (
              <>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setIsCompany(false)}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: isCompany ? '1px solid #cbd5e1' : '2px solid #3b82f6', background: isCompany ? '#f8fafc' : '#eff6ff', color: isCompany ? '#64748b' : '#1d4ed8', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    Sou Funcionário
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCompany(true)}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: !isCompany ? '1px solid #cbd5e1' : '2px solid #3b82f6', background: !isCompany ? '#f8fafc' : '#eff6ff', color: !isCompany ? '#64748b' : '#1d4ed8', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    Criar Empresa SaaS
                  </button>
                </div>

                {isCompany && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Nome da sua Empresa</label>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#94a3b8' }}><ShieldCheck size={18} /></div>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Apple Angola"
                        value={empresaNome}
                        onChange={e => setEmpresaNome(e.target.value)}
                        style={{ width: '100%', padding: '12px 16px 12px 46px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                        onFocus={e => e.target.style.borderColor = '#3b82f6'}
                        onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                      />
                    </div>
                  </div>
                )}

                {!isCompany && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Código de Convite da Empresa</label>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#94a3b8' }}><Lock size={18} /></div>
                      <input
                        type="text"
                        required
                        placeholder="Ex: EMP-A1B2C3"
                        value={codigoConvite}
                        onChange={e => setCodigoConvite(e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '12px 16px 12px 46px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                        onFocus={e => e.target.style.borderColor = '#3b82f6'}
                        onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Seu Nome Completo</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#94a3b8' }}><User size={18} /></div>
                    <input
                      type="text"
                      required
                      placeholder="Ex: João Silva"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      style={{ width: '100%', padding: '12px 16px 12px 46px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                      onFocus={e => e.target.style.borderColor = '#3b82f6'}
                      onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Email Profissional</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#94a3b8' }}><Mail size={18} /></div>
                <input
                  type="email"
                  required
                  placeholder="nome@empresa.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px 12px 46px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Palavra-passe</label>
                {isLogin && <a href="#" style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>Esqueceu-se?</a>}
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#94a3b8' }}><Lock size={18} /></div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px 12px 46px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box', letterSpacing: '2px' }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ padding: '14px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s', marginTop: '8px' }}
              onMouseOver={e => { if (!loading) e.currentTarget.style.backgroundColor = '#1e293b'; }}
              onMouseOut={e => { if (!loading) e.currentTarget.style.backgroundColor = '#0f172a'; }}
            >
              {loading ? <Loader2 size={18} className="spin" /> : null}
              {!loading && (isLogin ? 'Entrar no sistema' : 'Criar Conta')}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '32px', fontSize: '14px', color: '#64748b' }}>
            {isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); setSuccess(''); setPassword(''); }}
              style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', marginLeft: '6px', fontSize: '14px' }}
            >
              {isLogin ? 'Registar' : 'Fazer Login'}
            </button>
          </div>

        </div>
      </div>
      
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
