import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, type Connection, type Node, type Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Loader2 } from 'lucide-react';
import TriggerNode from './TriggerNode';
import ConditionNode from './ConditionNode';
import ActionNode from './ActionNode';
import EndNode from './EndNode';
import NodePalette from './NodePalette';
import NodeConfigPanel from './NodeConfigPanel';
import { generateNodeId, type ActionType, type Automation, type AutomationEdge, type AutomationNode } from './types';

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  end: EndNode
};

interface AutomationCanvasProps {
  automation: Automation;
  automations: Automation[];
  onSave: (nodes: AutomationNode[], edges: AutomationEdge[]) => Promise<void>;
}

function CanvasInner({ automation, automations, onSave }: AutomationCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(automation.nodes as unknown as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(automation.edges as unknown as Edge[]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNodes(automation.nodes as unknown as Node[]);
    setEdges(automation.edges as unknown as Edge[]);
    setSelectedNodeId(null);
  }, [automation.id, setNodes, setEdges]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => {
      // Um handle de saída só pode ter uma ligação (evita ambiguidade nos branches "sim"/"não")
      const filtered = eds.filter(e => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle));
      return addEdge({ ...connection, id: generateNodeId('edge') }, filtered);
    });
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const addNodeAt = useCallback((partial: Omit<AutomationNode, 'id' | 'position'>) => {
    const newNode: AutomationNode = {
      ...partial,
      id: generateNodeId(partial.type),
      position: { x: 120 + Math.random() * 400, y: 350 + Math.random() * 200 }
    };
    setNodes(nds => [...nds, newNode as unknown as Node]);
    setSelectedNodeId(newNode.id);
  }, [setNodes]);

  const handleAddCondition = useCallback(() => {
    addNodeAt({ type: 'condition', data: { variable: '{{mensagem}}', operator: 'contains', value: '' } });
  }, [addNodeAt]);

  const handleAddAction = useCallback((actionType: ActionType) => {
    addNodeAt({ type: 'action', data: { actionType, config: {} } });
  }, [addNodeAt]);

  const handleAddEnd = useCallback(() => {
    addNodeAt({ type: 'end', data: {} });
  }, [addNodeAt]);

  const handleChangeNodeData = useCallback((nodeId: string, data: any) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data } : n));
  }, [setNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
  }, [setNodes, setEdges]);

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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      <NodePalette onAddCondition={handleAddCondition} onAddAction={handleAddAction} onAddEnd={handleAddEnd} />

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

      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          automations={automations}
          currentAutomationId={automation.id}
          onChangeData={handleChangeNodeData}
          onDelete={handleDeleteNode}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

export default function AutomationCanvas(props: AutomationCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
