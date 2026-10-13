import { useState } from 'react';
import {
  Plus, X, ChevronUp, ChevronDown, Image as ImagemIcone,
  MessageSquare, List as ListaIcone, Type, AlertTriangle, Layers,
} from 'lucide-react';
import EditorBlocos from './EditorBlocos';
import type { Bloco } from './EditorBlocos';
import CampoFicheiro from './CampoFicheiro';
import { useCanalBotoes } from './useCanalBotoes';
import { formatoPrevisto } from './PreVisualizacaoEscolha';
import MediaWhatsApp from '../whatsapp/MediaWhatsApp';

/**
 * Montar um menu a ver o que o cliente vai receber.
 *
 * O painel antigo era um formulário: campos empilhados, e a pessoa só descobria
 * o resultado depois de gravar e de escrever para o número. Não se via que
 * formato ia sair, nem o que cada opção levava consigo, nem onde ela ia dar.
 *
 * Aqui há duas colunas. À esquerda monta-se; à direita está o telemóvel, com a
 * mensagem exactamente como ela chega — a capa, a pergunta, os botões ou o menu
 * a abrir, os grupos. Clicar numa opção abre o que ela leva: um texto, uma foto,
 * um PDF, uma pausa. É a mesma peça que desenha a conversa a sério, por isso o
 * que se vê aqui não é uma aproximação.
 */

export interface OpcaoMenu {
  id: string;
  label: string;
  matchValue: string;
  descricao?: string;
  seccao?: string;
  blocos?: Bloco[];
}

export interface Cabecalho {
  tipo?: 'texto' | 'imagem' | 'video' | 'documento';
  texto?: string;
  url?: string;
  nomeDoFicheiro?: string;
}

const LIMITE_BOTOES = 3;
const LIMITE_LISTA = 10;

const campo: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  border: '1px solid #D5D7DA', borderRadius: '6px', fontSize: '12.5px',
  outline: 'none', fontFamily: 'inherit', color: '#1D2D3E',
};

const rotulo: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700,
  letterSpacing: '.04em', color: '#475569', margin: '16px 0 7px',
};

/** As opções pela ordem dos grupos, como o servidor as agrupa. */
function agrupar(opcoes: OpcaoMenu[]): { titulo: string; opcoes: OpcaoMenu[] }[] {
  const ordem: string[] = [];
  const grupos: Record<string, OpcaoMenu[]> = {};
  for (const o of opcoes) {
    const chave = (o.seccao || '').trim();
    if (!grupos[chave]) { grupos[chave] = []; ordem.push(chave); }
    grupos[chave].push(o);
  }
  return ordem.map(t => ({ titulo: t, opcoes: grupos[t] }));
}

export default function ConstrutorMenu({
  pergunta, opcoes, cabecalho, rodape, textoDoBotao,
  aoMudarPergunta, aoMudarOpcoes, aoMudarCabecalho, aoMudarRodape, aoMudarTextoDoBotao,
}: {
  pergunta: string;
  opcoes: OpcaoMenu[];
  cabecalho?: Cabecalho;
  rodape?: string;
  textoDoBotao?: string;
  aoMudarPergunta: (v: string) => void;
  aoMudarOpcoes: (o: OpcaoMenu[]) => void;
  aoMudarCabecalho: (c: Cabecalho | undefined) => void;
  aoMudarRodape: (v: string) => void;
  aoMudarTextoDoBotao: (v: string) => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const { botoesFiaveis, listaDisponivel } = useCanalBotoes();

  const validas = opcoes.filter(o => (o.label || '').trim());
  const formato = formatoPrevisto(validas.length, listaDisponivel, botoesFiaveis);
  const cab = cabecalho || {};

  const mudar = (id: string, patch: Partial<OpcaoMenu>) =>
    aoMudarOpcoes(opcoes.map(o => (o.id === id ? { ...o, ...patch } : o)));

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= opcoes.length) return;
    const copia = [...opcoes];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    aoMudarOpcoes(copia);
  };

  const acrescentar = () => {
    const id = `op_${Date.now().toString(36)}`;
    aoMudarOpcoes([...opcoes, { id, label: '', matchValue: String(opcoes.length + 1) }]);
    setAberta(id);
  };

  const remover = (id: string) => {
    aoMudarOpcoes(opcoes.filter(o => o.id !== id));
    if (aberta === id) setAberta(null);
  };

  const comoChega =
    formato === 'botoes' ? { nome: 'Botões a clicar', icone: MessageSquare, cor: '#0E5A6B' }
      : formato === 'lista' ? { nome: 'Menu que abre', icone: ListaIcone, cor: '#7C3AED' }
        : { nome: 'Lista numerada', icone: Type, cor: '#5B738B' };
  const Icone = comoChega.icone;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 272px', gap: '16px', alignItems: 'start' }}>

      {/* ───────────────── montar ───────────────── */}
      <div style={{ minWidth: 0 }}>
        <label style={rotulo}>CAPA (OPCIONAL)</label>
        <select
          style={{ ...campo, marginBottom: cab.tipo ? '7px' : 0 }}
          value={cab.tipo || 'nada'}
          onChange={e => {
            const t = e.target.value;
            aoMudarCabecalho(t === 'nada' ? undefined : { ...cab, tipo: t as any });
          }}
        >
          <option value="nada">Nada — só a pergunta</option>
          <option value="texto">Uma linha de texto</option>
          <option value="imagem">Uma imagem</option>
          <option value="video">Um vídeo</option>
          <option value="documento">Um documento</option>
        </select>

        {cab.tipo === 'texto' && (
          <input
            style={campo}
            value={cab.texto || ''}
            onChange={e => aoMudarCabecalho({ ...cab, texto: e.target.value })}
            placeholder="Ex: Residencial Paraíso (máx. 60 letras)"
          />
        )}

        {cab.tipo && cab.tipo !== 'texto' && (
          <CampoFicheiro
            tipo={cab.tipo}
            url={cab.url || ''}
            nome={cab.nomeDoFicheiro}
            aoMudar={p => aoMudarCabecalho({ ...cab, url: p.url, nomeDoFicheiro: p.nomeDoFicheiro })}
          />
        )}

        <label style={rotulo}>A PERGUNTA</label>
        <textarea
          style={{ ...campo, minHeight: '58px', resize: 'vertical' }}
          value={pergunta}
          onChange={e => aoMudarPergunta(e.target.value)}
          placeholder="Como posso ajudar?"
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <label style={rotulo}>AS OPÇÕES</label>
          <span style={{ fontSize: '11px', color: '#8696A0', marginTop: '9px' }}>
            {validas.length}
            {formato === 'botoes' && ` de ${LIMITE_BOTOES}`}
            {formato === 'lista' && ` de ${LIMITE_LISTA}`}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {opcoes.map((o, i) => {
            const ligada = aberta === o.id;
            const quantosBlocos = (o.blocos || []).length;
            return (
              <div
                key={o.id}
                style={{
                  border: `1px solid ${ligada ? '#9FC4CC' : '#E2E8F0'}`,
                  borderRadius: '9px', background: ligada ? '#F8FCFD' : '#fff', overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 9px' }}>
                  <span style={{
                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    background: '#E1EEF0', color: '#0E5A6B', fontSize: '11px', fontWeight: 700,
                    display: 'grid', placeItems: 'center',
                  }}>{i + 1}</span>

                  <input
                    style={{ ...campo, fontWeight: 600, border: 'none', padding: '2px 0', flex: 1 }}
                    value={o.label}
                    onChange={e => mudar(o.id, { label: e.target.value })}
                    placeholder="O que o cliente lê. Ex: Ver preços"
                    onFocus={() => setAberta(o.id)}
                  />

                  {quantosBlocos > 0 && (
                    <span
                      title={`${quantosBlocos} coisa(s) que esta opção envia`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0,
                        fontSize: '10.5px', fontWeight: 700, color: '#0E5A6B',
                        background: '#E1EEF0', borderRadius: '999px', padding: '2px 7px',
                      }}
                    >
                      <Layers size={10} /> {quantosBlocos}
                    </span>
                  )}

                  <button onClick={() => mover(i, -1)} disabled={i === 0} title="Subir"
                    style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E2E8F0' : '#94A3B8', padding: 0, display: 'flex' }}>
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => mover(i, 1)} disabled={i === opcoes.length - 1} title="Descer"
                    style={{ background: 'none', border: 'none', cursor: i === opcoes.length - 1 ? 'default' : 'pointer', color: i === opcoes.length - 1 ? '#E2E8F0' : '#94A3B8', padding: 0, display: 'flex' }}>
                    <ChevronDown size={14} />
                  </button>
                  <button onClick={() => remover(o.id)} title="Remover"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', padding: 0, display: 'flex' }}>
                    <X size={14} />
                  </button>
                </div>

                {ligada && (
                  <div style={{ padding: '0 9px 10px 39px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <input
                      style={{ ...campo, fontSize: '12px' }}
                      value={o.matchValue || ''}
                      onChange={e => mudar(o.id, { matchValue: e.target.value })}
                      placeholder="Palavra que também serve, se escreverem. Ex: preços"
                    />
                    <div style={{ display: 'flex', gap: '7px' }}>
                      <input
                        style={{ ...campo, fontSize: '12px' }}
                        value={o.seccao || ''}
                        onChange={e => mudar(o.id, { seccao: e.target.value })}
                        placeholder="Grupo. Ex: Quartos"
                      />
                      <input
                        style={{ ...campo, fontSize: '12px' }}
                        value={o.descricao || ''}
                        onChange={e => mudar(o.id, { descricao: e.target.value })}
                        placeholder="Linha de baixo (só no menu)"
                      />
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.04em', color: '#475569', marginTop: '4px' }}>
                      O QUE ESTA OPÇÃO ENVIA
                    </div>
                    <div style={{ fontSize: '11px', color: '#8696A0', lineHeight: 1.6, marginTop: '-3px' }}>
                      Sai assim que o cliente tocar, sem precisar de outro nó. Para a conversa
                      continuar noutro sítio, ligue a saída desta opção no desenho.
                    </div>
                    <EditorBlocos
                      blocos={o.blocos || []}
                      aoMudar={b => mudar(o.id, { blocos: b })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={acrescentar}
          style={{
            marginTop: '9px', width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '6px', padding: '9px', background: '#fff',
            color: '#0E5A6B', border: '1px dashed #9FC4CC', borderRadius: '8px',
            cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          <Plus size={14} /> Adicionar opção
        </button>

        <label style={rotulo}>DETALHES</label>
        <div style={{ display: 'flex', gap: '7px' }}>
          <input
            style={{ ...campo, fontSize: '12px' }}
            value={rodape || ''}
            onChange={e => aoMudarRodape(e.target.value)}
            placeholder="Linha pequena por baixo (opcional)"
          />
          {formato === 'lista' && (
            <input
              style={{ ...campo, fontSize: '12px' }}
              value={textoDoBotao || ''}
              onChange={e => aoMudarTextoDoBotao(e.target.value)}
              placeholder="Botão que abre: Ver opções"
            />
          )}
        </div>
      </div>

      {/* ───────────────── o telemóvel ───────────────── */}
      <div style={{ position: 'sticky', top: '10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '7px',
          fontSize: '11px', fontWeight: 700, letterSpacing: '.04em', color: '#5B738B',
        }}>
          COMO CHEGA
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto',
            fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px',
            background: '#F1F5F9', color: comoChega.cor,
          }}>
            <Icone size={10} /> {comoChega.nome}
          </span>
        </div>

        <div style={{
          background: '#EFE7DE', borderRadius: '12px', padding: '12px 10px',
          border: '1px solid #E2E8F0', maxHeight: '560px', overflowY: 'auto',
        }}>
          {/* A bolha */}
          <div style={{
            background: '#fff', borderRadius: '8px', padding: '7px 9px 6px',
            boxShadow: '0 1px 1px rgba(11,20,26,0.13)', fontSize: '13.5px',
            color: '#111b21', lineHeight: 1.45,
          }}>
            {cab.tipo === 'texto' && cab.texto?.trim() && (
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>{cab.texto}</div>
            )}
            {cab.tipo && cab.tipo !== 'texto' && cab.url && (
              <div style={{ marginBottom: '6px' }}>
                <MediaWhatsApp tipo={cab.tipo} url={cab.url} nome={cab.nomeDoFicheiro} />
              </div>
            )}

            <div style={{ whiteSpace: 'pre-wrap' }}>{pergunta || 'A sua pergunta aparece aqui.'}</div>

            {rodape?.trim() && (
              <div style={{ fontSize: '11.5px', color: '#8696A0', marginTop: '4px' }}>{rodape}</div>
            )}

            {/* Botões colados, quando é o caso */}
            {formato === 'botoes' && validas.length > 0 && (
              <div style={{ marginTop: '7px', borderTop: '1px solid #E9EDEF', paddingTop: '5px' }}>
                {validas.slice(0, LIMITE_BOTOES).map(o => (
                  <div key={o.id}
                    onClick={() => setAberta(o.id)}
                    style={{
                      textAlign: 'center', color: '#0E5A6B', fontSize: '13px', fontWeight: 500,
                      padding: '7px 0', borderTop: '1px solid #E9EDEF', cursor: 'pointer',
                    }}>
                    {o.label.trim()}
                  </div>
                ))}
              </div>
            )}

            {/* O botão que abre o menu */}
            {formato === 'lista' && validas.length > 0 && (
              <div style={{
                marginTop: '7px', borderTop: '1px solid #E9EDEF', paddingTop: '7px',
                textAlign: 'center', color: '#0E5A6B', fontSize: '13px', fontWeight: 500,
              }}>
                ☰ {textoDoBotao?.trim() || 'Ver opções'}
              </div>
            )}
          </div>

          {/* A janela do menu, ou os números */}
          {validas.length > 0 && formato !== 'botoes' && (
            <div style={{
              marginTop: '9px', background: '#fff', borderRadius: '8px',
              boxShadow: '0 1px 1px rgba(11,20,26,0.13)', overflow: 'hidden',
            }}>
              {agrupar(validas).map((g, gi) => (
                <div key={gi}>
                  {formato === 'lista' && g.titulo && (
                    <div style={{
                      padding: '7px 10px 3px', fontSize: '11px', fontWeight: 700,
                      color: '#0E5A6B', textTransform: 'uppercase', letterSpacing: '.03em',
                    }}>
                      {g.titulo}
                    </div>
                  )}
                  {g.opcoes.map((o, oi) => {
                    const n = validas.indexOf(o) + 1;
                    return (
                      <div
                        key={o.id}
                        onClick={() => setAberta(o.id)}
                        style={{
                          padding: '8px 10px', cursor: 'pointer',
                          borderTop: gi === 0 && oi === 0 ? 'none' : '1px solid #F0F2F5',
                          background: aberta === o.id ? '#F4FAFB' : 'transparent',
                        }}
                      >
                        <div style={{ fontSize: '13px', color: '#111b21' }}>
                          {formato === 'texto' ? `${n} - ` : ''}{o.label.trim()}
                        </div>
                        {formato === 'lista' && o.descricao?.trim() && (
                          <div style={{ fontSize: '11.5px', color: '#8696A0', marginTop: '1px' }}>
                            {o.descricao}
                          </div>
                        )}
                        {(o.blocos || []).length > 0 && (
                          <div style={{ fontSize: '10.5px', color: '#0E5A6B', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Layers size={9} /> envia {(o.blocos || []).length} coisa(s)
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {validas.length === 0 && (
            <div style={{ marginTop: '9px', fontSize: '11.5px', color: '#8696A0', textAlign: 'center', lineHeight: 1.6 }}>
              Ainda sem opções.<br />Acrescente uma à esquerda.
            </div>
          )}
        </div>

        {/* Avisos que evitam uma mensagem recusada pelo WhatsApp */}
        {formato === 'texto' && validas.length > 0 && validas.length <= LIMITE_LISTA && (
          <Aviso tom="neutro">
            Para o cliente <b>tocar</b> em vez de escrever, o número tem de estar ligado pela
            API oficial da Meta.
          </Aviso>
        )}
        {validas.length > LIMITE_LISTA && (
          <Aviso tom="mau">
            <b>{validas.length} opções não cabem em nenhum formato clicável</b> — o máximo são {LIMITE_LISTA}.
            Divida este menu em dois.
          </Aviso>
        )}
        {formato === 'botoes' && validas.some(o => o.label.trim().length > 20) && (
          <Aviso tom="aviso">Um rótulo passa das 20 letras e será cortado no telemóvel.</Aviso>
        )}
        {formato === 'botoes' && validas.some(o => (o.seccao || '').trim()) && (
          <Aviso tom="neutro">
            Os <b>grupos</b> só aparecem a partir de 4 opções, quando o menu deixa de ser botões.
          </Aviso>
        )}
      </div>
    </div>
  );
}

function Aviso({ tom, children }: { tom: 'neutro' | 'aviso' | 'mau'; children: React.ReactNode }) {
  const cores = {
    neutro: { bg: '#F8FAFC', borda: '#E2E8F0', cor: '#5B738B' },
    aviso: { bg: '#FFFBEB', borda: '#FDE68A', cor: '#92400E' },
    mau: { bg: '#FEF2F2', borda: '#FECACA', cor: '#B91C1C' },
  }[tom];

  return (
    <div style={{
      marginTop: '8px', padding: '8px 10px', borderRadius: '6px',
      background: cores.bg, border: `1px solid ${cores.borda}`, color: cores.cor,
      fontSize: '11.5px', lineHeight: 1.6, display: 'flex', gap: '6px', alignItems: 'flex-start',
    }}>
      {tom !== 'neutro' && <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />}
      <span>{children}</span>
    </div>
  );
}
