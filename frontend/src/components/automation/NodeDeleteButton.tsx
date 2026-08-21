import { X } from 'lucide-react';
import { useAutomationCanvas } from './AutomationCanvasContext';

/** Pequeno "×" no canto do cartão para eliminar o nó sem precisar de abrir o painel lateral. */
export default function NodeDeleteButton({ nodeId }: { nodeId: string }) {
  const { deleteNode } = useAutomationCanvas();
  return (
    <button
      className="automation-node-toolbar-btn"
      onClick={(e) => { e.stopPropagation(); deleteNode(nodeId); }}
      title="Eliminar nó"
      style={{
        position: 'absolute', top: -8, right: -8, width: '20px', height: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#ef4444', color: 'white', border: '2px solid white', borderRadius: '50%',
        cursor: 'pointer', opacity: 0, transition: 'opacity 0.12s', zIndex: 5
      }}
    >
      <X size={11} strokeWidth={3} />
    </button>
  );
}
