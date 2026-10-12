import { useState } from 'react';
import {
  Type, Image as ImagemIcone, Video, Mic, FileText, Clock,
  Plus, X, ChevronUp, ChevronDown, Link2, Phone, Copy, AlertTriangle,
} from 'lucide-react';
import { useCanalBotoes } from './useCanalBotoes';

/**
 * Vários blocos dentro de um nó de mensagem.
 *
 * Para mandar três mensagens e uma imagem eram precisos quatro nós ligados por
 * setas. Agora é um nó só, com os blocos a sair por ordem — e o fluxo deixa de
 * ser re-disparado a cada passo.
 *
 * Só entram aqui blocos de CONTEÚDO. Condição, Etiquetas, Notificar Equipa e
 * Requisição à API continuam a ser nós próprios: ramificam o fluxo ou mexem em
 * dados, e enterrá-los dentro de um cartão tornava o desenho ilegível.
 */

export type TipoBloco = 'texto' | 'imagem' | 'video' | 'audio' | 'documento' | 'pausa';
export type TipoBotao = 'link' | 'chamada' | 'copiar';

export interface BotaoAccao { tipo: TipoBotao; rotulo: string; valor: string }

export interface Bloco {
  tipo: TipoBloco;
  texto?: string;
  url?: string;
  duracao?: number;
  unidade?: string;
  botoes?: BotaoAccao[];
}

const CATALOGO: { tipo: TipoBloco; nome: string; nota: string; icone: any }[] = [
  { tipo: 'texto', nome: 'Texto', nota: 'Uma mensagem escrita, com botões se quiser', icone: Type },
  { tipo: 'imagem', nome: 'Imagem', nota: 'Uma foto, com legenda', icone: ImagemIcone },
  { tipo: 'video', nome: 'Vídeo', nota: 'Um vídeo, com legenda', icone: Video },
  { tipo: 'audio', nome: 'Áudio', nota: 'Uma nota de voz', icone: Mic },
  { tipo: 'documento', nome: 'Documento', nota: 'Um PDF ou outro ficheiro', icone: FileText },
  { tipo: 'pausa', nome: 'Pausa', nota: 'Esperar entre mensagens, para não parecer um robô', icone: Clock },
];

const BOTOES: { tipo: TipoBotao; nome: string; nota: string; icone: any; exemplo: string }[] = [
  { tipo: 'link', nome: 'Abrir link', nota: 'Um site, um vídeo do YouTube, um PDF', icone: Link2, exemplo: 'https://…' },
  { tipo: 'chamada', nome: 'Ligar', nota: 'Marca este número no telemóvel', icone: Phone, exemplo: '244 900 000 000' },
  { tipo: 'copiar', nome: 'Copiar código', nota: 'Copia um código de desconto, um IBAN', icone: Copy, exemplo: 'PROMO20' },
];

/**
 * Os nós que FALAM com o cliente, e por isso levam blocos.
 *
 * Tem de ser a mesma lista do servidor (AutomationEngine.ACCOES_COM_BLOCOS),
 * senão o painel oferece blocos num nó que nunca os envia — ou esconde-os num
 * que os enviaria. Há um teste a comparar as duas.
 *
 * REPLY_MESSAGE não está aqui porque é TODO feito de blocos: o painel dele é o
 * editor inteiro, não um editor por cima de outra coisa.
 */
export const ACCOES_COM_BLOCOS = [
  'AI_REPLY', 'HANDOFF_HUMAN', 'CHECK_SLOTS', 'CREATE_BOOKING',
  'LIST_BOOKINGS', 'SET_CUSTOM_FIELD', 'WAIT_REPLY',
];

/** O máximo de segundos que uma pausa dentro de um nó aguenta (igual ao servidor). */
export const PAUSA_MAX_SEGUNDOS = 30;

const campo: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  border: '1px solid #D5D7DA', borderRadius: '6px', fontSize: '12.5px',
  outline: 'none', fontFamily: 'inherit', color: '#1D2D3E',
};

export default function EditorBlocos({ blocos, aoMudar }: {
  blocos: Bloco[];
  aoMudar: (b: Bloco[]) => void;
}) {
  const [aEscolher, setAEscolher] = useState(false);

  // Prometer um botao que o canal nao entrega era o mesmo erro do simulador:
  // o painel dizia uma coisa e o cliente recebia outra.
  const { botoesFiaveis } = useCanalBotoes();

  const mudar = (i: number, patch: Partial<Bloco>) =>
    aoMudar(blocos.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const remover = (i: number) => aoMudar(blocos.filter((_, j) => j !== i));

  const mover = (i: number, direccao: -1 | 1) => {
    const j = i + direccao;
    if (j < 0 || j >= blocos.length) return;
    const copia = [...blocos];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    aoMudar(copia);
  };

  const acrescentar = (tipo: TipoBloco) => {
    const novo: Bloco = tipo === 'pausa'
      ? { tipo, duracao: 2, unidade: 'segundos' }
      : { tipo, texto: '' };
    aoMudar([...blocos, novo]);
    setAEscolher(false);
  };

  const mudarBotao = (iBloco: number, iBotao: number, patch: Partial<BotaoAccao>) => {
    const b = blocos[iBloco];
    const botoes = (b.botoes || []).map((x, j) => (j === iBotao ? { ...x, ...patch } : x));
    mudar(iBloco, { botoes });
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: '6px', marginBottom: '8px',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.04em', color: '#475569' }}>
          BLOCOS DESTA MENSAGEM
        </span>
        <span style={{ fontSize: '11px', color: '#8696A0' }}>{blocos.length}</span>
      </div>

      {blocos.length === 0 && (
        <div style={{
          padding: '18px 14px', textAlign: 'center', border: '1px dashed #D5D7DA',
          borderRadius: '8px', color: '#8696A0', fontSize: '12px', lineHeight: 1.6,
        }}>
          Ainda não há blocos.<br />Acrescente o primeiro em baixo.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {blocos.map((b, i) => {
          const def = CATALOGO.find(c => c.tipo === b.tipo) || CATALOGO[0];
          const Icone = def.icone;
          const botoes = b.botoes || [];

          return (
            <div key={i} style={{
              border: '1px solid #E2E8F0', borderRadius: '8px',
              background: '#FBFCFD', overflow: 'hidden',
            }}>
              {/* cabeçalho do bloco */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 9px', background: '#F1F5F7', borderBottom: '1px solid #E7EDEF',
              }}>
                <Icone size={14} color="#0E5A6B" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1D2D3E', flex: 1 }}>{def.nome}</span>

                <button onClick={() => mover(i, -1)} disabled={i === 0} title="Subir"
                  style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E2E8F0' : '#8696A0', padding: '1px', display: 'flex' }}>
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => mover(i, 1)} disabled={i === blocos.length - 1} title="Descer"
                  style={{ background: 'none', border: 'none', cursor: i === blocos.length - 1 ? 'default' : 'pointer', color: i === blocos.length - 1 ? '#E2E8F0' : '#8696A0', padding: '1px', display: 'flex' }}>
                  <ChevronDown size={14} />
                </button>
                <button onClick={() => remover(i)} title="Remover este bloco"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', padding: '1px', display: 'flex' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#DC2626'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#CBD5E1'; }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ padding: '9px 10px' }}>
                {b.tipo === 'texto' && (
                  <>
                    <textarea
                      style={{ ...campo, minHeight: '58px', resize: 'vertical' }}
                      value={b.texto || ''}
                      onChange={e => mudar(i, { texto: e.target.value })}
                      placeholder="O que escrever. Pode usar {{nome}}, {{empresa}}…"
                    />

                    {botoes.map((bt, j) => {
                      const defBt = BOTOES.find(x => x.tipo === bt.tipo) || BOTOES[0];
                      return (
                        <div key={j} style={{
                          marginTop: '7px', padding: '8px', borderRadius: '6px',
                          border: '1px solid #E2E8F0', background: '#fff',
                        }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                            <select
                              style={{ ...campo, width: 'auto', flex: '0 0 auto', padding: '5px 8px', fontSize: '12px' }}
                              value={bt.tipo}
                              onChange={e => mudarBotao(i, j, { tipo: e.target.value as TipoBotao })}
                            >
                              {BOTOES.map(x => <option key={x.tipo} value={x.tipo}>{x.nome}</option>)}
                            </select>
                            <span style={{ fontSize: '11px', color: '#8696A0', flex: 1 }}>{defBt.nota}</span>
                            <button
                              onClick={() => mudar(i, { botoes: botoes.filter((_, k) => k !== j) })}
                              title="Remover o botão"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', padding: 0, display: 'flex' }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                          <input
                            style={{ ...campo, marginBottom: '5px' }}
                            value={bt.rotulo}
                            onChange={e => mudarBotao(i, j, { rotulo: e.target.value })}
                            placeholder={botoesFiaveis
                              ? 'O que se lê no botão (máx. 20 letras)'
                              : 'O que se lê antes do endereço'}
                          />
                          <input
                            style={campo}
                            value={bt.valor}
                            onChange={e => mudarBotao(i, j, { valor: e.target.value })}
                            placeholder={defBt.exemplo}
                          />
                          {botoesFiaveis && bt.rotulo.trim().length > 20 && (
                            <div style={{ marginTop: '5px', fontSize: '11px', color: '#92400E', display: 'flex', gap: '5px', alignItems: 'center' }}>
                              <AlertTriangle size={11} /> O WhatsApp corta aos 20 caracteres.
                            </div>
                          )}

                          {/* Como isto chega MESMO, neste canal. */}
                          {!botoesFiaveis && (bt.rotulo.trim() || bt.valor.trim()) && (
                            <div style={{
                              marginTop: '6px', padding: '6px 8px', borderRadius: '4px',
                              background: '#F8FAFC', border: '1px solid #E2E8F0',
                              fontSize: '11px', color: '#5B738B', lineHeight: 1.6,
                            }}>
                              Chega escrito na mensagem:{' '}
                              <span style={{ color: '#1D2D3E', fontFamily: 'monospace' }}>
                                {(bt.rotulo.trim() || 'Rótulo')}: {(bt.valor.trim() || defBt.exemplo)}
                              </span>
                              <br />O WhatsApp torna o endereço clicável, por isso o cliente toca e abre.
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {botoes.length < 3 ? (
                      <button
                        onClick={() => mudar(i, { botoes: [...botoes, { tipo: 'link', rotulo: '', valor: '' }] })}
                        style={{
                          marginTop: '7px', width: '100%', padding: '7px', borderRadius: '6px',
                          border: '1px dashed #9FC4CC', background: '#fff', color: '#0E5A6B',
                          cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        }}
                      >
                        <Plus size={13} /> Adicionar botão
                      </button>
                    ) : (
                      <div style={{ marginTop: '7px', fontSize: '11px', color: '#8696A0', textAlign: 'center' }}>
                        {botoesFiaveis
                          ? 'Três botões é o máximo que o WhatsApp mostra.'
                          : 'Três é o máximo. Para mais endereços, escreva-os no texto do bloco.'}
                      </div>
                    )}
                  </>
                )}

                {['imagem', 'video', 'audio', 'documento'].includes(b.tipo) && (
                  <>
                    <input
                      style={{ ...campo, marginBottom: '6px' }}
                      value={b.url || ''}
                      onChange={e => mudar(i, { url: e.target.value })}
                      placeholder="Link do ficheiro (https://…)"
                    />
                    {b.tipo !== 'audio' && (
                      <input
                        style={campo}
                        value={b.texto || ''}
                        onChange={e => mudar(i, { texto: e.target.value })}
                        placeholder="Legenda (opcional)"
                      />
                    )}
                  </>
                )}

                {b.tipo === 'pausa' && (
                  <>
                    <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
                      <input
                        type="number" min={1} max={PAUSA_MAX_SEGUNDOS}
                        style={{ ...campo, width: '80px', textAlign: 'center', fontWeight: 600 }}
                        value={b.duracao || 1}
                        onChange={e => mudar(i, { duracao: Math.max(1, Number(e.target.value) || 1), unidade: 'segundos' })}
                      />
                      <span style={{ fontSize: '12.5px', color: '#5B738B' }}>segundos</span>
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#8696A0', lineHeight: 1.55 }}>
                      Para a conversa não parecer um robô a despejar tudo de uma vez.
                      Para esperar <b>horas ou dias</b>, use o nó <b>"Aguardar (pausa)"</b> —
                      esse guarda a espera e sobrevive a um reinício.
                    </div>
                    {(b.duracao || 0) > PAUSA_MAX_SEGUNDOS && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#92400E', display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
                        <AlertTriangle size={11} style={{ marginTop: '2px' }} />
                        Acima de {PAUSA_MAX_SEGUNDOS} segundos a pausa é encurtada aqui dentro.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* acrescentar */}
      {aEscolher ? (
        <div style={{
          marginTop: '9px', border: '1px solid #E2E8F0', borderRadius: '8px',
          background: '#fff', padding: '5px', boxShadow: '0 4px 14px rgba(11,20,26,.08)',
        }}>
          {CATALOGO.map(c => {
            const Icone = c.icone;
            return (
              <button
                key={c.tipo}
                onClick={() => acrescentar(c.tipo)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '9px', width: '100%',
                  padding: '8px 9px', borderRadius: '6px', border: 'none',
                  background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F5F6F6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Icone size={15} color="#0E5A6B" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#1D2D3E' }}>{c.nome}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: '#8696A0', marginTop: '1px' }}>{c.nota}</span>
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setAEscolher(false)}
            style={{
              width: '100%', padding: '7px', border: 'none', background: 'none',
              color: '#8696A0', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAEscolher(true)}
          style={{
            marginTop: '9px', width: '100%', padding: '10px', borderRadius: '8px',
            border: '1px dashed #9FC4CC', background: '#fff', color: '#0E5A6B',
            cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          <Plus size={14} /> Adicionar bloco
        </button>
      )}

      <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', lineHeight: 1.6 }}>
        Os blocos saem por esta ordem, um a seguir ao outro, sem o fluxo ser
        re-disparado. Os botões de <b>link</b> e de <b>ligar</b> não precisam de
        saída no desenho — o cliente sai do WhatsApp. Para botões que <b>continuam
        o fluxo</b>, use o nó <b>Menu</b>, que é quem sabe esperar pela escolha.
      </div>
    </div>
  );
}
