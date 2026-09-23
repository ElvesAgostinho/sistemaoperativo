/**
 * Desenho simples de um fluxo, para a ajuda: caixas ligadas por setas, com as
 * mesmas cores dos nós do construtor. Serve para mostrar "o fluxo fica assim"
 * sem obrigar a abrir o canvas.
 */
export type TipoCaixa = 'gatilho' | 'acao' | 'espera' | 'menu' | 'condicao' | 'template' | 'humano' | 'agenda' | 'fim';

export interface Caixa { tipo: TipoCaixa; titulo: string; detalhe?: string }
export interface Ramo { rotulo: string; caixas: Caixa[] }
export interface Diagrama { caixas: Caixa[]; ramos?: Ramo[]; depois?: Caixa[] }

const ESTILO: Record<TipoCaixa, { cor: string; fundo: string; etiqueta: string }> = {
  gatilho: { cor: '#b45309', fundo: '#fef3c7', etiqueta: 'GATILHO' },
  acao: { cor: '#0369a1', fundo: '#e0f2fe', etiqueta: 'AÇÃO' },
  espera: { cor: '#0e7490', fundo: '#cffafe', etiqueta: 'ESPERA' },
  menu: { cor: '#0e7490', fundo: '#cffafe', etiqueta: 'MENU' },
  condicao: { cor: '#6d28d9', fundo: '#f3e8ff', etiqueta: 'SE / ENTÃO' },
  template: { cor: '#0E5A6B', fundo: '#E1EEF0', etiqueta: 'TEMPLATE' },
  humano: { cor: '#be123c', fundo: '#ffe4e6', etiqueta: 'PESSOA' },
  agenda: { cor: '#a16207', fundo: '#fef9c3', etiqueta: 'AGENDAMENTO' },
  fim: { cor: '#475569', fundo: '#f1f5f9', etiqueta: 'FIM' }
};

function CaixaVisual({ c }: { c: Caixa }) {
  const e = ESTILO[c.tipo];
  return (
    <div style={{
      border: `1.5px solid ${e.cor}`, background: e.fundo, borderRadius: '8px',
      padding: '7px 10px', minWidth: '150px', maxWidth: '230px', textAlign: 'left'
    }}>
      <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: e.cor, letterSpacing: '0.5px' }}>{e.etiqueta}</div>
      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', lineHeight: 1.25 }}>{c.titulo}</div>
      {c.detalhe && <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>{c.detalhe}</div>}
    </div>
  );
}

const Seta = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '18px', justifyContent: 'center' }}>
    <div style={{ width: '1.5px', height: '10px', background: '#94a3b8' }} />
    <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '5px solid #94a3b8' }} />
  </div>
);

export default function DiagramaFluxo({ d }: { d: Diagrama }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', overflowX: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 'fit-content' }}>
        {d.caixas.map((c, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <CaixaVisual c={c} />
            {(i < d.caixas.length - 1 || (d.ramos && d.ramos.length > 0)) && <Seta />}
          </div>
        ))}

        {d.ramos && d.ramos.length > 0 && (
          <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
            {d.ramos.map((r, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 'bold', color: '#334155', background: 'white',
                  border: '1px dashed #94a3b8', borderRadius: '10px', padding: '2px 9px', marginBottom: '6px'
                }}>{r.rotulo}</div>
                {r.caixas.map((c, j) => (
                  <div key={j} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <CaixaVisual c={c} />
                    {j < r.caixas.length - 1 && <Seta />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {d.depois && d.depois.length > 0 && (
          <>
            <Seta />
            {d.depois.map((c, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <CaixaVisual c={c} />
                {i < d.depois!.length - 1 && <Seta />}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Conversa de exemplo, como aparece no telemóvel do cliente. */
export function ConversaExemplo({ linhas }: { linhas: { de: 'cliente' | 'bot'; texto: string }[] }) {
  return (
    <div style={{ background: '#E5DDD5', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: l.de === 'cliente' ? 'flex-end' : 'flex-start' }}>
          <div style={{
            maxWidth: '78%', padding: '7px 10px', borderRadius: '8px', fontSize: '12.5px', lineHeight: 1.4, whiteSpace: 'pre-wrap',
            background: l.de === 'cliente' ? '#D9FDD3' : 'white', color: '#111', boxShadow: '0 1px 1px rgba(0,0,0,0.1)'
          }}>{l.texto}</div>
        </div>
      ))}
    </div>
  );
}
