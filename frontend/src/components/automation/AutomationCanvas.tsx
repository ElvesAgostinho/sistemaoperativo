import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, MiniMap,
  useNodesState, useEdgesState, addEdge, useReactFlow, useViewport, MarkerType,
  type Connection, type Node, type Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Loader2, LayoutGrid, Minus, Plus, RotateCcw, Play, Maximize2 } from 'lucide-react';
import TriggerNode from './TriggerNode';
import ConditionNode from './ConditionNode';
import ActionNode from './ActionNode';
import MenuNode from './MenuNode';
import EndNode from './EndNode';
import NodePalette, { AUTOMATION_DRAG_MIME } from './NodePalette';
import NodeConfigPanel from './NodeConfigPanel';
import SimuladorPanel from './SimuladorPanel';
import { AutomationCanvasContext } from './AutomationCanvasContext';
import { autoLayoutNodes } from './autoLayout';
import { generateNodeId, type Automation, type AutomationEdge, type AutomationNode } from './types';

/** O nó de trigger é único e obrigatório — nunca pode ser apagado (nem pelo "×", nem pela tecla Delete). */
function withDeletableFlag(node: any) {
  return { ...node, deletable: node.type !== 'trigger' };
}

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  menu: MenuNode,
  end: EndNode
};

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 18, height: 18 },
  style: { stroke: '#94a3b8', strokeWidth: 2 }
};

// Persiste o zoom/posição do canvas por automação — tal como o n8n, ao voltar
// a uma automação o utilizador encontra-a exatamente como a deixou, em vez de
// o React Flow reenquadrar (fitView) e mudar o tamanho dos nós a cada entrada.
const VIEWPORT_STORAGE_PREFIX = 'businessos_automation_viewport_';

function loadSavedViewport(automationId: string): { x: number; y: number; zoom: number } | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_STORAGE_PREFIX + automationId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveViewport(automationId: string, viewport: { x: number; y: number; zoom: number }) {
  try {
    localStorage.setItem(VIEWPORT_STORAGE_PREFIX + automationId, JSON.stringify(viewport));
  } catch {
    // localStorage indisponível (modo privado, quota esgotada) — sem persistência, sem crash
  }
}

interface AutomationCanvasProps {
  automation: Automation;
  automations: Automation[];
  onSave: (nodes: AutomationNode[], edges: AutomationEdge[]) => Promise<void>;
}

function CanvasInner({ automation, automations, onSave }: AutomationCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(automation.nodes as unknown as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(automation.edges as unknown as Edge[]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [simuladorAberto, setSimuladorAberto] = useState(false);
  const [noDestacado, setNoDestacado] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView, zoomTo, setViewport } = useReactFlow();
  const { zoom } = useViewport();
  const zoomPercent = Math.round(zoom * 100);

  useEffect(() => {
    setNodes((automation.nodes || []).map(withDeletableFlag) as unknown as Node[]);
    setEdges(automation.edges as unknown as Edge[]);
    setSelectedNodeId(null);

    // Restaura o zoom/posição onde o utilizador ficou nesta automação; só
    // reenquadra automaticamente (fitView) na primeira vez que é aberta.
    const saved = loadSavedViewport(automation.id);
    const timer = setTimeout(() => {
      if (saved) {
        setViewport(saved, { duration: 0 });
      } else {
        fitView({ padding: 0.2, duration: 0 });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [automation.id, setNodes, setEdges, setViewport, fitView]);

  const handleMoveEnd = useCallback((_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
    saveViewport(automation.id, viewport);
  }, [automation.id]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => {
      // Um handle de saída só pode ter uma ligação (evita ambiguidade nos branches)
      const filtered = eds.filter(e => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle));
      return addEdge({ ...connection, id: generateNodeId('edge') }, filtered);
    });
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const addNodeAt = useCallback((partial: Omit<AutomationNode, 'id' | 'position'>, position?: { x: number; y: number }) => {
    const newNode: AutomationNode = {
      ...partial,
      id: generateNodeId(partial.type),
      position: position || { x: 120 + Math.random() * 400, y: 350 + Math.random() * 200 }
    };
    setNodes(nds => [...nds, withDeletableFlag(newNode) as unknown as Node]);
    setSelectedNodeId(newNode.id);
  }, [setNodes]);

  const handleAddNode = useCallback((partial: Omit<AutomationNode, 'id' | 'position'>) => {
    addNodeAt(partial);
  }, [addNodeAt]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData(AUTOMATION_DRAG_MIME);
    if (!raw) return;
    try {
      const partial = JSON.parse(raw) as Omit<AutomationNode, 'id' | 'position'>;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNodeAt(partial, position);
    } catch (e) {
      console.error('Erro ao largar novo nó no canvas:', e);
    }
  }, [addNodeAt, screenToFlowPosition]);

  const handleChangeNodeData = useCallback((nodeId: string, data: any) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data } : n));
  }, [setNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(id => id === nodeId ? null : id);
  }, [setNodes, setEdges]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    setSelectedNodeId(id => (id && deleted.some(n => n.id === id)) ? null : id);
  }, []);

  const handleDuplicateNode = useCallback((nodeId: string) => {
    const original = nodes.find(n => n.id === nodeId) as any;
    if (!original || original.type === 'trigger') return; // só pode haver um gatilho por automação
    const clonedData = JSON.parse(JSON.stringify(original.data));
    const clone = withDeletableFlag({
      id: generateNodeId(original.type),
      type: original.type,
      position: { x: original.position.x + 40, y: original.position.y + 40 },
      data: clonedData
    });
    setNodes(nds => [...nds, clone as unknown as Node]);
    setSelectedNodeId(clone.id);
  }, [nodes, setNodes]);

  // Atalho estilo n8n: Ctrl/Cmd+D duplica o nó selecionado (ignorado se o foco estiver num campo de texto)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedNodeId) {
        e.preventDefault();
        handleDuplicateNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, handleDuplicateNode]);

  const canvasContextValue = useMemo(() => ({ deleteNode: handleDeleteNode, duplicateNode: handleDuplicateNode }), [handleDeleteNode, handleDuplicateNode]);

  // Guarda o timer do auto-layout para poder cancelá-lo se o utilizador sair
  // do módulo antes dos 50ms — sem isto, o setTimeout disparava na mesma
  // depois de desmontado, a chamar fitView contra um store já órfão.
  const autoLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (autoLayoutTimerRef.current) clearTimeout(autoLayoutTimerRef.current);
    };
  }, []);

  const handleAutoLayout = useCallback(() => {
    setNodes(nds => autoLayoutNodes(nds, edges));
    // Dá um instante para o estado aplicar antes de reenquadrar a vista
    autoLayoutTimerRef.current = setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
  }, [edges, setNodes, fitView]);

  const selectedNode = useMemo(
    () => (nodes.find(n => n.id === selectedNodeId) as unknown as AutomationNode | undefined),
    [nodes, selectedNodeId]
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(nodes as unknown as AutomationNode[], edges as unknown as AutomationEdge[]);
    } finally {
      setIsSaving(false);
    }
  };

  // O simulador destaca o nó por onde a conversa está a passar.
  const nosComDestaque = useMemo(
    () => (noDestacado ? nodes.map(n => (n.id === noDestacado ? { ...n, className: `${n.className || ''} no-em-simulacao` } : n)) : nodes),
    [nodes, noDestacado]
  );

  return (
    <AutomationCanvasContext.Provider value={canvasContextValue}>
      <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: '100%' }} onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nosComDestaque}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onMoveEnd={handleMoveEnd}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          deleteKeyCode={['Backspace', 'Delete']}
          minZoom={0.1}
          maxZoom={2}
        >
          <Background gap={18} color="#e2e8f0" />
          {/* Os controlos de origem do React Flow ficavam minúsculos e os ícones
              saíam como quadrados pretos (a folha de estilo dele pinta o interior
              de qualquer SVG). Usamos os nossos, com nome à frente. */}
          <MiniMap pannable zoomable style={{ background: '#f8fafc' }} />
        </ReactFlow>
        <style>{`.no-em-simulacao { outline: 3px solid #0E5A6B; outline-offset: 3px; border-radius: 12px; }`}</style>

        <NodePalette onAddNode={handleAddNode} />

        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'white', border: '1px solid var(--odoo-border)', borderRadius: '999px',
          padding: '6px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
        }}>
          <button
            onClick={() => zoomTo(Math.max(0.1, Math.round((zoom - 0.1) * 10) / 10))}
            title="Reduzir zoom"
            style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '2px' }}
          >
            <Minus size={14} />
          </button>
          <input
            type="range"
            min={10}
            max={200}
            step={5}
            value={zoomPercent}
            onChange={e => zoomTo(Number(e.target.value) / 100)}
            title="Controlar o tamanho dos nós"
            style={{ width: '90px', cursor: 'pointer' }}
          />
          <button
            onClick={() => zoomTo(Math.min(2, Math.round((zoom + 0.1) * 10) / 10))}
            title="Aumentar zoom"
            style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '2px' }}
          >
            <Plus size={14} />
          </button>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a1a1a', width: '36px', textAlign: 'center' }}>{zoomPercent}%</span>
          <button
            onClick={() => zoomTo(1)}
            title="Repor o zoom a 100%"
            style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '2px', borderLeft: '1px solid var(--odoo-border)', paddingLeft: '8px' }}
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={() => fitView({ padding: 0.2, duration: 300 })}
            title="Mostrar o fluxo inteiro no ecrã"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#0E5A6B', fontSize: '12px', fontWeight: 600, padding: '2px 4px', borderLeft: '1px solid var(--odoo-border)', paddingLeft: '8px' }}
          >
            <Maximize2 size={13} /> Ver tudo
          </button>
          <button
            onClick={handleAutoLayout}
            title="Arrumar os blocos em colunas, a partir do gatilho"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#0E5A6B', fontSize: '12px', fontWeight: 600, padding: '2px 4px', borderLeft: '1px solid var(--odoo-border)', paddingLeft: '8px' }}
          >
            <LayoutGrid size={13} /> Organizar
          </button>
        </div>

        <button
          onClick={() => setSimuladorAberto(v => !v)}
          title="Testar o fluxo sem enviar nada ao cliente"
          style={{
            position: 'absolute', top: 16, right: (selectedNode ? 336 : 16) + 108, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', backgroundColor: simuladorAberto ? '#0E5A6B' : 'white',
            color: simuladorAberto ? 'white' : '#0E5A6B', border: '1px solid #0E5A6B',
            borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', transition: 'right 0.15s'
          }}
        >
          <Play size={14} /> Simular
        </button>

        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            position: 'absolute', top: 16, right: selectedNode ? 336 : 16, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', backgroundColor: '#0ea5e9', color: 'white', border: 'none',
            borderRadius: '8px', fontWeight: 'bold', cursor: isSaving ? 'wait' : 'pointer',
            fontSize: '13px', transition: 'right 0.15s'
          }}
        >
          {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          {isSaving ? 'A Guardar...' : 'Guardar'}
        </button>

        {simuladorAberto && (
          <SimuladorPanel
            automationId={automation.id}
            onFechar={() => { setSimuladorAberto(false); setNoDestacado(null); }}
            onDestacarNo={setNoDestacado}
          />
        )}

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            todosOsNos={nodes as any}
            automations={automations}
            currentAutomationId={automation.id}
            onChangeData={handleChangeNodeData}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}

        <style>{`
          .automation-node-card:hover .automation-node-toolbar-btn {
            opacity: 1 !important;
          }
        `}</style>
      </div>
    </AutomationCanvasContext.Provider>
  );
}

export default function AutomationCanvas(props: AutomationCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
