import { GitBranch, Database, Mail, Send, Image, Play, Volume2, FileText, Clock, ArrowRightLeft, CheckCircle } from 'lucide-react';
import type { ActionType } from './types';

interface PaletteItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface NodePaletteProps {
  onAddCondition: () => void;
  onAddAction: (actionType: ActionType) => void;
  onAddEnd: () => void;
}

export default function NodePalette({ onAddCondition, onAddAction, onAddEnd }: NodePaletteProps) {
  const items: PaletteItem[] = [
    { label: 'Condição', icon: <GitBranch size={14} />, onClick: onAddCondition },
    { label: 'Responder WhatsApp', icon: <Send size={14} />, onClick: () => onAddAction('REPLY_MESSAGE') },
    { label: 'Criar Cliente', icon: <Database size={14} />, onClick: () => onAddAction('CREATE_CLIENT') },
    { label: 'Criar Lead', icon: <Database size={14} />, onClick: () => onAddAction('CREATE_LEAD') },
    { label: 'Enviar Email', icon: <Mail size={14} />, onClick: () => onAddAction('SEND_EMAIL') },
    { label: 'Enviar Imagem', icon: <Image size={14} />, onClick: () => onAddAction('SEND_IMAGE') },
    { label: 'Enviar Vídeo', icon: <Play size={14} />, onClick: () => onAddAction('SEND_VIDEO') },
    { label: 'Enviar Áudio', icon: <Volume2 size={14} />, onClick: () => onAddAction('SEND_AUDIO') },
    { label: 'Enviar Documento', icon: <FileText size={14} />, onClick: () => onAddAction('SEND_DOCUMENT') },
    { label: 'Aguardar', icon: <Clock size={14} />, onClick: () => onAddAction('DELAY') },
    { label: 'Saltar p/ Fluxo', icon: <ArrowRightLeft size={14} />, onClick: () => onAddAction('JUMP_TO_WORKFLOW') },
    { label: 'Fim do Fluxo', icon: <CheckCircle size={14} />, onClick: onAddEnd }
  ];

  return (
    <div style={{
      position: 'absolute', top: 16, left: 16, zIndex: 10,
      backgroundColor: 'white', border: '1px solid var(--odoo-border)', borderRadius: '8px',
      padding: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.08)', maxWidth: '180px',
      display: 'flex', flexDirection: 'column', gap: '4px'
    }}>
      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '2px', padding: '0 4px' }}>
        ADICIONAR NÓ
      </div>
      {items.map(item => (
        <button
          key={item.label}
          onClick={item.onClick}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 8px', border: 'none', background: 'none', borderRadius: '4px',
            cursor: 'pointer', fontSize: '12px', color: '#1a1a1a', textAlign: 'left'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {item.icon} {item.label}
        </button>
      ))}
    </div>
  );
}
