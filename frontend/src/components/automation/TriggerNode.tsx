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
      width: 200,
      backgroundColor: 'white',
      border: `2px solid ${selected ? '#d97706' : '#f59e0b'}`,
      borderRadius: '10px',
      padding: '10px',
      boxShadow: selected ? '0 0 0 3px rgba(245,158,11,0.18)' : '0 2px 6px rgba(0,0,0,0.06)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ backgroundColor: '#fef3c7', padding: '6px', borderRadius: '7px', flexShrink: 0 }}>
          <Zap size={15} color="#d97706" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#d97706', letterSpacing: '0.5px' }}>GATILHO</div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.triggerKind === 'whatsapp_message' ? 'Mensagem WhatsApp' : 'Webhook Genérico'}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '6px', fontSize: '10px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {summary}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#f59e0b', width: 8, height: 8 }} />
    </div>
  );
}
