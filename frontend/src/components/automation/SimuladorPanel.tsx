import { useState, useRef, useEffect } from 'react';
import { X, Send, RotateCcw, Play, CornerDownRight, AlertTriangle, Loader2 } from 'lucide-react';

interface Passo { nodeId: string; tipo: string; titulo: string; detalhe?: string }
interface Msg { de: 'bot' | 'cliente'; texto: string; tipo?: string }

/**
 * Simulador do fluxo: conversa de teste que corre o motor real "a seco" — nada
 * é enviado ao cliente nem gravado. Mostra as respostas e por que nós passou.
 */
export default function SimuladorPanel({ automationId, onFechar, onDestacarNo }: {
  automationId: number;
  onFechar: () => void;
  onDestacarNo?: (nodeId: string | null) => void;
}) {
  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [passos, setPassos] = useState<Passo[]>([]);
  const [estado, setEstado] = useState<any>(null);
  const [terminou, setTerminou] = useState(false);
  const [texto, setTexto] = useState('');
  const [aCorrer, setACorrer] = useState(false);
  const [erro, setErro] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens, passos]);

  const enviar = async (msg: string) => {
    if (!msg.trim() || aCorrer) return;
    setACorrer(true); setErro('');
    setMensagens(m => [...m, { de: 'cliente', texto: msg }]);
    setTexto('');
    try {
      const token = localStorage.getItem('os_auth_token') || '';
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/automation/${automationId}/simular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mensagem: msg, estado })
      });
      const d = await r.json();
      if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível simular.'); return; }
      setMensagens(m => [...m, ...(d.mensagens || [])]);
      setPassos(d.passos || []);
      setEstado(d.pendente || null);
      setTerminou(!!d.terminou && !d.pendente);
      if (onDestacarNo) onDestacarNo(d.pendente?.nodeId || (d.passos?.length ? d.passos[d.passos.length - 1].nodeId : null));
    } catch {
      setErro('Erro de ligação ao servidor.');
    } finally {
      setACorrer(false);
    }
  };

  const reiniciar = () => { setMensagens([]); setPassos([]); setEstado(null); setTerminou(false); setErro(''); if (onDestacarNo) onDestacarNo(null); };

  const corPasso = (p: Passo) => p.tipo === 'erro' ? '#dc2626' : p.tipo === 'condition' ? '#8b5cf6' : p.tipo === 'menu' ? '#0891b2' : p.tipo === 'trigger' ? '#f59e0b' : '#0E5A6B';

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: '380px', zIndex: 12,
      background: 'white', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.06)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
        <Play size={15} color="#0E5A6B" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#1a1a1a' }}>Simulador</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Corre o fluxo a sério, mas nada é enviado ao cliente.</div>
        </div>
        <button onClick={reiniciar} title="Começar do princípio" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}><RotateCcw size={15} /></button>
        <button onClick={onFechar} title="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}><X size={16} /></button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px', background: '#f8fafc' }}>
        {mensagens.length === 0 && (
          <div style={{ fontSize: '12.5px', color: '#64748b', lineHeight: 1.6 }}>
            Escreva em baixo a mensagem que o cliente enviaria (ex: <b>Olá</b>) e veja o que o fluxo responde.
            Depois responda às perguntas como um cliente faria — o simulador guarda o ponto da conversa, tal como o motor a sério.
          </div>
        )}
        {mensagens.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.de === 'cliente' ? 'flex-end' : 'flex-start', marginBottom: '6px' }}>
            <div style={{
              maxWidth: '82%', padding: '8px 11px', borderRadius: '10px', fontSize: '12.5px', whiteSpace: 'pre-wrap', lineHeight: 1.45,
              background: m.de === 'cliente' ? '#0E5A6B' : 'white', color: m.de === 'cliente' ? 'white' : '#1a1a1a',
              border: m.de === 'cliente' ? 'none' : '1px solid #e2e8f0'
            }}>
              {m.tipo && <div style={{ fontSize: '10.5px', opacity: 0.7, marginBottom: '2px', textTransform: 'uppercase' }}>{m.tipo}</div>}
              {m.texto}
            </div>
          </div>
        ))}
        {erro && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '12px', marginTop: '8px' }}><AlertTriangle size={13} /> {erro}</div>}
        {terminou && <div style={{ fontSize: '11.5px', color: '#64748b', textAlign: 'center', margin: '10px 0' }}>— fim do fluxo —</div>}
        {estado && <div style={{ fontSize: '11.5px', color: '#0891b2', textAlign: 'center', margin: '10px 0' }}>à espera da resposta do cliente…</div>}
        <div ref={fim} />
      </div>

      {passos.length > 0 && (
        <div style={{ borderTop: '1px solid #e2e8f0', maxHeight: '190px', overflowY: 'auto', padding: '8px 12px', background: 'white' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>Caminho percorrido</div>
          {passos.map((p, i) => (
            <div key={i} onMouseEnter={() => onDestacarNo && onDestacarNo(p.nodeId)} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '12px', padding: '3px 0', cursor: 'default' }}>
              <CornerDownRight size={12} color={corPasso(p)} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <span style={{ color: corPasso(p), fontWeight: 600 }}>{p.titulo}</span>
                {p.detalhe && <span style={{ color: '#64748b' }}> · {p.detalhe}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px', display: 'flex', gap: '6px' }}>
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') enviar(texto); }}
          placeholder={estado ? 'A sua resposta…' : 'Mensagem do cliente (ex: Olá)'}
          style={{ flex: 1, padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }}
        />
        <button onClick={() => enviar(texto)} disabled={aCorrer || !texto.trim()}
          style={{ padding: '9px 13px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '8px', cursor: aCorrer ? 'wait' : 'pointer' }}>
          {aCorrer ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
