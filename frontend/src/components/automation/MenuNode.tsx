import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ListChecks } from 'lucide-react';
import type { MenuNodeData } from './types';
import NodeDeleteButton from './NodeDeleteButton';

export default function MenuNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as MenuNodeData;
  const options = d.options || [];

  return (
    <div className="automation-node-card" style={{
      width: 220,
      backgroundColor: 'white',
      border: `2px solid ${selected ? '#0891b2' : '#06b6d4'}`,
      borderRadius: '10px',
      padding: '10px',
      position: 'relative',
      boxShadow: selected ? '0 0 0 3px rgba(6,182,212,0.18)' : '0 2px 6px rgba(0,0,0,0.06)'
    }}>
      <NodeDeleteButton nodeId={id} />
      <Handle type="target" position={Position.Top} style={{ background: '#06b6d4', width: 8, height: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ backgroundColor: '#ecfeff', padding: '6px', borderRadius: '7px', flexShrink: 0 }}>
          <ListChecks size={15} color="#0891b2" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#0891b2', letterSpacing: '0.5px' }}>MENU</div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a1a1a' }}>Escolha do utilizador</div>
        </div>
      </div>

      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {options.length === 0 && (
          <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>Sem opções configuradas</div>
        )}
        {options.map(opt => (
          <div key={opt.id} style={{
            fontSize: '11px', padding: '5px 8px', borderRadius: '7px',
            background: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e',
            display: 'flex', justifyContent: 'space-between', gap: '6px'
          }}>
            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label || 'Opção'}</span>
            <span style={{ color: '#5eead4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.matchValue}</span>
          </div>
        ))}
      </div>

      {options.map((opt, i) => (
        <Handle
          key={opt.id}
          type="source"
          id={opt.id}
          position={Position.Bottom}
          style={{ background: '#0891b2', width: 8, height: 8, left: `${((i + 1) / (options.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}
