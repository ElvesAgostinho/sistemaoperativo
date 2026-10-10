import { useState, useEffect } from 'react';
import { X, Loader, RotateCcw, Check, ShieldAlert } from 'lucide-react';

/**
 * O painel onde o dono decide o que cada funcionário vê e faz.
 *
 * Antes disto, "permissões" eram cinco papéis fixos escritos no código do
 * ecrã: ou a pessoa era agente, ou era gestor de vendas, e levava com o pacote
 * inteiro. Não havia como dizer "este atende o WhatsApp mas não vê a
 * auditoria" — que é exactamente o que uma empresa precisa de poder dizer.
 *
 * As caixas são desenhadas a partir do que o servidor manda: só aparecem os
 * módulos que a empresa licenciou, porque dar o que não se comprou era
 * prometer um botão que não ia abrir nada.
 */

const NOME_DO_MODULO: Record<string, string> = {
  hr: 'RH & Triagem', crm: 'Vendas CRM', auto: 'Autopilot', wa: 'WhatsApp',
  data: 'Relatórios', chat: 'Assistente IA', kb: 'Conhecimento IA',
  email: 'Caixa de Email', reunioes: 'Reuniões', afiliados: 'Parcerias',
  contabilidade: 'Financeiro', agendamento: 'Agendamento', documentos: 'Documentos',
};

interface Accao { chave: string; nome: string; descricao: string; modulo?: string }

export default function PermissoesFuncionario({ utilizador, aoFechar, aoGuardar }: {
  utilizador: { id: string; nome?: string; role: string };
  aoFechar: () => void;
  aoGuardar?: () => void;
}) {
  const [aCarregar, setACarregar] = useState(true);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState('');

  const [modulosDaEmpresa, setModulosDaEmpresa] = useState<string[]>([]);
  const [accoesPossiveis, setAccoesPossiveis] = useState<Accao[]>([]);
  const [modulos, setModulos] = useState<string[]>([]);
  const [accoes, setAccoes] = useState<string[]>([]);
  const [proprias, setProprias] = useState(false);

  const API = import.meta.env.VITE_API_URL;
  const cabecalho = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('os_auth_token')}`,
  });

  useEffect(() => {
    (async () => {
      setACarregar(true); setErro('');
      try {
        const [cat, pes] = await Promise.all([
          fetch(`${API}/api/users/permissoes/catalogo`, { headers: cabecalho() }).then(r => r.json()),
          fetch(`${API}/api/users/${utilizador.id}/permissoes`, { headers: cabecalho() }).then(r => r.json()),
        ]);
        if (!cat.success) throw new Error(cat.error || 'Não foi possível ler os módulos da empresa.');
        if (!pes.success) throw new Error(pes.error || 'Não foi possível ler as permissões.');

        setModulosDaEmpresa(cat.modulos || []);
        setAccoesPossiveis(cat.accoes || []);
        setModulos(pes.modulos || []);
        setAccoes(pes.accoes || []);
        setProprias(!!pes.proprias);
      } catch (e: any) {
        setErro(e.message);
      } finally {
        setACarregar(false);
      }
    })();
  }, [utilizador.id]);

  const alternar = (lista: string[], pôr: (v: string[]) => void, valor: string) =>
    pôr(lista.includes(valor) ? lista.filter(x => x !== valor) : [...lista, valor]);

  const gravar = async (repor = false) => {
    setAGravar(true); setErro('');
    try {
      const r = await fetch(`${API}/api/users/${utilizador.id}/permissoes`, {
        method: 'PUT', headers: cabecalho(),
        body: JSON.stringify(repor ? { repor: true } : { modulos, accoes }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Não foi possível guardar.');
      aoGuardar?.();
      aoFechar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setAGravar(false);
    }
  };

  // Uma acção de um módulo fechado não faz nada. Mostrá-la ligada só confundia
  // quem está a configurar, por isso fica cinzenta e explicada.
  const accaoDisponivel = (a: Accao) => !a.modulo || modulos.includes(a.modulo);

  const caixa = (ligado: boolean, inactivo: boolean) => ({
    width: '18px', height: '18px', flexShrink: 0, borderRadius: '3px',
    border: `1.5px solid ${inactivo ? '#cbd5e1' : ligado ? '#0E5A6B' : '#94a3b8'}`,
    background: inactivo ? '#f1f5f9' : ligado ? '#0E5A6B' : '#fff',
    display: 'grid', placeItems: 'center',
    transition: 'background .15s ease, border-color .15s ease',
  } as React.CSSProperties);

  return (
    <div
      onClick={aoFechar}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 3000,
        display: 'grid', placeItems: 'center', padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '4px', width: 'min(640px, 100%)',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,.25)',
        }}
      >
        {/* cabeçalho */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #E7E9EB',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', color: '#1D2D3E' }}>
              Permissões de {utilizador.nome || 'funcionário'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#5B738B' }}>
              {proprias
                ? 'Esta pessoa tem permissões próprias, definidas por si.'
                : `A seguir o que um perfil "${utilizador.role}" dá por omissão. Ao guardar, passa a ter as suas.`}
            </p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B738B', padding: '2px' }}>
            <X size={20} />
          </button>
        </div>

        {/* corpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {aCarregar ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#5B738B' }}>
              <Loader size={22} className="girar" /> A carregar...
            </div>
          ) : (
            <>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', color: '#5B738B', margin: '0 0 10px' }}>
                MÓDULOS QUE PODE ABRIR
              </div>

              {modulosDaEmpresa.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: '#b45309', marginBottom: '20px' }}>
                  A sua empresa não tem módulos licenciados.
                </div>
              ) : (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                  gap: '7px', marginBottom: '26px',
                }}>
                  {modulosDaEmpresa.map(m => {
                    const ligado = modulos.includes(m);
                    return (
                      <label key={m} style={{
                        display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer',
                        padding: '9px 11px', borderRadius: '3px',
                        border: `1px solid ${ligado ? '#0E5A6B' : '#E2E8F0'}`,
                        background: ligado ? '#E1EEF0' : '#fff',
                        transition: 'background .15s ease, border-color .15s ease',
                      }}>
                        <input type="checkbox" checked={ligado} onChange={() => alternar(modulos, setModulos, m)}
                          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                        <span style={caixa(ligado, false)}>
                          {ligado && <Check size={12} color="#fff" strokeWidth={3} />}
                        </span>
                        <span style={{ fontSize: '13px', color: '#1D2D3E', fontWeight: ligado ? 600 : 400 }}>
                          {NOME_DO_MODULO[m] || m}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', color: '#5B738B', margin: '0 0 4px' }}>
                O QUE PODE FAZER
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#5B738B', lineHeight: 1.55 }}>
                O trabalho do dia-a-dia vem com o módulo. Aqui ficam as coisas que
                convém dar de propósito a quem de direito.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {accoesPossiveis.map(a => {
                  const disponivel = accaoDisponivel(a);
                  const ligado = disponivel && accoes.includes(a.chave);
                  return (
                    <label key={a.chave} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      padding: '10px 12px', borderRadius: '3px',
                      border: `1px solid ${ligado ? '#0E5A6B' : '#E2E8F0'}`,
                      background: !disponivel ? '#F8FAFC' : ligado ? '#E1EEF0' : '#fff',
                      cursor: disponivel ? 'pointer' : 'not-allowed',
                      opacity: disponivel ? 1 : 0.6,
                      transition: 'background .15s ease, border-color .15s ease',
                    }}>
                      <input type="checkbox" checked={ligado} disabled={!disponivel}
                        onChange={() => alternar(accoes, setAccoes, a.chave)}
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                      <span style={{ ...caixa(ligado, !disponivel), marginTop: '1px' }}>
                        {ligado && <Check size={12} color="#fff" strokeWidth={3} />}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '13px', color: '#1D2D3E', fontWeight: ligado ? 600 : 500 }}>
                          {a.nome}
                        </span>
                        <span style={{ display: 'block', fontSize: '11.5px', color: '#5B738B', lineHeight: 1.5, marginTop: '2px' }}>
                          {disponivel
                            ? a.descricao
                            : `Precisa do módulo ${NOME_DO_MODULO[a.modulo!] || a.modulo}, que está desligado acima.`}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {erro && (
            <div style={{
              marginTop: '16px', padding: '11px 13px', borderRadius: '3px',
              background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
              fontSize: '12.5px', display: 'flex', gap: '8px', alignItems: 'flex-start',
            }}>
              <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: '1px' }} /> {erro}
            </div>
          )}
        </div>

        {/* rodapé */}
        <div style={{
          padding: '14px 22px', borderTop: '1px solid #E7E9EB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        }}>
          <button
            onClick={() => gravar(true)}
            disabled={aGravar || aCarregar || !proprias}
            title={proprias ? 'Voltar ao que o perfil dá por omissão' : 'Já está no normal do perfil'}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', fontSize: '12.5px',
              color: proprias ? '#5B738B' : '#CBD5E1',
              cursor: proprias && !aGravar ? 'pointer' : 'default', padding: '6px 0',
            }}
          >
            <RotateCcw size={14} /> Repor o normal do perfil
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={aoFechar} disabled={aGravar}
              style={{
                padding: '8px 16px', borderRadius: '2px', border: '1px solid #D5D7DA',
                background: '#fff', color: '#1D2D3E', fontSize: '13px', cursor: 'pointer',
              }}>
              Cancelar
            </button>
            <button onClick={() => gravar(false)} disabled={aGravar || aCarregar}
              style={{
                padding: '8px 18px', borderRadius: '2px', border: 'none',
                background: aGravar ? '#7FA9B3' : '#0E5A6B', color: '#fff',
                fontSize: '13px', fontWeight: 600, cursor: aGravar ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '7px',
              }}>
              {aGravar && <Loader size={14} className="girar" />}
              {aGravar ? 'A guardar...' : 'Guardar permissões'}
            </button>
          </div>
        </div>
      </div>

      <style>{`.girar { animation: girar 1s linear infinite; } @keyframes girar { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
