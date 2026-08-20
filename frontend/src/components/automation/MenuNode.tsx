import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ListChecks } from 'lucide-react';
import type { MenuNodeData } from './types';

export default function MenuNode({ data, selected }: NodeProps) {
  const d = data as unknown as MenuNodeData;
  const options = d.options || [];

  return (
    <div style={{
      width: 260,
      backgroundColor: 'white',
      border: `2px solid ${selected ? '#0891b2' : '#06b6d4'}`,
      borderRadius: '12px',
      padding: '14px',
      boxShadow: selected ? '0 0 0 3px rgba(6,182,212,0.18)' : '0 2px 6px rgba(0,0,0,0.06)'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#06b6d4', width: 10, height: 10 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ backgroundColor: '#ecfeff', padding: '8px', borderRadius: '8px' }}>
          <ListChecks size={18} color="#0891b2" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0891b2', letterSpacing: '0.5px' }}>MENU (RESPOSTAS RÁPIDAS)</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a1a1a' }}>Escolha do utilizador</div>
        </div>
      </div>

      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {options.length === 0 && (
          <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Sem opções configuradas</div>
        )}
        {options.map(opt => (
          <div key={opt.id} style={{
            fontSize: '12px', padding: '6px 10px', borderRadius: '8px',
            background: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e',
            display: 'flex', justifyContent: 'space-between', gap: '8px'
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
          style={{ background: '#0891b2', width: 9, height: 9, left: `${((i + 1) / (options.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}
