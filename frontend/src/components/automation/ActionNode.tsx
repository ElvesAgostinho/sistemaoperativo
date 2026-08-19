import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Database, MessageCircle, FileText, Image, Play, Send, Mail, Clock, ArrowRightLeft, GitCommit } from 'lucide-react';
import { ACTION_LABELS, type ActionNodeData } from './types';

function renderIcon(actionType: string) {
  if (actionType === 'CREATE_CLIENT' || actionType === 'CREATE_LEAD') return <Database size={18} color="#3b82f6" />;
  if (actionType === 'SEND_DOCUMENT') return <FileText size={18} color="#ef4444" />;
  if (actionType === 'SEND_IMAGE') return <Image size={18} color="#10b981" />;
  if (actionType === 'SEND_VIDEO') return <Play size={18} color="#ef4444" />;
  if (actionType === 'SEND_AUDIO') return <MessageCircle size={18} color="#10b981" />;
  if (actionType === 'SEND_EMAIL') return <Mail size={18} color="#3b82f6" />;
  if (actionType === 'REPLY_MESSAGE') return <Send size={18} color="#0ea5e9" />;
  if (actionType === 'DELAY') return <Clock size={18} color="#64748b" />;
  if (actionType === 'JUMP_TO_WORKFLOW') return <ArrowRightLeft size={18} color="#8b5cf6" />;
  return <GitCommit size={18} color="#6366f1" />;
}

function summarize(d: ActionNodeData): string {
  const c = d.config || {};
  switch (d.actionType) {
    case 'CREATE_CLIENT': return c.nome || c.telefone || 'Novo cliente';
    case 'CREATE_LEAD': return c.titulo || 'Nova lead';
    case 'REPLY_MESSAGE': return c.mensagem || '(sem texto)';
    case 'SEND_EMAIL': return c.assunto || c.para || '(sem assunto)';
    case 'SEND_IMAGE': case 'SEND_VIDEO': case 'SEND_AUDIO': case 'SEND_DOCUMENT':
      return c.ficheiro || '(sem ficheiro)';
    case 'DELAY': return `${c.minutos || 1} minuto(s)`;
    case 'JUMP_TO_WORKFLOW': return c.target_workflow_nome || '(escolher fluxo)';
    default: return '';
  }
}

export default function ActionNode({ data, selected }: NodeProps) {
  const d = data as unknown as ActionNodeData;

  return (
    <div style={{
      width: 240,
      backgroundColor: 'white',
      border: `1px solid ${selected ? '#0078D4' : '#e2e8f0'}`,
      borderRadius: '8px',
      padding: '12px',
      boxShadow: selected ? '0 0 0 3px rgba(0,120,212,0.15)' : '0 2px 4px rgba(0,0,0,0.02)'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#0078D4', width: 10, height: 10 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ backgroundColor: '#f0f9ff', padding: '8px', borderRadius: '8px' }}>
          {renderIcon(d.actionType)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0078D4', letterSpacing: '0.5px' }}>AÇÃO</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a1a1a' }}>
            {ACTION_LABELS[d.actionType] || d.actionType}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '8px', fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {summarize(d)}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#0078D4', width: 10, height: 10 }} />
    </div>
  );
}
