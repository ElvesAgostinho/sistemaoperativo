import React, { useState } from 'react';
import { User, Lock, ArrowRight, ArrowLeft, Loader2, Mail, ShieldCheck, Clock, Phone } from 'lucide-react';
import { LogoMark } from './BrandLogo';

// Mensagens de bloqueio de login que significam "conta/empresa a aguardar
// aprovação humana" — nestes casos mostramos um ecrã dedicado em vez do
// balão de erro genérico, para não parecer uma credencial errada.
const MENSAGENS_PENDENTE = [
  'A sua conta está a aguardar aprovação pelo administrador.',
  'A subscrição da sua empresa está pendente ou suspensa. Contacte o suporte.'
];

const FONT_DISPLAY = "'Roboto', 'Segoe UI', sans-serif";
const FONT_BODY = "'Roboto', 'Segoe UI', sans-serif";
const ACCENT = '#0E5A6B';
const ACCENT_HOVER = '#0A4451';
const ACCENT_SOFT = '#E1EEF0';
const INK = '#1D2D3E';
const INK_MUTED = '#5B738B';
const BORDER = '#D5D7DA';

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
  const [telefone, setTelefone] = useState('');
  const [codigoConvite, setCodigoConvite] = useState(() => new URLSearchParams(window.location.search).get('code') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    setPendingMessage('');

    try {
      if (isLogin) {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          // Conta/empresa a aguardar aprovação humana não é um erro de
          // credenciais — merece o ecrã dedicado, não o balão vermelho.
          if (data.error && MENSAGENS_PENDENTE.includes(data.error)) {
            setPendingMessage(data.error);
            return;
          }
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
            telefone: isCompany ? telefone : undefined,
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

  if (pendingMessage) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', backgroundColor: '#F5F6F7', fontFamily: FONT_BODY, padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center', backgroundColor: 'white', border: `1px solid ${BORDER}`, padding: '44px 36px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '2px', backgroundColor: ACCENT_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Clock size={28} color={ACCENT} />
          </div>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: '19px', fontWeight: 700, color: INK, margin: '0 0 10px 0' }}>
            Conta a aguardar aprovação
          </h2>
          <p style={{ color: INK_MUTED, fontSize: '14px', lineHeight: 1.6, margin: '0 0 28px 0' }}>
            {pendingMessage} Assim que for aprovada, pode entrar normalmente com o mesmo email e palavra-passe.
          </p>
          <button
            onClick={() => { setPendingMessage(''); setPassword(''); }}
            style={{ padding: '10px 22px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '2px', fontSize: '13.5px', fontWeight: 700, fontFamily: FONT_BODY, cursor: 'pointer' }}
          >
            Voltar ao login
          </button>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 16px 11px 46px', border: `1px solid ${BORDER}`, borderRadius: '2px',
    fontSize: '14px', outline: 'none', transition: 'border-color 0.15s',
    boxSizing: 'border-box', fontFamily: FONT_BODY, background: '#FFFFFF', color: INK
  };
  const focusIn = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = ACCENT; };
  const focusOut = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = BORDER; };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: INK_MUTED, marginBottom: '8px' };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#FFFFFF', fontFamily: FONT_BODY }}>

      <button
        onClick={onBack}
        style={{ position: 'absolute', top: '24px', left: '24px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', fontWeight: 600, fontFamily: FONT_BODY, cursor: 'pointer', padding: '9px 16px', borderRadius: '2px', transition: 'background-color 0.15s', zIndex: 10, fontSize: '13.5px' }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
      >
        <ArrowLeft size={16} />
        Início
      </button>

      {/* Lado Esquerdo - Branding */}
      <div style={{ flex: 1, position: 'relative', background: '#0A3B47', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '60px', paddingTop: '110px', color: 'white', overflow: 'hidden' }}>
        <div style={{ zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '44px' }}>
            <LogoMark size={40} />
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: '22px', fontWeight: 700, color: 'white' }}>BusinessOS</span>
          </div>

          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: '36px', fontWeight: 700, lineHeight: 1.2, marginBottom: '20px', maxWidth: '480px' }}>
            O seu negócio,<br />
            <span style={{ color: '#9CC3E8' }}>numa só plataforma.</span>
          </h1>
          <p style={{ fontSize: '15px', color: '#C6D2DD', lineHeight: 1.7, maxWidth: '440px' }}>
            Faça a gestão de vendas, recursos humanos, financeiro, suporte omnicanal e inteligência artificial num ambiente seguro e integrado.
          </p>
        </div>

        <div style={{ zIndex: 1, fontSize: '12.5px', color: '#8CA0B3' }}>
          Feito para a realidade das empresas angolanas.
        </div>
      </div>

      {/* Lado Direito - Formulário */}
      <div style={{ flex: 1, display: 'flex', padding: '40px', backgroundColor: 'white', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '420px', margin: 'auto', padding: '20px 0' }}>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: '22px', fontWeight: 700, color: INK, margin: '0 0 8px 0' }}>
              {isLogin ? 'Bem-vindo de volta' : 'Crie a sua conta'}
            </h2>
            <p style={{ color: INK_MUTED, margin: 0, fontSize: '14px' }}>
              {isLogin ? 'Introduza as suas credenciais para aceder ao sistema.' : 'Registe-se e aguarde aprovação do administrador.'}
            </p>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', backgroundColor: '#F6DEDE', borderLeft: '3px solid #BB0000', color: '#BB0000', fontSize: '13.5px', marginBottom: '22px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={17} /> {error}
            </div>
          )}

          {success && (
            <div style={{ padding: '12px 16px', backgroundColor: '#DCEEE2', borderLeft: '3px solid #107E3E', color: '#107E3E', fontSize: '13.5px', marginBottom: '22px' }}>
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
                    style={{ flex: 1, padding: '10px', borderRadius: '2px', border: isCompany ? `1px solid ${BORDER}` : `2px solid ${ACCENT}`, background: isCompany ? '#FFFFFF' : ACCENT_SOFT, color: isCompany ? INK_MUTED : ACCENT, fontWeight: 700, fontFamily: FONT_BODY, fontSize: '13px', cursor: 'pointer' }}
                  >
                    Sou Funcionário
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCompany(true)}
                    style={{ flex: 1, padding: '10px', borderRadius: '2px', border: !isCompany ? `1px solid ${BORDER}` : `2px solid ${ACCENT}`, background: !isCompany ? '#FFFFFF' : ACCENT_SOFT, color: !isCompany ? INK_MUTED : ACCENT, fontWeight: 700, fontFamily: FONT_BODY, fontSize: '13px', cursor: 'pointer' }}
                  >
                    Criar Empresa
                  </button>
                </div>

                {isCompany && (
                  <>
                    <div>
                      <label style={labelStyle}>Nome da sua Empresa</label>
                      <div style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8996A3' }}><ShieldCheck size={17} /></div>
                        <input
                          type="text" required placeholder="Ex: Apple Angola"
                          value={empresaNome} onChange={e => setEmpresaNome(e.target.value)}
                          style={inputStyle} onFocus={focusIn} onBlur={focusOut}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Telefone da Empresa <span style={{ fontWeight: 400, color: '#8996A3' }}>(opcional)</span></label>
                      <div style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8996A3' }}><Phone size={17} /></div>
                        <input
                          type="tel" placeholder="Ex: 244 923 000 000"
                          value={telefone} onChange={e => setTelefone(e.target.value)}
                          style={inputStyle} onFocus={focusIn} onBlur={focusOut}
                        />
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#8996A3', marginTop: '6px', lineHeight: 1.5 }}>
                        Estes dados entram sozinhos em Definições &rarr; Dados da Empresa. Pode alterá-los lá quando quiser.
                      </div>
                    </div>
                  </>
                )}

                {!isCompany && (
                  <div>
                    <label style={labelStyle}>Código de Convite da Empresa</label>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8996A3' }}><Lock size={17} /></div>
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
                    <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8996A3' }}><User size={17} /></div>
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
                <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8996A3' }}><Mail size={17} /></div>
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
                <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: '#8996A3' }}><Lock size={17} /></div>
                <input
                  type="password" required placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  style={{ ...inputStyle, letterSpacing: '2px' }} onFocus={focusIn} onBlur={focusOut}
                />
              </div>
            </div>

            {!isLogin && (
              <p style={{ fontSize: '12px', color: INK_MUTED, textAlign: 'center', margin: '-4px 0 2px 0', lineHeight: 1.5 }}>
                Ao criar conta, concorda com os nossos{' '}
                <a href="/termos" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, fontWeight: 600 }}>Termos de Serviço</a>{' '}
                e a{' '}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, fontWeight: 600 }}>Política de Proteção de Dados</a>.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ padding: '12px', backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: '2px', fontSize: '14px', fontWeight: 700, fontFamily: FONT_BODY, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'background-color 0.15s', marginTop: '6px' }}
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
