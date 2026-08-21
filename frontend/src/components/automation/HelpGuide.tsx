import { useMemo, useState } from 'react';
import { X, Search, BookOpen, Lightbulb, CheckCircle2 } from 'lucide-react';
import { HELP_INTRO, HELP_ITEMS } from './helpContent';

interface HelpGuideProps {
  onClose: () => void;
}

const CATEGORY_ORDER = ['Início do Fluxo', 'Lógica', 'Mensagens', 'CRM', 'Avançado', 'Estrutura'];

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
            {!selectedItem ? (
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
