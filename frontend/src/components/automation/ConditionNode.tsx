import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import type { ConditionNodeData } from './types';
import NodeDeleteButton from './NodeDeleteButton';

export default function ConditionNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ConditionNodeData;

  return (
    <div className="automation-node-card" style={{
      width: 240,
      backgroundColor: 'white',
      border: `2px solid ${selected ? '#7c3aed' : '#8b5cf6'}`,
      borderRadius: '12px',
      padding: '14px',
      position: 'relative',
      boxShadow: selected ? '0 0 0 3px rgba(139,92,246,0.18)' : '0 2px 6px rgba(0,0,0,0.06)'
    }}>
      <NodeDeleteButton nodeId={id} />
      <Handle type="target" position={Position.Top} style={{ background: '#8b5cf6', width: 10, height: 10 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ backgroundColor: '#f3e8ff', padding: '8px', borderRadius: '8px' }}>
          <GitBranch size={18} color="#7c3aed" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#7c3aed', letterSpacing: '0.5px' }}>CONDIÇÃO</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a1a1a' }}>Se / Então</div>
        </div>
      </div>

      <div style={{ marginTop: '8px', fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.variable || '{{variavel}}'} {d.operator || '=='} {d.value || ''}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
        <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#16a34a' }}>SIM</span>
        <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#dc2626' }}>NÃO</span>
      </div>

      <Handle
        type="source"
        id="yes"
        position={Position.Bottom}
        style={{ background: '#16a34a', width: 10, height: 10, left: '25%' }}
      />
      <Handle
        type="source"
        id="no"
        position={Position.Bottom}
        style={{ background: '#dc2626', width: 10, height: 10, left: '75%' }}
      />
    </div>
  );
}
