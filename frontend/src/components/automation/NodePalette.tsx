import { GitBranch, Database, Mail, Send, Image, Play, Volume2, FileText, Clock, ArrowRightLeft, CheckCircle, ListChecks, GripVertical } from 'lucide-react';
import { createDefaultMenuOption, type ActionType, type AutomationNode } from './types';

interface PaletteItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  node: Omit<AutomationNode, 'id' | 'position'>;
}

interface NodePaletteProps {
  onAddNode: (node: Omit<AutomationNode, 'id' | 'position'>) => void;
}

const actionItem = (label: string, icon: React.ReactNode, actionType: ActionType): PaletteItem => ({
  key: actionType,
  label,
  icon,
  color: '#0078D4',
  node: { type: 'action', data: { actionType, config: {} } }
});

const PALETTE_ITEMS: PaletteItem[] = [
  {
    key: 'condition',
    label: 'Condição',
    icon: <GitBranch size={14} />,
    color: '#8b5cf6',
    node: { type: 'condition', data: { variable: '{{mensagem}}', operator: 'contains', value: '' } }
  },
  {
    key: 'menu',
    label: 'Menu (Respostas Rápidas)',
    icon: <ListChecks size={14} />,
    color: '#0891b2',
    node: { type: 'menu', data: { variable: '{{mensagem}}', options: [createDefaultMenuOption(1), createDefaultMenuOption(2)] } }
  },
  actionItem('Responder WhatsApp', <Send size={14} />, 'REPLY_MESSAGE'),
  actionItem('Criar Cliente', <Database size={14} />, 'CREATE_CLIENT'),
  actionItem('Criar Lead', <Database size={14} />, 'CREATE_LEAD'),
  actionItem('Enviar Email', <Mail size={14} />, 'SEND_EMAIL'),
  actionItem('Enviar Imagem', <Image size={14} />, 'SEND_IMAGE'),
  actionItem('Enviar Vídeo', <Play size={14} />, 'SEND_VIDEO'),
  actionItem('Enviar Áudio', <Volume2 size={14} />, 'SEND_AUDIO'),
  actionItem('Enviar Documento', <FileText size={14} />, 'SEND_DOCUMENT'),
  actionItem('Aguardar', <Clock size={14} />, 'DELAY'),
  actionItem('Saltar p/ Fluxo', <ArrowRightLeft size={14} />, 'JUMP_TO_WORKFLOW'),
  {
    key: 'end',
    label: 'Fim do Fluxo',
    icon: <CheckCircle size={14} />,
    color: '#64748b',
    node: { type: 'end', data: {} }
  }
];

export const AUTOMATION_DRAG_MIME = 'application/x-automation-node';

export default function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: 16, zIndex: 10,
      backgroundColor: 'white', border: '1px solid var(--odoo-border)', borderRadius: '12px',
      padding: '10px', boxShadow: '0 6px 16px rgba(0,0,0,0.1)', maxWidth: '210px',
      display: 'flex', flexDirection: 'column', gap: '4px'
    }}>
      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '2px', padding: '0 4px' }}>
        ARRASTE PARA O CANVAS
      </div>
      {PALETTE_ITEMS.map(item => (
        <div
          key={item.key}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(AUTOMATION_DRAG_MIME, JSON.stringify(item.node));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => onAddNode(item.node)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '7px 8px', borderRadius: '8px', cursor: 'grab',
            fontSize: '12px', color: '#1a1a1a', textAlign: 'left',
            border: '1px solid transparent'
          }}
          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
        >
          <GripVertical size={12} color="#cbd5e1" />
          <span style={{ color: item.color, display: 'flex' }}>{item.icon}</span>
          {item.label}
        </div>
      ))}
    </div>
  );
}
