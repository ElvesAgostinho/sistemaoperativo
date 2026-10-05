import { useState } from 'react';
import { Lock, Check, AlertCircle, Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const ACCENT = '#0E5A6B';

/**
 * Página onde se escolhe a nova palavra-passe, aberta pelo link do email.
 *
 * O código vem no endereço (?codigo=...) e só serve uma vez. Quem chega aqui já
 * provou que tem acesso à caixa de correio, por isso não se pede mais nada —
 * pedir a palavra-passe antiga a quem a esqueceu não faria sentido nenhum.
 */
export default function RedefinirSenha() {
  const codigo = new URLSearchParams(window.location.search).get('codigo') || '';
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [estado, setEstado] = useState<'inicio' | 'a_guardar' | 'feito'>('inicio');
  const [erro, setErro] = useState('');

  const fraca = senha.length > 0 && senha.length < 6;
  const diferentes = confirmacao.length > 0 && senha !== confirmacao;
  const podeGuardar = senha.length >= 6 && senha === confirmacao && estado === 'inicio';

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeGuardar) return;
    setEstado('a_guardar'); setErro('');
    try {
      const r = await fetch(`${API}/api/auth/redefinir-senha`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, password: senha })
      });
      const d = await r.json();
      if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível guardar.'); setEstado('inicio'); return; }
      setEstado('feito');
    } catch {
      setErro('Não foi possível falar com o servidor. Verifique a ligação.');
      setEstado('inicio');
    }
  };

  const caixa: React.CSSProperties = {
    width: '100%', padding: '13px 16px 13px 44px', borderRadius: '2px',
    border: '1px solid #D5D7DA', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  };
  const rotulo: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 700, color: '#1D2D3E', marginBottom: '8px' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F6F7', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px', background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '36px 32px' }}>

        {!codigo ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#BB0000', marginBottom: '10px' }}>
              <AlertCircle size={22} />
              <h1 style={{ margin: 0, fontSize: '19px', color: '#1D2D3E' }}>Link incompleto</h1>
            </div>
            <p style={{ fontSize: '14px', color: '#5B738B', lineHeight: 1.7, margin: '0 0 22px' }}>
              Este endereço não traz o código de redefinição. Abra o link diretamente a partir do email que recebeu,
              sem o copiar aos bocados.
            </p>
            <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: ACCENT, fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>
              Voltar ao início <ArrowRight size={16} />
            </a>
          </>
        ) : estado === 'feito' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#107E3E', marginBottom: '10px' }}>
              <Check size={22} />
              <h1 style={{ margin: 0, fontSize: '19px', color: '#1D2D3E' }}>Palavra-passe alterada</h1>
            </div>
            <p style={{ fontSize: '14px', color: '#5B738B', lineHeight: 1.7, margin: '0 0 22px' }}>
              Já pode entrar com a palavra-passe nova. O link do email deixou de funcionar.
            </p>
            <a href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', background: ACCENT, color: 'white', fontWeight: 700, fontSize: '14px', textDecoration: 'none', borderRadius: '2px' }}>
              Entrar no sistema <ArrowRight size={17} />
            </a>
          </>
        ) : (
          <>
            <h1 style={{ margin: '0 0 6px', fontSize: '20px', color: '#1D2D3E' }}>Nova palavra-passe</h1>
            <p style={{ fontSize: '13.5px', color: '#5B738B', lineHeight: 1.65, margin: '0 0 24px' }}>
              Escolha uma palavra-passe nova para a sua conta. Mínimo de 6 caracteres.
            </p>

            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={rotulo}>Nova palavra-passe</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={17} color="#8996A3" style={{ position: 'absolute', top: '50%', left: '15px', transform: 'translateY(-50%)' }} />
                  <input
                    type={mostrar ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)}
                    autoFocus required placeholder="••••••••"
                    style={{ ...caixa, borderColor: fraca ? '#BB0000' : '#D5D7DA', paddingRight: '44px' }}
                  />
                  <button type="button" onClick={() => setMostrar(v => !v)} title={mostrar ? 'Esconder' : 'Mostrar'}
                    style={{ position: 'absolute', top: '50%', right: '12px', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8996A3', display: 'flex' }}>
                    {mostrar ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {fraca && <div style={{ fontSize: '12.5px', color: '#BB0000', marginTop: '6px' }}>Faltam {6 - senha.length} caracteres.</div>}
              </div>

              <div>
                <label style={rotulo}>Repita a palavra-passe</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={17} color="#8996A3" style={{ position: 'absolute', top: '50%', left: '15px', transform: 'translateY(-50%)' }} />
                  <input
                    type={mostrar ? 'text' : 'password'} value={confirmacao} onChange={e => setConfirmacao(e.target.value)}
                    required placeholder="••••••••"
                    style={{ ...caixa, borderColor: diferentes ? '#BB0000' : '#D5D7DA' }}
                  />
                </div>
                {diferentes && <div style={{ fontSize: '12.5px', color: '#BB0000', marginTop: '6px' }}>As duas não são iguais.</div>}
              </div>

              {erro && (
                <div style={{ display: 'flex', gap: '8px', padding: '12px', background: '#F6DEDE', color: '#BB0000', borderRadius: '2px', fontSize: '13px', lineHeight: 1.5 }}>
                  <AlertCircle size={17} style={{ flexShrink: 0 }} /> {erro}
                </div>
              )}

              <button type="submit" disabled={!podeGuardar}
                style={{
                  padding: '13px', background: podeGuardar ? ACCENT : '#B8C2CC', color: 'white', border: 'none',
                  borderRadius: '2px', fontWeight: 700, fontSize: '14px',
                  cursor: podeGuardar ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                {estado === 'a_guardar' ? <><Loader2 size={17} className="spin" /> A guardar...</> : <>Guardar e entrar <ArrowRight size={17} /></>}
              </button>
            </form>
          </>
        )}
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
