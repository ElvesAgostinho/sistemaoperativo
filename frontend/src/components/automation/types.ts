export type AutomationNodeKind = 'trigger' | 'condition' | 'action' | 'end';

export type ActionType =
  | 'CREATE_CLIENT' | 'CREATE_LEAD' | 'SEND_EMAIL' | 'REPLY_MESSAGE'
  | 'SEND_IMAGE' | 'SEND_VIDEO' | 'SEND_AUDIO' | 'SEND_DOCUMENT'
  | 'DELAY' | 'JUMP_TO_WORKFLOW' | 'LOG_MESSAGE';

export interface TriggerNodeData {
  triggerKind: 'whatsapp_message' | 'webhook_generic';
  matchMode?: 'keyword' | 'regex' | 'any';
  matchValue?: string;
  webhookSource?: string;
}

export interface ConditionNodeData {
  variable: string;
  operator: '==' | '!=' | '>' | '<' | 'contains';
  value: string;
}

export interface ActionNodeData {
  actionType: ActionType;
  config: Record<string, any>;
}

export interface AutomationNode {
  id: string;
  type: AutomationNodeKind;
  position: { x: number; y: number };
  data: TriggerNodeData | ConditionNodeData | ActionNodeData | Record<string, never>;
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface Automation {
  id: number;
  nome: string;
  trigger_type: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  ativo: boolean;
}

export const ACTION_LABELS: Record<ActionType, string> = {
  CREATE_CLIENT: 'Criar Cliente no CRM',
  CREATE_LEAD: 'Criar Negócio (Lead)',
  SEND_EMAIL: 'Enviar Email',
  REPLY_MESSAGE: 'Responder no WhatsApp',
  SEND_IMAGE: 'Enviar Imagem',
  SEND_VIDEO: 'Enviar Vídeo',
  SEND_AUDIO: 'Enviar Áudio',
  SEND_DOCUMENT: 'Enviar Documento',
  DELAY: 'Aguardar',
  JUMP_TO_WORKFLOW: 'Saltar para Outro Fluxo',
  LOG_MESSAGE: 'Registar Log'
};

let idCounter = 0;
export function generateNodeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export function createBlankAutomationGraph(): { nodes: AutomationNode[]; edges: AutomationEdge[] } {
  return {
    nodes: [
      {
        id: generateNodeId('trigger'),
        type: 'trigger',
        position: { x: 50, y: 150 },
        data: { triggerKind: 'whatsapp_message', matchMode: 'any', matchValue: '' }
      }
    ],
    edges: []
  };
}
