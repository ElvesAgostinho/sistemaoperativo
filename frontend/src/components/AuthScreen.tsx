import React, { useState } from 'react';
import { User, Lock, ArrowRight, ArrowLeft, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { LogoMark } from './BrandLogo';

const FONT_DISPLAY = "'Manrope', 'Segoe UI', sans-serif";
const FONT_BODY = "'IBM Plex Sans', 'Segoe UI', sans-serif";
const ACCENT = '#017E84';
const ACCENT_HOVER = '#016368';
const ACCENT_SOFT = '#E3F3F1';
const INK = '#16211F';
const INK_MUTED = '#5B6B67';
const BORDER = '#E2E8E6';

interface AuthScreenProps {
  onLogin: (user: any, token: string, refreshToken?: string) => void;
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

        onLogin(data.user, data.access_token, data.refresh_token);
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px 12px 46px', border: `1px solid ${BORDER}`, borderRadius: '10px',
    fontSize: '14px', outline: 'none', transition: 'border-color 0.15s, background 0.15s',
    boxSizing: 'border-box', fontFamily: FONT_BODY, background: '#FAFCFB', color: INK
  };
  const focusIn = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = ACCENT; e.target.style.background = '#FFFFFF'; };
  const focusOut = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = BORDER; e.target.style.background = '#FAFCFB'; };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: INK_MUTED, marginBottom: '8px' };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#FFFFFF', fontFamily: FONT_BODY }}>

      <button
        onClick={onBack}
        style={{ position: 'absolute', top: '24px', left: '24px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', fontWeight: 600, fontFamily: FONT_BODY, cursor: 'pointer', padding: '10px 18px', borderRadius: '10px', transition: 'all 0.2s', zIndex: 10, fontSize: '13.5px' }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
      >
        <ArrowLeft size={16} />
        Início
      </button>

      {/* Lado Esquerdo - Branding */}
      <div style={{ flex: 1, position: 'relative', background: '#0F1917', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '60px', paddingTop: '110px', color: 'white', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(1,126,132,0.35) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(40px)' }}></div>
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(183,121,31,0.15) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(40px)' }}></div>

        <div style={{ zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '44px' }}>
            <LogoMark size={44} />
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: '26px', fontWeight: 800, letterSpacing: '-0.01em', color: 'white' }}>BusinessOS</span>
          </div>

          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: '42px', fontWeight: 900, lineHeight: 1.15, marginBottom: '20px', maxWidth: '480px', letterSpacing: '-0.02em' }}>
            O seu negócio,<br />
            <span style={{ color: '#3ECAC4' }}>numa só plataforma.</span>
          </h1>
          <p style={{ fontSize: '15.5px', color: '#A9BAB5', lineHeight: 1.7, maxWidth: '440px' }}>
            Faça a gestão de vendas, recursos humanos, financeiro, suporte omnicanal e inteligência artificial num ambiente seguro e integrado.
          </p>
        </div>

        <div style={{ zIndex: 1, fontSize: '12.5px', color: '#6E827D' }}>
          Feito para a realidade das empresas angolanas.
        </div>
      </div>

      {/* Lado Direito - Formulário */}
      <div style={{ flex: 1, display: 'flex', padding: '40px', backgroundColor: 'white', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '420px', margin: 'auto', padding: '20px 0' }}>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: '26px', fontWeight: 800, color: INK, margin: '0 0 8px 0', letterSpacing: '-0.01em' }}>
              {isLogin ? 'Bem-vindo de volta' : 'Crie a sua conta'}
            </h2>
            <p style={{ color: INK_MUTED, margin: 0, fontSize: '14px' }}>
              {isLogin ? 'Introduza as suas credenciais para aceder ao sistema.' : 'Registe-se e aguarde aprovação do administrador.'}
            </p>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', backgroundColor: '#FBEAEA', borderLeft: '3px solid #B23A3A', color: '#B23A3A', borderRadius: '8px', fontSize: '13.5px', marginBottom: '22px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={17} /> {error}
            </div>
          )}

          {success && (
            <div style={{ padding: '12px 16px', backgroundColor: '#E7F5EC', borderLeft: '3px solid #1F7A45', color: '#1F7A45', borderRadius: '8px', fontSize: '13.5px', marginBottom: '22px' }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {!isLogin && (
              <>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setIsCompany(false)}
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: isCompany ? `1px solid ${BORDER}` : `2px solid ${ACCENT}`, background: isCompany ? '#FAFCFB' : ACCENT_SOFT, color: isCompany ? INK_MUTED : ACCENT, fontWeight: 700, fontFamily: FONT_BODY, fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    Sou Funcionário
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCompany(true)}
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: !isCompany ? `1px solid ${BORDER}` : `2px solid ${ACCENT}`, background: !isCompany ? '#FAFCFB' : ACCENT_SOFT, color: !isCompany ? INK_MUTED : ACCENT, fontWeight: 700, fontFamily: FONT_BODY, fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    Criar Empresa
                  </button>
                </div>

                {isCompany && (
                  <div>
                    <label style={labelStyle}>Nome da sua Empresa</label>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8B9B97' }}><ShieldCheck size={17} /></div>
                      <input
                        type="text" required placeholder="Ex: Apple Angola"
                        value={empresaNome} onChange={e => setEmpresaNome(e.target.value)}
                        style={inputStyle} onFocus={focusIn} onBlur={focusOut}
                      />
                    </div>
                  </div>
                )}

                {!isCompany && (
                  <div>
                    <label style={labelStyle}>Código de Convite da Empresa</label>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8B9B97' }}><Lock size={17} /></div>
                      <input
                        type="text" required placeholder="Ex: EMP-A1B2C3"
                        value={codigoConvite} onChange={e => setCodigoConvite(e.target.value.toUpperCase())}
                        style={inputStyle} onFocus={focusIn} onBlur={focusOut}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Seu Nome Completo</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8B9B97' }}><User size={17} /></div>
                    <input
                      type="text" required placeholder="Ex: João Silva"
                      value={nome} onChange={e => setNome(e.target.value)}
                      style={inputStyle} onFocus={focusIn} onBlur={focusOut}
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label style={labelStyle}>Email Profissional</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8B9B97' }}><Mail size={17} /></div>
                <input
                  type="email" required placeholder="nome@empresa.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  style={inputStyle} onFocus={focusIn} onBlur={focusOut}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Palavra-passe</label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => alert('Para redefinir a sua palavra-passe, contacte o administrador da sua empresa ou o suporte.')}
                    style={{ fontSize: '12px', color: ACCENT, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT_BODY }}
                  >
                    Esqueceu-se?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8B9B97' }}><Lock size={17} /></div>
                <input
                  type="password" required placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  style={{ ...inputStyle, letterSpacing: '2px' }} onFocus={focusIn} onBlur={focusOut}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ padding: '13px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, fontFamily: FONT_BODY, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'background-color 0.15s', marginTop: '6px' }}
              onMouseOver={e => { if (!loading) e.currentTarget.style.backgroundColor = ACCENT_HOVER; }}
              onMouseOut={e => { if (!loading) e.currentTarget.style.backgroundColor = ACCENT; }}
            >
              {loading ? <Loader2 size={17} className="spin" /> : null}
              {!loading && (isLogin ? 'Entrar no sistema' : 'Criar Conta')}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '28px', fontSize: '13.5px', color: INK_MUTED }}>
            {isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); setSuccess(''); setPassword(''); }}
              style={{ background: 'none', border: 'none', color: ACCENT, fontWeight: 700, cursor: 'pointer', marginLeft: '6px', fontSize: '13.5px', fontFamily: FONT_BODY }}
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
