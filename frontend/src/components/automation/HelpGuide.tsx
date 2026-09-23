import { useMemo, useState } from 'react';
import { X, Search, BookOpen, Lightbulb, CheckCircle2, AlertTriangle, Play } from 'lucide-react';
import { HELP_INTRO, HELP_ITEMS } from './helpContent';
import { RECEITAS, VARIAVEIS_AJUDA } from './helpReceitas';
import DiagramaFluxo, { ConversaExemplo } from './DiagramaFluxo';

interface HelpGuideProps {
  onClose: () => void;
}

const CATEGORY_ORDER = ['Conceitos', 'Início do Fluxo', 'Lógica', 'Mensagens', 'CRM', 'Agendamento', 'Avançado', 'Estrutura'];

export default function HelpGuide({ onClose }: HelpGuideProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null); // null = mostra a introdução
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? HELP_ITEMS.filter(i => i.titulo.toLowerCase().includes(q) || i.oQueFaz.toLowerCase().includes(q))
      : HELP_ITEMS;
    const map = new Map<string, typeof HELP_ITEMS>();
    CATEGORY_ORDER.forEach(cat => map.set(cat, []));
    filtered.forEach(item => {
      if (!map.has(item.categoria)) map.set(item.categoria, []);
      map.get(item.categoria)!.push(item);
    });
    return map;
  }, [search]);

  const selectedItem = HELP_ITEMS.find(i => i.id === selectedId);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
    }}>
      <div style={{
        width: '100%', maxWidth: '1100px', height: '100%', maxHeight: '760px',
        backgroundColor: 'white', borderRadius: '14px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        display: 'flex', overflow: 'hidden'
      }}>
        {/* Sidebar de navegação */}
        <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid var(--odoo-border)', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
          <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid var(--odoo-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '15px', color: '#1a1a1a', marginBottom: '10px' }}>
              <BookOpen size={18} color="#0078D4" /> Manual do Autopilot
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', top: '9px', left: '9px' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar um nó..."
                style={{ width: '100%', padding: '7px 8px 7px 28px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            <button
              onClick={() => setSelectedId(null)}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: '7px', border: 'none',
                cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', marginBottom: '10px',
                backgroundColor: selectedId === null ? '#e0f2fe' : 'transparent',
                color: selectedId === null ? '#0369a1' : '#334155'
              }}
            >
              👋 Como Construir um Fluxo
            </button>

            <button
              onClick={() => setSelectedId('__receitas__')}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: '7px', border: 'none',
                cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px',
                backgroundColor: selectedId === '__receitas__' ? '#e0f2fe' : 'transparent',
                color: selectedId === '__receitas__' ? '#0369a1' : '#334155'
              }}
            >
              🧩 Fluxos prontos (copiar)
            </button>

            <button
              onClick={() => setSelectedId('__variaveis__')}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: '7px', border: 'none',
                cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', marginBottom: '10px',
                backgroundColor: selectedId === '__variaveis__' ? '#e0f2fe' : 'transparent',
                color: selectedId === '__variaveis__' ? '#0369a1' : '#334155'
              }}
            >
              🔤 Variáveis {'{{ }}'} — leia primeiro
            </button>

            {CATEGORY_ORDER.map(cat => {
              const items = grouped.get(cat) || [];
              if (items.length === 0) return null;
              return (
                <div key={cat} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.5px', padding: '4px 10px' }}>
                    {cat.toUpperCase()}
                  </div>
                  {items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '7px', border: 'none',
                        cursor: 'pointer', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px',
                        backgroundColor: selectedId === item.id ? '#e0f2fe' : 'transparent',
                        color: selectedId === item.id ? '#0369a1' : '#334155', fontWeight: selectedId === item.id ? 'bold' : 'normal'
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.cor, flexShrink: 0 }} />
                      {item.titulo}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Conteúdo */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--odoo-border)', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} title="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 40px 40px' }}>
            {selectedId === '__variaveis__' ? (
              <>
                <h1 style={{ fontSize: '23px', color: '#0f172a', margin: '0 0 12px 0' }}>{VARIAVEIS_AJUDA.titulo}</h1>
                <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: 1.65, marginBottom: '20px' }}>{VARIAVEIS_AJUDA.intro}</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold', color: '#b91c1c', marginBottom: '8px' }}>
                      <AlertTriangle size={14} /> ERRADO — dá sempre NÃO
                    </div>
                    <DiagramaFluxo d={VARIAVEIS_AJUDA.erradoDiagrama} />
                    <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '8px', lineHeight: 1.5 }}>
                      O bloco pergunta e a condição corre <b>no mesmo instante</b>. O cliente ainda não respondeu, por isso o quadro tem "Olá".
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold', color: '#15803d', marginBottom: '8px' }}>
                      <CheckCircle2 size={14} /> CERTO — espera pela resposta
                    </div>
                    <DiagramaFluxo d={VARIAVEIS_AJUDA.certoDiagrama} />
                    <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '8px', lineHeight: 1.5 }}>
                      O "Aguardar resposta" pára o fluxo. Quando o cliente escreve, o quadro passa a ter a resposta e só aí a condição corre.
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>AS VARIÁVEIS QUE EXISTEM SEMPRE</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                  {VARIAVEIS_AJUDA.lista.map(v => (
                    <div key={v.nome} style={{ display: 'flex', gap: '12px', alignItems: 'baseline', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px' }}>
                      <code style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#0369a1', whiteSpace: 'nowrap' }}>{v.nome}</code>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{v.o_que}</span>
                    </div>
                  ))}
                </div>

                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '14px', color: '#92400e', marginBottom: '8px' }}>
                    <Lightbulb size={16} /> Regras que resolvem 90% dos problemas
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#78350f', lineHeight: 1.8 }}>
                    {VARIAVEIS_AJUDA.regras.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              </>
            ) : selectedId === '__receitas__' ? (
              <>
                <h1 style={{ fontSize: '23px', color: '#0f172a', margin: '0 0 6px 0' }}>Fluxos prontos</h1>
                <div style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.6, marginBottom: '8px' }}>
                  Cinco fluxos completos, do mais simples ao mais completo. Veja o desenho, copie os passos e use o botão
                  <b> Simular</b> para testar sem enviar nada a ninguém.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#0369a1', marginBottom: '22px' }}>
                  <Play size={13} /> Dica: monte primeiro o nº 1. Cada receita acrescenta uma peça à anterior.
                </div>

                {RECEITAS.map(r => (
                  <div key={r.id} style={{ marginBottom: '34px', borderTop: '1px solid #e2e8f0', paddingTop: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <h2 style={{ fontSize: '17px', color: '#0f172a', margin: 0 }}>{r.titulo}</h2>
                      <span style={{ fontSize: '10.5px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px', background: r.dificuldade === 'fácil' ? '#dcfce7' : '#fef3c7', color: r.dificuldade === 'fácil' ? '#166534' : '#92400e' }}>{r.dificuldade}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '14px' }}>{r.paraQue}</div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', alignItems: 'start' }}>
                      <DiagramaFluxo d={r.diagrama} />
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>O QUE O CLIENTE VÊ</div>
                        <ConversaExemplo linhas={r.conversa} />
                      </div>
                    </div>

                    <div style={{ marginTop: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 18px' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#166534', marginBottom: '6px' }}>COMO MONTAR</div>
                      <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#166534', lineHeight: 1.8 }}>
                        {r.comoMontar.map((p, i) => <li key={i}>{p}</li>)}
                      </ol>
                    </div>
                  </div>
                ))}
              </>
            ) : !selectedItem ? (
              <>
                <h1 style={{ fontSize: '24px', color: '#0f172a', margin: '0 0 20px 0' }}>{HELP_INTRO.titulo}</h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '32px' }}>
                  {HELP_INTRO.passos.map(p => (
                    <div key={p.titulo} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                      <CheckCircle2 size={20} color="#0078D4" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a1a1a', marginBottom: '2px' }}>{p.titulo}</div>
                        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>{p.texto}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '14px', color: '#92400e', marginBottom: '10px' }}>
                    <Lightbulb size={16} /> Dicas rápidas
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#78350f', lineHeight: 1.7 }}>
                    {HELP_INTRO.dicas.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>

                <div style={{ marginTop: '28px', fontSize: '13px', color: '#94a3b8' }}>
                  Escolha um bloco na lista à esquerda para ver a explicação detalhada, os campos e um exemplo prático.
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: selectedItem.cor }} />
                  <h1 style={{ fontSize: '22px', color: '#0f172a', margin: 0 }}>{selectedItem.titulo}</h1>
                </div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '20px' }}>
                  {selectedItem.categoria.toUpperCase()}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>O QUE FAZ</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: 1.6 }}>{selectedItem.oQueFaz}</div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>QUANDO USAR</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: 1.6 }}>{selectedItem.quandoUsar}</div>
                </div>

                {selectedItem.campos && selectedItem.campos.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>CAMPOS DE CONFIGURAÇÃO</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedItem.campos.map(c => (
                        <div key={c.label} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '2px' }}>{c.label}</div>
                          <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>{c.explicacao}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '18px 20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#166534', marginBottom: '8px' }}>EXEMPLO PRÁTICO</div>
                  <div style={{ fontSize: '13px', color: '#14532d', marginBottom: '10px', fontStyle: 'italic' }}>{selectedItem.exemplo.cenario}</div>
                  <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#166534', lineHeight: 1.8 }}>
                    {selectedItem.exemplo.passos.map((p, i) => <li key={i}>{p}</li>)}
                  </ol>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
