import { useState, useEffect } from 'react';
import { MessageSquare, List, BarChart3, Type, AlertTriangle } from 'lucide-react';

/**
 * Como é que esta pergunta vai mesmo chegar ao telemóvel do cliente.
 *
 * O painel não dizia nada disto: escrevia-se "1 - Preços / 2 - Reservar" à mão
 * na pergunta e esperava-se pelo melhor. Quem configura tem de ver, antes de
 * gravar, se aquilo vai sair como botões a clicar ou como uma lista de números
 * que o cliente tem de escrever — porque a diferença depende do NÚMERO de
 * opções e do canal, e isso não se adivinha.
 */

export interface OpcaoPreVisualizacao {
  id: string;
  label: string;
}

const LIMITES = { botoes: 3, lista: 10, sondagem: 12 };

export type FormatoPrevisto = 'botoes' | 'lista' | 'sondagem' | 'texto';

/** A mesma regra do servidor (WhatsAppInterativoService.formatoIdeal). */
export function formatoPrevisto(quantas: number, listaDisponivel: boolean, botoesFiaveis = false): FormatoPrevisto {
  if (quantas <= 0) return 'texto';
  // Num numero ligado pelo Baileys os botoes nao sao entregues — a Meta
  // deita-os fora em silencio. Ai o menu volta a ser a lista numerada.
  if (!botoesFiaveis) {
    return (quantas <= LIMITES.lista && listaDisponivel) ? 'lista' : 'texto';
  }
  if (quantas <= LIMITES.botoes) return 'botoes';
  if (quantas <= LIMITES.lista && listaDisponivel) return 'lista';
  return 'texto';
}

const EXPLICACAO: Record<FormatoPrevisto, { nome: string; icone: any; cor: string; nota: string }> = {
  botoes: {
    nome: 'Botões', icone: MessageSquare, cor: '#0E5A6B',
    nota: 'Até 3 opções aparecem como botões colados à mensagem. O cliente toca e pronto.',
  },
  lista: {
    nome: 'Menu', icone: List, cor: '#7C3AED',
    nota: 'Um botão que abre uma janela com as opções e as suas descrições.',
  },
  sondagem: {
    nome: 'Sondagem', icone: BarChart3, cor: '#B45309',
    nota: 'Uma votação onde o cliente toca na opção. Não é tão bonito como o menu, mas ninguém escreve.',
  },
  texto: {
    nome: 'Lista numerada', icone: Type, cor: '#64748B',
    nota: 'O cliente escreve o número da opção. É assim num número ligado por QR code: o WhatsApp não entrega botões a quem não usa a API oficial da Meta.',
  },
};

export default function PreVisualizacaoEscolha({ pergunta, opcoes }: {
  pergunta: string;
  opcoes: OpcaoPreVisualizacao[];
}) {
  // O que o canal desta empresa CONSEGUE mesmo enviar. Sem perguntar, a
  // pre-visualizacao desenhava botoes e o cliente recebia uma lista numerada —
  // uma pre-visualizacao que mente nao serve para nada.
  const [canal, setCanal] = useState<{ funcionam: boolean; provider: string | null } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/canal/botoes`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('os_auth_token')}` },
        });
        const d = await r.json();
        if (d.success) setCanal({ funcionam: d.funcionam, provider: d.provider });
      } catch { /* sem isto mostra-se o caso mais conservador */ }
    })();
  }, []);

  const botoesFiaveis = canal?.funcionam === true;
  const listaDisponivel = canal?.provider === 'meta';

  const validas = opcoes.filter(o => (o.label || '').trim());
  const formato = formatoPrevisto(validas.length, listaDisponivel, botoesFiaveis);
  const info = EXPLICACAO[formato];
  const Icone = info.icone;

  // Rótulos que o WhatsApp não aceita inteiros. Mostrar o corte aqui evita a
  // surpresa de o ver cortado só depois de o cliente o receber.
  const maxRotulo = formato === 'botoes' ? 20 : formato === 'lista' ? 24 : 100;
  const compridos = validas.filter(o => o.label.trim().length > maxRotulo);

  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px',
        fontSize: '11px', fontWeight: 700, letterSpacing: '.04em', color: '#5B738B',
      }}>
        COMO VAI CHEGAR
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '2px 9px', borderRadius: '999px', fontSize: '11px',
          background: info.cor + '18', color: info.cor, fontWeight: 700, letterSpacing: 0,
        }}>
          <Icone size={12} /> {info.nome}
        </span>
      </div>

      {/* O telemóvel */}
      <div style={{
        background: '#EFEAE2', borderRadius: '10px', padding: '12px',
        border: '1px solid #E2E8F0',
      }}>
        <div style={{
          background: '#fff', borderRadius: '8px', padding: '9px 11px',
          fontSize: '12.5px', color: '#111B21', lineHeight: 1.5,
          boxShadow: '0 1px 1px rgba(11,20,26,.08)', maxWidth: '92%',
        }}>
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {pergunta.trim() || <span style={{ color: '#B9C3CB' }}>(escreva a pergunta acima)</span>}
          </div>

          {/* Botões: colados por baixo, cada um com a sua linha */}
          {formato === 'botoes' && validas.length > 0 && (
            <div style={{ marginTop: '9px', borderTop: '1px solid #EDEFF1', paddingTop: '7px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {validas.map(o => (
                <div key={o.id} style={{
                  textAlign: 'center', padding: '7px', borderRadius: '6px',
                  background: '#F7F8FA', color: '#0E5A6B', fontSize: '12.5px', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {o.label.trim().slice(0, maxRotulo)}
                </div>
              ))}
            </div>
          )}

          {/* Menu: um botão só, que abre a janela */}
          {formato === 'lista' && validas.length > 0 && (
            <div style={{ marginTop: '9px', borderTop: '1px solid #EDEFF1', paddingTop: '7px' }}>
              <div style={{
                textAlign: 'center', padding: '7px', color: '#0E5A6B',
                fontSize: '12.5px', fontWeight: 600, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <List size={14} /> Ver opções
              </div>
            </div>
          )}

          {/* Sondagem: as opções com o seu círculo */}
          {formato === 'sondagem' && validas.length > 0 && (
            <div style={{ marginTop: '9px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {validas.slice(0, LIMITES.sondagem).map(o => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                  <span style={{
                    width: '14px', height: '14px', borderRadius: '50%',
                    border: '1.5px solid #B9C3CB', flexShrink: 0,
                  }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label.trim()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Texto: os números que o cliente tem de escrever */}
          {formato === 'texto' && validas.length > 0 && validas.length <= LIMITES.lista && (
            <div style={{ marginTop: '7px', color: '#54656F' }}>
              {validas.map((o, i) => <div key={o.id}>{i + 1} - {o.label.trim()}</div>)}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#5B738B', lineHeight: 1.6 }}>
        {info.nota}
      </div>

      {compridos.length > 0 && (
        <div style={{
          marginTop: '8px', padding: '8px 10px', borderRadius: '4px',
          background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E',
          fontSize: '11.5px', lineHeight: 1.6, display: 'flex', gap: '7px', alignItems: 'flex-start',
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            {compridos.length === 1 ? 'Um rótulo passa' : `${compridos.length} rótulos passam`} dos {maxRotulo} caracteres
            que este formato aceita e {compridos.length === 1 ? 'será cortado' : 'serão cortados'} no telemóvel.
          </span>
        </div>
      )}

      {formato === 'texto' && validas.length > 0 && (
        <div style={{
          marginTop: '8px', padding: '8px 10px', borderRadius: '4px',
          background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#5B738B',
          fontSize: '11.5px', lineHeight: 1.65,
        }}>
          Para o cliente poder <b>tocar</b> em vez de escrever, o número tem de estar
          ligado pela <b>API oficial da Meta</b>. Num número ligado por QR code o
          WhatsApp não entrega botões — a mensagem sai e nunca chega.
        </div>
      )}

      {validas.length > LIMITES.lista && (
        <div style={{
          marginTop: '8px', padding: '8px 10px', borderRadius: '4px',
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
          fontSize: '11.5px', lineHeight: 1.6, display: 'flex', gap: '7px', alignItems: 'flex-start',
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            <b>{validas.length} opções não cabem em nenhum formato clicável</b> — o máximo
            são {LIMITES.lista}, e isso só pela API oficial da Meta. Assim, o cliente escreve o
            número da opção. Divida este menu em dois se quiser que ele possa tocar.
          </span>
        </div>
      )}
    </div>
  );
}
