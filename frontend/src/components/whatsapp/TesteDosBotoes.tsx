import { useState, useEffect } from 'react';
import { MousePointerClick, Send, Check, X, Loader, AlertTriangle } from 'lucide-react';

/**
 * Os botões funcionam MESMO neste WhatsApp?
 *
 * Não há como saber pela API. A Evolution devolve 201 e não guarda recibo de
 * entrega nenhum; em algumas versões — a 2.3.7 é uma delas — a mensagem sai e
 * nunca chega: fica em PENDING para sempre e o cliente não recebe nada.
 *
 * Quem sabe é quem tem o telemóvel na mão. Aqui manda-se um botão de teste, a
 * pessoa olha, e diz. O sistema passa a usar botões ou sondagens conforme a
 * resposta — em vez de eu decidir por ela a partir de relatos da internet.
 */
export default function TesteDosBotoes({ telefoneDaEmpresa }: { telefoneDaEmpresa?: string }) {
  const [estado, setEstado] = useState<{ funcionam: boolean; decidivel: boolean; provider: string | null } | null>(null);
  const [telefone, setTelefone] = useState(telefoneDaEmpresa || '');
  const [aEnviar, setAEnviar] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState('');

  const API = import.meta.env.VITE_API_URL;
  const cab = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('os_auth_token')}`,
  });

  const ler = async () => {
    try {
      const r = await fetch(`${API}/api/whatsapp/canal/botoes`, { headers: cab() });
      const d = await r.json();
      if (d.success) setEstado({ funcionam: d.funcionam, decidivel: d.decidivel, provider: d.provider });
    } catch { /* o painel funciona sem isto */ }
  };

  useEffect(() => { ler(); }, []);

  const testar = async () => {
    setAEnviar(true); setErro(''); setEnviado(false);
    try {
      const r = await fetch(`${API}/api/whatsapp/canal/testar-botoes`, {
        method: 'POST', headers: cab(), body: JSON.stringify({ telefone }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Não foi possível enviar o teste.');
      setEnviado(true);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setAEnviar(false);
    }
  };

  const responder = async (funcionam: boolean) => {
    setAGravar(true); setErro('');
    try {
      const r = await fetch(`${API}/api/whatsapp/canal/botoes`, {
        method: 'PUT', headers: cab(), body: JSON.stringify({ funcionam }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Não foi possível guardar.');
      setEnviado(false);
      await ler();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setAGravar(false);
    }
  };

  if (!estado) return null;

  // Pela Meta não há nada a decidir: lá os botões funcionam sempre.
  if (!estado.decidivel) {
    return (
      <div style={{
        border: '1px solid #D5D7DA', borderRadius: '2px', padding: '16px', marginBottom: '20px',
        background: '#fff', fontSize: '13px', color: '#5B738B', lineHeight: 1.6,
      }}>
        <b style={{ color: '#1D2D3E' }}>Botões nos menus</b><br />
        Este canal usa a API oficial da Meta — os botões e os menus funcionam sempre.
      </div>
    );
  }

  const botaoResposta = (sim: boolean) => ({
    flex: 1, padding: '10px', borderRadius: '6px', cursor: aGravar ? 'default' : 'pointer',
    fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
    border: `1px solid ${sim ? '#107E3E' : '#D5D7DA'}`,
    background: sim ? '#DCEEE2' : '#fff',
    color: sim ? '#107E3E' : '#5B738B',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  } as React.CSSProperties);

  return (
    <div style={{
      border: `1px solid ${estado.funcionam ? '#9FC4CC' : '#FDE68A'}`, borderRadius: '2px',
      padding: '16px', marginBottom: '20px',
      background: estado.funcionam ? '#F4FAFB' : '#FFFBEB',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <MousePointerClick size={17} color={estado.funcionam ? '#0E5A6B' : '#B45309'} />
        <b style={{ color: '#1D2D3E', fontSize: '14px' }}>Botões nos menus</b>
        <span style={{
          marginLeft: 'auto', fontSize: '11.5px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px',
          background: estado.funcionam ? '#DCEEE2' : '#FEF3C7',
          color: estado.funcionam ? '#107E3E' : '#92400E',
        }}>
          {estado.funcionam ? 'A usar botões' : 'A usar sondagens'}
        </span>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#5B738B', lineHeight: 1.65 }}>
        Em algumas versões da Evolution os botões saem sem erro nenhum e <b>nunca chegam</b> ao
        telemóvel do cliente. Não há forma de o saber pela API — só olhando. Mande o teste abaixo,
        veja no WhatsApp, e diga o que viu.
      </p>

      {!enviado ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={telefone}
            onChange={e => setTelefone(e.target.value)}
            placeholder="Número que recebe o teste (ex: 244928053925)"
            style={{
              flex: 1, padding: '9px 11px', border: '1px solid #D5D7DA',
              borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={testar}
            disabled={aEnviar || telefone.replace(/\D/g, '').length < 8}
            style={{
              padding: '9px 16px', borderRadius: '6px', border: 'none',
              background: aEnviar ? '#7FA9B3' : '#0E5A6B', color: '#fff',
              fontSize: '13px', fontWeight: 600, cursor: aEnviar ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'inherit',
            }}
          >
            {aEnviar ? <Loader size={14} className="girar" /> : <Send size={14} />}
            {aEnviar ? 'A enviar...' : 'Enviar teste'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{
            padding: '10px 12px', borderRadius: '6px', background: '#fff',
            border: '1px solid #D5D7DA', fontSize: '12.5px', color: '#1D2D3E',
            lineHeight: 1.6, marginBottom: '10px',
          }}>
            Enviado. Veja a mensagem <b>"TESTE DOS BOTÕES"</b> no WhatsApp do número
            que indicou e responda aqui:
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => responder(true)} disabled={aGravar} style={botaoResposta(true)}>
              <Check size={15} /> Vi dois botões a clicar
            </button>
            <button onClick={() => responder(false)} disabled={aGravar} style={botaoResposta(false)}>
              <X size={15} /> Só vi texto
            </button>
          </div>
        </div>
      )}

      {erro && (
        <div style={{
          marginTop: '10px', padding: '9px 11px', borderRadius: '6px',
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
          fontSize: '12px', display: 'flex', gap: '7px', alignItems: 'flex-start', lineHeight: 1.6,
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} /> {erro}
        </div>
      )}

      {!estado.funcionam && (
        <div style={{ marginTop: '12px', fontSize: '11.5px', color: '#92400E', lineHeight: 1.7 }}>
          <b>Se não funcionarem</b>, há dois caminhos para os ter: descer a sua Evolution para a
          versão <b>2.3.6</b> (onde há relatos de que botões e menus funcionam), ou ligar este
          número pela <b>API oficial da Meta</b>, onde funcionam sempre e são documentados.
        </div>
      )}

      <style>{`.girar { animation: girar 1s linear infinite; } @keyframes girar { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
