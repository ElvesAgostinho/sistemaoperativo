import { useMemo } from 'react';
import { Plus, Volume2, VolumeX, MessageSquare } from 'lucide-react';

/**
 * A coluna das conversas do Assistente.
 *
 * Era uma pilha de caixas com borda, todas iguais, encostadas umas às outras
 * numa coluna de 300px — os títulos saíam fora e não se percebia qual era a
 * conversa de hoje e qual era a do mês passado.
 *
 * Agora segue o desenho a que toda a gente está habituada nestes assistentes:
 * o botão de começar em cima, as conversas agrupadas por quando foram, e cada
 * uma apenas como uma linha de texto que se ilumina ao passar o rato. Sem
 * bordas: a separação faz-se pelo espaço, não por traços.
 */

export interface ConversaResumo {
  id: number;
  titulo: string;
  data_criacao: string;
}

/** "Hoje", "Ontem", "7 dias anteriores", "Mais antigas". */
function grupoDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Mais antigas';

  const soDia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((soDia(new Date()) - soDia(d)) / 86400000);

  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias <= 7) return '7 dias anteriores';
  if (dias <= 30) return '30 dias anteriores';
  return 'Mais antigas';
}

const ORDEM = ['Hoje', 'Ontem', '7 dias anteriores', '30 dias anteriores', 'Mais antigas'];

export default function BarraConversas({
  conversas, actual, aoAbrir, aoComecar, vozLigada, aoAlternarVoz,
}: {
  conversas: ConversaResumo[];
  actual: number | null;
  aoAbrir: (id: number) => void;
  aoComecar: () => void;
  vozLigada: boolean;
  aoAlternarVoz: () => void;
}) {
  const grupos = useMemo(() => {
    const porGrupo = new Map<string, ConversaResumo[]>();
    for (const c of conversas) {
      const g = grupoDe(c.data_criacao);
      if (!porGrupo.has(g)) porGrupo.set(g, []);
      porGrupo.get(g)!.push(c);
    }
    return ORDEM.filter(g => porGrupo.has(g)).map(g => ({ nome: g, itens: porGrupo.get(g)! }));
  }, [conversas]);

  return (
    <div style={{
      width: '272px', flexShrink: 0, borderRight: '1px solid #E7E9EB',
      background: '#FAFAFA', display: 'flex', flexDirection: 'column',
    }}>
      {/* começar e voz */}
      <div style={{ padding: '12px 10px 8px', display: 'flex', gap: '7px' }}>
        <button
          onClick={aoComecar}
          className="ia-novo"
          style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', gap: '9px',
            padding: '10px 12px', borderRadius: '9px',
            border: '1px solid #E0E2E4', background: '#fff',
            color: '#1D2D3E', fontSize: '13.5px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <Plus size={16} color="#0E5A6B" /> Nova conversa
        </button>

        <button
          onClick={aoAlternarVoz}
          title={vozLigada ? 'Desligar a voz do assistente' : 'Ligar a voz do assistente'}
          className="ia-voz"
          style={{
            width: '40px', borderRadius: '9px', cursor: 'pointer',
            border: '1px solid ' + (vozLigada ? '#0E5A6B' : '#E0E2E4'),
            background: vozLigada ? '#E1EEF0' : '#fff',
            color: vozLigada ? '#0E5A6B' : '#8696A0',
            display: 'grid', placeItems: 'center',
          }}
        >
          {vozLigada ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
      </div>

      {/* as conversas */}
      <div className="ia-lista" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 16px' }}>
        {conversas.length === 0 ? (
          <div style={{
            padding: '36px 14px', textAlign: 'center', color: '#8696A0',
            fontSize: '12.5px', lineHeight: 1.7,
          }}>
            <MessageSquare size={22} color="#CBD5E1" style={{ marginBottom: '10px' }} />
            <br />
            Ainda não falou com o assistente.<br />
            Comece acima e pergunte-lhe o que quiser sobre o seu negócio.
          </div>
        ) : grupos.map(g => (
          <div key={g.nome} style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '11px', fontWeight: 600, color: '#8696A0',
              padding: '6px 10px 5px', letterSpacing: '.02em',
            }}>
              {g.nome}
            </div>

            {g.itens.map(c => {
              const activa = actual === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => aoAbrir(c.id)}
                  title={c.titulo}
                  className={'ia-conversa' + (activa ? ' ia-conversa-activa' : '')}
                >
                  {/* Um título vazio aconteceria numa conversa gravada antes de
                      a IA lhe dar nome; "Sem título" lê-se melhor do que nada. */}
                  {c.titulo?.trim() || 'Sem título'}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <style>{`
        .ia-novo:hover, .ia-voz:hover { background: #F0F2F5; }
        .ia-novo, .ia-voz { transition: background .15s ease, border-color .15s ease; }

        .ia-conversa {
          display: block; width: 100%; text-align: left;
          padding: 8px 10px; border: none; background: transparent;
          border-radius: 7px; cursor: pointer; font-family: inherit;
          font-size: 13.5px; color: #1D2D3E; line-height: 1.45;
          /* Uma linha só, cortada: os títulos vêm da IA e podem ser longos. */
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          transition: background .12s ease;
        }
        .ia-conversa:hover { background: #EFF1F3; }
        .ia-conversa-activa, .ia-conversa-activa:hover {
          background: #E1EEF0; color: #0E5A6B; font-weight: 600;
        }

        .ia-lista::-webkit-scrollbar { width: 6px; }
        .ia-lista::-webkit-scrollbar-thumb { background: #D4D4D4; border-radius: 3px; }
        .ia-lista::-webkit-scrollbar-track { background: transparent; }

        @media (prefers-reduced-motion: reduce) {
          .ia-novo, .ia-voz, .ia-conversa { transition: none; }
        }
      `}</style>
    </div>
  );
}
