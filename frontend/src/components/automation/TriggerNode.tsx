import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';
import type { TriggerNodeData } from './types';

export default function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerNodeData;

  const summary = d.triggerKind === 'whatsapp_message'
    ? (d.matchMode === 'any' || !d.matchMode
        ? 'Qualquer mensagem recebida'
        : d.matchMode === 'keyword'
          ? `Contém: ${d.matchValue || '(vazio)'}`
          : `Regex: ${d.matchValue || '(vazio)'}`)
    : `Webhook: /${d.webhookSource || 'generic'}`;

  return (
    <div style={{
      width: 240,
      backgroundColor: 'white',
      border: `2px solid ${selected ? '#d97706' : '#f59e0b'}`,
      borderRadius: '8px',
      padding: '12px',
      boxShadow: selected ? '0 0 0 3px rgba(245,158,11,0.2)' : '0 2px 4px rgba(0,0,0,0.05)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ backgroundColor: '#fef3c7', padding: '8px', borderRadius: '8px' }}>
          <Zap size={18} color="#d97706" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#d97706', letterSpacing: '0.5px' }}>GATILHO</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a1a1a' }}>
            {d.triggerKind === 'whatsapp_message' ? 'Mensagem WhatsApp' : 'Webhook Genérico'}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '8px', fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {summary}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#f59e0b', width: 10, height: 10 }} />
    </div>
  );
}
