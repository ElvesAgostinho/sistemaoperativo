import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Database, MessageCircle, FileText, Image, Play, Send, Mail, Clock, ArrowRightLeft, GitCommit, Tag, TagX, ListPlus, Globe, BellRing } from 'lucide-react';
import { ACTION_LABELS, type ActionNodeData } from './types';
import NodeDeleteButton from './NodeDeleteButton';

function renderIcon(actionType: string) {
  if (actionType === 'CREATE_CLIENT' || actionType === 'CREATE_LEAD') return <Database size={15} color="#3b82f6" />;
  if (actionType === 'SEND_DOCUMENT') return <FileText size={15} color="#ef4444" />;
  if (actionType === 'SEND_IMAGE') return <Image size={15} color="#10b981" />;
  if (actionType === 'SEND_VIDEO') return <Play size={15} color="#ef4444" />;
  if (actionType === 'SEND_AUDIO') return <MessageCircle size={15} color="#10b981" />;
  if (actionType === 'SEND_EMAIL') return <Mail size={15} color="#3b82f6" />;
  if (actionType === 'REPLY_MESSAGE') return <Send size={15} color="#0ea5e9" />;
  if (actionType === 'DELAY') return <Clock size={15} color="#64748b" />;
  if (actionType === 'JUMP_TO_WORKFLOW') return <ArrowRightLeft size={15} color="#8b5cf6" />;
  if (actionType === 'ADD_TAG') return <Tag size={15} color="#16a34a" />;
  if (actionType === 'REMOVE_TAG') return <TagX size={15} color="#dc2626" />;
  if (actionType === 'SET_CUSTOM_FIELD') return <ListPlus size={15} color="#0891b2" />;
  if (actionType === 'EXTERNAL_REQUEST') return <Globe size={15} color="#7c3aed" />;
  if (actionType === 'NOTIFY_TEAM') return <BellRing size={15} color="#f59e0b" />;
  return <GitCommit size={15} color="#6366f1" />;
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
    case 'ADD_TAG': case 'REMOVE_TAG': return c.tag || '(sem tag)';
    case 'SET_CUSTOM_FIELD': return c.campo ? `${c.campo} = ${c.valor || ''}` : '(sem campo)';
    case 'EXTERNAL_REQUEST': return c.url ? `${c.method || 'GET'} ${c.url}` : '(sem URL)';
    case 'NOTIFY_TEAM': return c.destinatario || '(sem destinatário)';
    default: return '';
  }
}

export default function ActionNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ActionNodeData;

  return (
    <div className="automation-node-card" style={{
      width: 200,
      backgroundColor: 'white',
      border: `1px solid ${selected ? '#0078D4' : '#e2e8f0'}`,
      borderRadius: '10px',
      padding: '10px',
      position: 'relative',
      boxShadow: selected ? '0 0 0 3px rgba(0,120,212,0.15)' : '0 2px 6px rgba(0,0,0,0.04)'
    }}>
      <NodeDeleteButton nodeId={id} />
      <Handle type="target" position={Position.Top} style={{ background: '#0078D4', width: 8, height: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ backgroundColor: '#f0f9ff', padding: '6px', borderRadius: '7px', flexShrink: 0 }}>
          {renderIcon(d.actionType)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#0078D4', letterSpacing: '0.5px' }}>AÇÃO</div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ACTION_LABELS[d.actionType] || d.actionType}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '6px', fontSize: '10px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {summarize(d)}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#0078D4', width: 8, height: 8 }} />
    </div>
  );
}
