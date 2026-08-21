import { useState, useEffect, useRef } from 'react';
import { Zap, Plus, Trash2, PanelLeftClose, PanelLeftOpen, Pencil, Check, X, HelpCircle, AlertTriangle } from 'lucide-react';
import AutomationCanvas from './automation/AutomationCanvas';
import HelpGuide from './automation/HelpGuide';
import { createBlankAutomationGraph, type Automation, type AutomationEdge, type AutomationNode } from './automation/types';

export default function AutomationApp() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // Em ecrãs estreitos (telemóvel) a lista começa fechada para dar todo o espaço ao canvas
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const authHeaders = () => {
    const token = localStorage.getItem('os_auth_token');
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const fetchAutomations = async () => {
    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/api/automation', { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setAutomations(data.automations.map((a: any) => ({
          ...a,
          nodes: typeof a.nodes === 'string' ? JSON.parse(a.nodes) : (a.nodes || []),
          edges: typeof a.edges === 'string' ? JSON.parse(a.edges) : (a.edges || [])
        })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  const selectedAuto = automations.find(a => a.id === selectedId) || null;

  // Uma automação ativa com gatilho "qualquer mensagem" do WhatsApp intercepta
  // TUDO antes do Assistente IA (incluindo o Agendamento, se estiver ativo) ter
  // oportunidade de responder — a maioria das vezes isto acontece sem o dono se
  // aperceber, por isso avisamos aqui mesmo antes de acontecer.
  const catchAllAutomations = automations.filter(a =>
    a.ativo && a.nodes?.some((n: AutomationNode) =>
      n.type === 'trigger' && n.data?.triggerKind === 'whatsapp_message' && n.data?.matchMode === 'any'
    )
  );

  const selectAutomation = (id: number) => {
    setSelectedId(id);
    // Em ecrãs estreitos, escolher um fluxo já fecha a lista para libertar espaço ao canvas
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const createAutomation = async () => {
    setIsCreating(true);
    try {
      const { nodes, edges } = createBlankAutomationGraph();
      const res = await fetch(import.meta.env.VITE_API_URL + '/api/automation', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ nome: 'Nova Automação', nodes, edges })
      });
      const data = await res.json();
      if (data.success) {
        await fetchAutomations();
        setSelectedId(data.automation_id);
      } else {
        alert('Erro ao criar automação: ' + (data.details || data.error || 'erro desconhecido.'));
      }
    } catch (err) {
      alert('Erro ao criar automação.');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteAutomation = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!window.confirm('Tem a certeza que deseja eliminar esta automação de forma permanente?')) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/automation/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (selectedId === id) setSelectedId(null);
      fetchAutomations();
    } catch (err) {
      alert('Erro ao eliminar automação.');
    }
  };

  const toggleAutomation = async (e: React.MouseEvent, id: number, currentAtivo: boolean) => {
    e.stopPropagation();
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/automation/${id}/toggle`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ ativo: !currentAtivo })
      });
      setAutomations(prev => prev.map(a => a.id === id ? { ...a, ativo: !currentAtivo } : a));
    } catch (err) {
      alert('Erro ao alternar automação.');
    }
  };

  const startRenaming = (e: React.MouseEvent, auto: Automation) => {
    e.stopPropagation();
    setEditingId(auto.id);
    setEditingValue(auto.nome);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const cancelRenaming = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditingValue('');
  };

  const confirmRenaming = async (e?: React.MouseEvent | React.FormEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (editingId === null) return;
    const novoNome = editingValue.trim();
    if (!novoNome) {
      cancelRenaming();
      return;
    }
    const automacaoAtual = automations.find(a => a.id === editingId);
    if (automacaoAtual && automacaoAtual.nome === novoNome) {
      cancelRenaming();
      return;
    }

    setIsRenaming(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/automation/${editingId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ nome: novoNome })
      });
      const data = await res.json();
      if (data.success) {
        setAutomations(prev => prev.map(a => a.id === editingId ? { ...a, nome: novoNome } : a));
        setEditingId(null);
        setEditingValue('');
      } else {
        alert('Erro ao renomear: ' + (data.error || 'erro desconhecido.'));
      }
    } catch (err) {
      alert('Erro ao renomear a automação.');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleSaveGraph = async (nodes: AutomationNode[], edges: AutomationEdge[]) => {
    if (!selectedAuto) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/automation/${selectedAuto.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ nodes, edges })
      });
      setAutomations(prev => prev.map(a => a.id === selectedAuto.id ? { ...a, nodes, edges } : a));
    } catch (err) {
      alert('Erro ao guardar as alterações.');
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', backgroundColor: '#f9fafb', position: 'relative', overflow: 'hidden' }}>

      {/* Sidebar - Lista de Automações (colapsável, sobretudo útil em ecrãs estreitos/telemóvel) */}
      <div style={{
        width: sidebarOpen ? '300px' : '0px',
        minWidth: 0,
        flexShrink: 0,
        backgroundColor: 'white',
        borderRight: sidebarOpen ? '1px solid var(--odoo-border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.18s ease'
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--odoo-border)', minWidth: '300px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={20} color="#0078D4" /> Autopilot
            </h2>
            <button
              onClick={() => setHelpOpen(true)}
              title="Manual — como construir um fluxo"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', borderRadius: '6px', padding: '5px 9px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
            >
              <HelpCircle size={13} /> Ajuda
            </button>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>Construtor Visual de Automações</p>
        </div>

        <div style={{ padding: '16px', overflowY: 'auto', flex: 1, minWidth: '300px' }}>
          {automations.map(auto => (
            <div
              key={auto.id}
              style={{
                padding: '12px',
                backgroundColor: selectedId === auto.id ? '#f0f9ff' : 'white',
                border: selectedId === auto.id ? '1px solid #0078D4' : '1px solid var(--odoo-border)',
                borderRadius: '6px',
                marginBottom: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s'
              }}
              onClick={() => selectAutomation(auto.id)}
            >
              <div
                onClick={(e) => toggleAutomation(e, auto.id, auto.ativo)}
                style={{
                  backgroundColor: auto.ativo ? '#dcfce7' : '#f1f5f9',
                  padding: '8px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  border: auto.ativo ? '1px solid #bbf7d0' : '1px solid #cbd5e1'
                }}
                title={auto.ativo ? 'Desativar Automação' : 'Ativar Automação'}
              >
                <Zap size={16} color={auto.ativo ? '#16a34a' : '#94a3b8'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === auto.id ? (
                  <form onSubmit={confirmRenaming} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') cancelRenaming(); }}
                      disabled={isRenaming}
                      autoFocus
                      style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 'bold', padding: '4px 6px', borderRadius: '4px', border: '1px solid #0078D4' }}
                    />
                    <button type="submit" disabled={isRenaming} title="Guardar nome" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#16a34a' }}>
                      <Check size={16} />
                    </button>
                    <button type="button" onClick={cancelRenaming} title="Cancelar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#94a3b8' }}>
                      <X size={16} />
                    </button>
                  </form>
                ) : (
                  <div title={auto.nome} style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onDoubleClick={(e) => startRenaming(e, auto)}>
                    {auto.nome}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#666' }}>{(auto.nodes || []).length} nós</div>
              </div>
              {editingId !== auto.id && (
                <>
                  <button
                    onClick={(e) => startRenaming(e, auto)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', opacity: 0.7 }}
                    title="Renomear Automação"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={(e) => deleteAutomation(e, auto.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#ef4444', opacity: 0.7 }}
                    title="Eliminar Automação"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          ))}

          {automations.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: '13px' }}>
              Nenhuma automação encontrada.
            </div>
          )}
        </div>
        <div style={{ padding: '16px', borderTop: '1px solid var(--odoo-border)', minWidth: '300px' }}>
          <button
            className="odoo-btn odoo-btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={createAutomation}
            disabled={isCreating}
          >
            <Plus size={16} /> {isCreating ? 'A criar...' : 'NOVA AUTOMAÇÃO'}
          </button>
        </div>
      </div>

      {/* Botão para abrir/fechar a lista — sempre visível, sobreposto ao canvas */}
      <button
        onClick={() => setSidebarOpen(o => !o)}
        title={sidebarOpen ? 'Ocultar lista de automações' : 'Mostrar lista de automações'}
        style={{
          position: 'absolute', top: 16, left: sidebarOpen ? 316 : 16, zIndex: 20,
          width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'white', border: '1px solid var(--odoo-border)', borderRadius: '8px',
          cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.08)', color: '#475569',
          transition: 'left 0.18s ease'
        }}
      >
        {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
      </button>

      {/* Main Area - Canvas Visual */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {catchAllAutomations.length > 0 && (
          <div style={{
            position: 'absolute', top: 12, left: sidebarOpen ? 56 : 62, right: 12, zIndex: 15,
            background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px',
            padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', fontSize: '12.5px', color: '#92400e'
          }}>
            <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>
              <strong>{catchAllAutomations.map(a => `"${a.nome}"`).join(', ')}</strong> responde a "qualquer mensagem" do
              WhatsApp e está ativa — isso intercepta as conversas antes do Assistente IA (Base de Conhecimento,
              Agendamento, etc.) ter oportunidade de responder. Se quiser que a IA também consiga responder,
              restrinja o gatilho a palavras-chave específicas ou desative esta automação.
            </div>
          </div>
        )}
        {selectedAuto ? (
          <AutomationCanvas
            key={selectedAuto.id}
            automation={selectedAuto}
            automations={automations}
            onSave={handleSaveGraph}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <Zap size={64} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3 style={{ margin: 0, color: '#64748b' }}>Selecione um Fluxo</h3>
            <p style={{ fontSize: '14px' }}>Ou crie uma nova automação para editar no canvas visual.</p>
          </div>
        )}
      </div>

      {helpOpen && <HelpGuide onClose={() => setHelpOpen(false)} />}

    </div>
  );
}
