import {
  GitBranch, Database, Mail, Send, Image, Play, Volume2, FileText, Clock, ArrowRightLeft,
  CheckCircle, ListChecks, GripVertical, Tag, TagX, ListPlus, Globe, BellRing, Headset
} from 'lucide-react';
import { createDefaultMenuOption, type ActionType, type AutomationNode } from './types';

interface PaletteItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  node: Omit<AutomationNode, 'id' | 'position'>;
}

interface PaletteGroup {
  title: string;
  items: PaletteItem[];
}

interface NodePaletteProps {
  onAddNode: (node: Omit<AutomationNode, 'id' | 'position'>) => void;
}

const actionItem = (label: string, icon: React.ReactNode, actionType: ActionType, color = '#0078D4'): PaletteItem => ({
  key: actionType,
  label,
  icon,
  color,
  node: { type: 'action', data: { actionType, config: {} } }
});

const PALETTE_GROUPS: PaletteGroup[] = [
  {
    title: 'LÓGICA',
    items: [
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
      }
    ]
  },
  {
    title: 'MENSAGENS',
    items: [
      actionItem('Responder WhatsApp', <Send size={14} />, 'REPLY_MESSAGE'),
      actionItem('Enviar Imagem', <Image size={14} />, 'SEND_IMAGE'),
      actionItem('Enviar Vídeo', <Play size={14} />, 'SEND_VIDEO'),
      actionItem('Enviar Áudio', <Volume2 size={14} />, 'SEND_AUDIO'),
      actionItem('Enviar Documento', <FileText size={14} />, 'SEND_DOCUMENT'),
      actionItem('Enviar Email', <Mail size={14} />, 'SEND_EMAIL')
    ]
  },
  {
    title: 'CRM',
    items: [
      actionItem('Criar Cliente', <Database size={14} />, 'CREATE_CLIENT'),
      actionItem('Criar Lead', <Database size={14} />, 'CREATE_LEAD'),
      actionItem('Adicionar Tag', <Tag size={14} />, 'ADD_TAG', '#16a34a'),
      actionItem('Remover Tag', <TagX size={14} />, 'REMOVE_TAG', '#dc2626'),
      actionItem('Campo Personalizado', <ListPlus size={14} />, 'SET_CUSTOM_FIELD', '#0891b2')
    ]
  },
  {
    title: 'AVANÇADO',
    items: [
      actionItem('Requisição Externa (API)', <Globe size={14} />, 'EXTERNAL_REQUEST', '#7c3aed'),
      actionItem('Notificar Equipa', <BellRing size={14} />, 'NOTIFY_TEAM', '#f59e0b'),
      actionItem('Transferir para Humano', <Headset size={14} />, 'HANDOFF_HUMAN', '#e11d48'),
      actionItem('Aguardar', <Clock size={14} />, 'DELAY'),
      actionItem('Saltar p/ Fluxo', <ArrowRightLeft size={14} />, 'JUMP_TO_WORKFLOW')
    ]
  },
  {
    title: 'FIM',
    items: [
      {
        key: 'end',
        label: 'Fim do Fluxo',
        icon: <CheckCircle size={14} />,
        color: '#64748b',
        node: { type: 'end', data: {} }
      }
    ]
  }
];

export const AUTOMATION_DRAG_MIME = 'application/x-automation-node';

export default function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div style={{
      position: 'absolute', top: 64, left: 16, zIndex: 10,
      backgroundColor: 'white', border: '1px solid var(--odoo-border)', borderRadius: '12px',
      padding: '10px', boxShadow: '0 6px 16px rgba(0,0,0,0.1)', width: '220px',
      maxHeight: 'calc(100% - 96px)', overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: '4px'
    }}>
      {PALETTE_GROUPS.map(group => (
        <div key={group.title}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.5px', margin: '10px 4px 2px' }}>
            {group.title}
          </div>
          {group.items.map(item => (
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
      ))}
    </div>
  );
}
