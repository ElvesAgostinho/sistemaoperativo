import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CheckCircle } from 'lucide-react';
import NodeDeleteButton from './NodeDeleteButton';
import NodeDuplicateButton from './NodeDuplicateButton';

export default function EndNode({ id, selected }: NodeProps) {
  return (
    <div className="automation-node-card" style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 16px',
      backgroundColor: '#f8fafc',
      border: `1px solid ${selected ? '#64748b' : '#cbd5e1'}`,
      borderRadius: '999px',
      color: '#64748b',
      fontSize: '12px',
      fontWeight: 'bold',
      position: 'relative'
    }}>
      <NodeDeleteButton nodeId={id} />
      <NodeDuplicateButton nodeId={id} />
      <Handle type="target" position={Position.Top} style={{ background: '#94a3b8', width: 10, height: 10 }} />
      <CheckCircle size={16} /> FIM DO FLUXO
    </div>
  );
}
