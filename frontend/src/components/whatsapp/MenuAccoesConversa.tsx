import { useState, useRef, useEffect } from 'react';
import { MoreVertical, History, UserPlus, ClipboardList, IdCard, Loader2 } from 'lucide-react';

/**
 * As acções secundárias da conversa, arrumadas num menu.
 *
 * Estavam todas como botões soltos no topo. À medida que foram aparecendo —
 * recuperar histórico, delegar, auditoria, escolher fluxo — o cabeçalho encheu
 * e o nome do contacto ficou espremido num canto a partir-se em três linhas.
 * Aqui fica só o que se usa a toda a hora; o resto vive atrás dos três pontos.
 */
export default function MenuAccoesConversa({
  fichaAberta, onFicha, onHistorico, aImportar, onDelegar, onAuditoria,
  podeDelegar, podeVerAuditoria
}: {
  fichaAberta: boolean;
  onFicha: () => void;
  onHistorico: () => void;
  aImportar: boolean;
  onDelegar: () => void;
  onAuditoria: () => void;
  // Uma permissao por acao, em vez de um "podeGerir" que ligava as duas ao
  // papel: o dono pode querer que um supervisor delegue conversas sem lhe dar
  // a auditoria, e ao contrario.
  podeDelegar: boolean;
  podeVerAuditoria: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const item = (icone: React.ReactNode, texto: string, aoClicar: () => void, nota?: string) => (
    <button
      onClick={() => { aoClicar(); setAberto(false); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        fontSize: '13.5px', color: '#1D2D3E'
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F5F6F7')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <span style={{ display: 'flex', color: '#5B738B', flexShrink: 0 }}>{icone}</span>
      <span style={{ flex: 1 }}>{texto}</span>
      {nota && <span style={{ fontSize: '11.5px', color: '#8996A3' }}>{nota}</span>}
    </button>
  );

  return (
    <div ref={caixa} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setAberto(v => !v)}
        title="Mais acções"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px',
          background: aberto ? '#D5D7DA' : 'transparent', border: 'none', borderRadius: '2px',
          cursor: 'pointer', color: '#5B738B'
        }}
      >
        <MoreVertical size={18} />
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', top: '38px', right: 0, zIndex: 50, width: '250px',
          background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.15)', padding: '4px 0'
        }}>
          {item(<IdCard size={16} />, fichaAberta ? 'Fechar a ficha' : 'Ficha do contacto', onFicha)}
          {item(
            aImportar ? <Loader2 size={16} className="spin" /> : <History size={16} />,
            aImportar ? 'A recuperar...' : 'Recuperar histórico',
            onHistorico
          )}
          {(podeDelegar || podeVerAuditoria) && (
            <div style={{ height: '1px', background: '#E7E9EB', margin: '4px 0' }} />
          )}
          {podeDelegar && item(<UserPlus size={16} />, 'Delegar a um agente', onDelegar)}
          {podeVerAuditoria && item(<ClipboardList size={16} />, 'Ver auditoria', onAuditoria)}
        </div>
      )}
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
