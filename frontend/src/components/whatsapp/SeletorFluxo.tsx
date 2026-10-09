import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, ChevronDown, Play, Check, X, Loader2, AlertTriangle, CircleOff } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token') || '';
  return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
};

interface Fluxo { id: number; nome: string; ativo: boolean; blocos: number; reageAMensagens: boolean; soAMao?: boolean }

/**
 * Escolher qual o fluxo que atende ESTA conversa.
 *
 * Antes o sistema decidia sozinho, igual para toda a gente: entre os fluxos
 * ligados ganhava o do gatilho mais específico. Quem atende não tinha como
 * dizer "este cliente é para ser atendido por aquele fluxo", e o mesmo fluxo
 * não serve para todos os clientes.
 *
 * Há duas coisas diferentes, e por isso dois botões:
 *  - "Atender com este": a próxima mensagem do cliente é tratada por este fluxo.
 *  - "Começar agora": o fluxo arranca já e envia, sem o cliente escrever nada.
 */
export default function SeletorFluxo({
  conversaId, botPausado, onMudou
}: { conversaId: string; botPausado: boolean; onMudou?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [aviso, setAviso] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/whatsapp/conversations/${conversaId}/fluxo`);
      const d = await r.json();
      if (d.success) {
        setFluxos(d.fluxos || []);
        setEscolhido(d.escolhido ?? null);
        // O estado do bot vem de cima, do mesmo sitio que o interruptor ao lado.
        // Ter aqui uma copia propria fazia os dois contradizerem-se: o painel
        // dizia "pausado" enquanto o interruptor dizia "ativo", porque nenhum
        // avisava o outro quando mudava.
      }
    } catch { /* fica como está */ }
    setACarregar(false);
  }, [conversaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Fechar ao clicar fora, como qualquer menu.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const mostrarAviso = (texto: string) => { setAviso(texto); setTimeout(() => setAviso(''), 5000); };

  const atenderCom = async (f: Fluxo | null) => {
    setOcupado(f?.id ?? -1);
    try {
      const r = await authFetch(`${API}/api/whatsapp/conversations/${conversaId}/fluxo`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation_id: f?.id || null })
      });
      const d = await r.json();
      if (!d.success) { mostrarAviso(d.error || 'Não foi possível.'); return; }
      setEscolhido(f?.id ?? null);
      mostrarAviso(f ? `"${f.nome}" passa a atender esta conversa.` : 'Voltou à escolha automática do sistema.');
      onMudou?.();
    } finally {
      setOcupado(null);
    }
  };

  const comecarAgora = async (f: Fluxo, forcar = false) => {
    setOcupado(f.id);
    try {
      const r = await authFetch(`${API}/api/whatsapp/conversations/${conversaId}/fluxo/iniciar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation_id: f.id, forcar })
      });
      const d = await r.json();
      if (!d.success) {
        if (d.precisaConfirmar && window.confirm(`${d.error}\n\nComeçar "${f.nome}" à mesma?`)) {
          await comecarAgora(f, true);
          return;
        }
        mostrarAviso(d.error || 'Não foi possível começar.');
        return;
      }
      setEscolhido(f.id);
      setAberto(false);
      mostrarAviso(d.message || `"${f.nome}" começou.`);
      onMudou?.();
    } finally {
      setOcupado(null);
    }
  };

  const atual = fluxos.find(f => f.id === escolhido);

  return (
    <div ref={caixa} style={{ position: 'relative' }}>
      <button
        onClick={() => setAberto(v => !v)}
        title="Escolher o fluxo que atende este cliente"
        style={{
          display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 12px',
          background: atual ? '#E1EEF0' : '#D5D7DA',
          color: atual ? '#0E5A6B' : '#5B738B',
          border: atual ? '1px solid #0E5A6B' : 'none',
          borderRadius: '2px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, maxWidth: '190px'
        }}
      >
        <Zap size={15} style={{ flexShrink: 0 }} />
        <span className="wa-fluxo-nome" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {aCarregar ? 'A carregar...' : atual ? atual.nome : 'Escolher fluxo'}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0 }} />
      </button>

      {aviso && (
        <div style={{
          position: 'absolute', top: '40px', right: 0, zIndex: 60, width: '300px',
          background: '#1D2D3E', color: 'white', fontSize: '12.5px', padding: '9px 12px',
          borderRadius: '2px', lineHeight: 1.5, boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          {aviso}
        </div>
      )}

      {aberto && (
        <div style={{
          position: 'absolute', top: '40px', right: 0, zIndex: 50, width: '340px',
          background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.15)', maxHeight: '440px', display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E7E9EB' }}>
            <div style={{ fontWeight: 700, color: '#1D2D3E', fontSize: '13.5px' }}>Quem atende este cliente</div>
            <div style={{ fontSize: '12px', color: '#5B738B', marginTop: '3px', lineHeight: 1.5 }}>
              A escolha é só deste cliente — não mexe nos outros. Os fluxos ligados
              continuam a responder a toda a gente.
            </div>
          </div>

          {botPausado && (
            <div style={{ display: 'flex', gap: '7px', padding: '10px 14px', background: '#FCEFDD', color: '#8A4B0B', fontSize: '12px', lineHeight: 1.5 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              O bot está pausado para este cliente — nenhum fluxo responde até o retomar no interruptor ao lado.
            </div>
          )}

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {aCarregar && <div style={{ padding: '16px', fontSize: '13px', color: '#5B738B' }}>A carregar...</div>}

            {!aCarregar && fluxos.length === 0 && (
              <div style={{ padding: '20px 14px', fontSize: '13px', color: '#5B738B', lineHeight: 1.6 }}>
                Ainda não há fluxos. Crie um no <b>Autopilot</b>.
              </div>
            )}

            {fluxos.map(f => {
              const ativo = f.id === escolhido;
              return (
                <div key={f.id} style={{ padding: '10px 14px', borderTop: '1px solid #F0F1F2', background: ativo ? '#F5FAFB' : 'white' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Um fluxo "so a mao" nao tem ligado/desligado que faca sentido:
                        ele nunca responde sozinho, so corre quando alguem o manda. */}
                    <span style={{
                      width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                      background: f.soAMao ? '#0E5A6B' : f.ativo ? '#107E3E' : '#C6CDD4'
                    }}
                      title={f.soAMao ? 'Só corre quando alguém o mandar' : f.ativo ? 'Ligado — responde a toda a gente' : 'Desligado'} />
                    <span style={{ flex: 1, fontSize: '13.5px', fontWeight: ativo ? 700 : 500, color: '#1D2D3E', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.nome}
                    </span>
                    {ativo && <Check size={15} color="#0E5A6B" />}
                  </div>

                  <div style={{ fontSize: '11.5px', color: '#8996A3', margin: '3px 0 8px', paddingLeft: '15px' }}>
                    {f.blocos} bloco{f.blocos === 1 ? '' : 's'}
                    {f.soAMao
                      ? ' · só à mão — nunca responde sozinho'
                      : f.ativo
                        ? ' · ligado, responde a toda a gente'
                        : ' · desligado no Autopilot'}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', paddingLeft: '15px' }}>
                    {!ativo && (
                      <button
                        onClick={() => atenderCom(f)}
                        disabled={(!f.ativo && !f.soAMao) || ocupado !== null}
                        title={(f.ativo || f.soAMao) ? 'A próxima mensagem deste cliente é tratada por este fluxo' : 'Ligue o fluxo no Autopilot primeiro'}
                        style={{ padding: '5px 10px', background: 'white', color: (f.ativo || f.soAMao) ? '#0E5A6B' : '#B8C2CC', border: `1px solid ${(f.ativo || f.soAMao) ? '#0E5A6B' : '#D5D7DA'}`, borderRadius: '2px', fontSize: '12px', fontWeight: 600, cursor: (f.ativo || f.soAMao) ? 'pointer' : 'not-allowed' }}
                      >
                        {ocupado === f.id ? <Loader2 size={12} className="spin" /> : 'Atender com este'}
                      </button>
                    )}
                    <button
                      onClick={() => comecarAgora(f)}
                      disabled={ocupado !== null}
                      title="Começa já e envia, sem esperar que o cliente escreva"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', fontSize: '12px', fontWeight: 600, cursor: ocupado !== null ? 'wait' : 'pointer' }}
                    >
                      {ocupado === f.id ? <Loader2 size={12} className="spin" /> : <Play size={12} />} Começar agora
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {escolhido && (
            <button
              onClick={() => atenderCom(null)}
              disabled={ocupado !== null}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderTop: '1px solid #E7E9EB', background: 'white', border: 'none', color: '#5B738B', fontSize: '12.5px', cursor: 'pointer', fontWeight: 600 }}
            >
              <CircleOff size={13} /> Largar — voltar à escolha automática
            </button>
          )}
        </div>
      )}
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
