import { Copy } from 'lucide-react';
import { useAutomationCanvas } from './AutomationCanvasContext';

/** Pequeno botão no canto do cartão para duplicar o nó (estilo n8n) — a cópia fica solta, sem ligações. */
export default function NodeDuplicateButton({ nodeId }: { nodeId: string }) {
  const { duplicateNode } = useAutomationCanvas();
  return (
    <button
      className="automation-node-toolbar-btn"
      onClick={(e) => { e.stopPropagation(); duplicateNode(nodeId); }}
      title="Duplicar nó (Ctrl+D)"
      style={{
        position: 'absolute', top: -8, right: 16, width: '20px', height: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0078D4', color: 'white', border: '2px solid white', borderRadius: '50%',
        cursor: 'pointer', opacity: 0, transition: 'opacity 0.12s', zIndex: 5
      }}
    >
      <Copy size={10} strokeWidth={3} />
    </button>
  );
}
