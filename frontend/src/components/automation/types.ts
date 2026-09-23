export type AutomationNodeKind = 'trigger' | 'condition' | 'action' | 'menu' | 'end';

export type ActionType =
  | 'SEND_EMAIL' | 'REPLY_MESSAGE'
  | 'SEND_IMAGE' | 'SEND_VIDEO' | 'SEND_AUDIO' | 'SEND_DOCUMENT'
  | 'DELAY' | 'WAIT_REPLY' | 'GOTO_MENU' | 'JUMP_TO_WORKFLOW' | 'LOG_MESSAGE' | 'SEND_TEMPLATE'
  | 'CHECK_SLOTS' | 'CREATE_BOOKING' | 'LIST_BOOKINGS'
  | 'ADD_TAG' | 'REMOVE_TAG' | 'SET_CUSTOM_FIELD' | 'EXTERNAL_REQUEST' | 'NOTIFY_TEAM' | 'HANDOFF_HUMAN' | 'AI_REPLY';

export interface TriggerNodeData {
  triggerKind: 'whatsapp_message' | 'webhook_generic';
  matchMode?: 'keyword' | 'regex' | 'any';
  matchValue?: string;
  webhookSource?: string;
}

export interface ConditionNodeData {
  variable: string;
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'empty' | 'not_empty' | 'regex';
  value: string;
}

/** Variáveis que o motor põe sempre no contexto de uma conversa de WhatsApp. */
export const VARIAVEIS_CONVERSA: { chave: string; descricao: string }[] = [
  { chave: '{{mensagem}}', descricao: 'o que o cliente escreveu agora' },
  { chave: '{{resposta}}', descricao: 'a resposta ao último "Aguardar resposta"' },
  { chave: '{{telefone}}', descricao: 'número do cliente' },
  { chave: '{{nome_whatsapp}}', descricao: 'nome no WhatsApp' },
  { chave: '{{tags}}', descricao: 'etiquetas do cliente no CRM' }
];

export interface ActionNodeData {
  actionType: ActionType;
  config: Record<string, any>;
}

export interface MenuNodeExtra {
  /** Texto que o menu envia quando fica à espera da escolha (opcional). */
  pergunta?: string;
  /** O que dizer quando a resposta não é nenhuma das opções. */
  mensagemInvalida?: string;
  /** Respostas inválidas seguidas antes de seguir pela saída "sem resposta". */
  maxTentativas?: number;
}

export interface MenuOption {
  id: string;
  label: string;
  matchValue: string;
}

export interface MenuNodeData extends MenuNodeExtra {
  variable?: string;
  options: MenuOption[];
}

export interface AutomationNode {
  id: string;
  type: AutomationNodeKind;
  position: { x: number; y: number };
  data: TriggerNodeData | ConditionNodeData | ActionNodeData | MenuNodeData | Record<string, never>;
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
  SEND_EMAIL: 'Enviar Email',
  REPLY_MESSAGE: 'Responder no WhatsApp',
  SEND_IMAGE: 'Enviar Imagem',
  SEND_VIDEO: 'Enviar Vídeo',
  SEND_AUDIO: 'Enviar Áudio',
  SEND_DOCUMENT: 'Enviar Documento',
  DELAY: 'Aguardar',
  WAIT_REPLY: 'Aguardar resposta do cliente',
  GOTO_MENU: 'Voltar ao menu',
  SEND_TEMPLATE: 'Enviar template',
  CHECK_SLOTS: 'Ver horários livres',
  CREATE_BOOKING: 'Criar marcação',
  LIST_BOOKINGS: 'Marcações do cliente',
  JUMP_TO_WORKFLOW: 'Saltar para Outro Fluxo',
  LOG_MESSAGE: 'Registar Log',
  ADD_TAG: 'Adicionar Tag ao Cliente',
  REMOVE_TAG: 'Remover Tag do Cliente',
  SET_CUSTOM_FIELD: 'Definir Campo Personalizado',
  EXTERNAL_REQUEST: 'Requisição Externa (API)',
  NOTIFY_TEAM: 'Notificar Equipa',
  HANDOFF_HUMAN: 'Transferir para Humano',
  AI_REPLY: 'Responder com IA (Base de Conhecimento)'
};

let idCounter = 0;
export function generateNodeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export function createDefaultMenuOption(index: number): MenuOption {
  return { id: generateNodeId('opt'), label: `Opção ${index}`, matchValue: '' };
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
