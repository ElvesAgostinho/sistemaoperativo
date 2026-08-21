import { useState } from 'react';
import { X, Trash2, Loader2, Plus, Upload } from 'lucide-react';
import type { ActionNodeData, ActionType, Automation, AutomationNode, ConditionNodeData, MenuNodeData, TriggerNodeData } from './types';
import { ACTION_LABELS, createDefaultMenuOption } from './types';

interface NodeConfigPanelProps {
  node: AutomationNode;
  automations: Automation[];
  currentAutomationId: number;
  onChangeData: (nodeId: string, data: any) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: '6px', border: '1px solid #cbd5e1',
  fontSize: '13px', boxSizing: 'border-box'
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px', marginTop: '12px'
};

export default function NodeConfigPanel({ node, automations, currentAutomationId, onChangeData, onDelete, onClose }: NodeConfigPanelProps) {
  const [isUploading, setIsUploading] = useState(false);

  const updateData = (patch: any) => {
    onChangeData(node.id, { ...node.data, ...patch });
  };
  const updateConfig = (patch: any) => {
    const current = node.data as ActionNodeData;
    onChangeData(node.id, { ...current, config: { ...current.config, ...patch } });
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch(import.meta.env.VITE_API_URL + '/api/automation/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        updateConfig({ ficheiro: data.filePath });
      }
    } catch (err) {
      alert('Erro no upload do ficheiro');
    } finally {
      setIsUploading(false);
    }
  };

  const renderBody = () => {
    if (node.type === 'trigger') {
      const d = node.data as TriggerNodeData;
      return (
        <>
          <label style={labelStyle}>Tipo de Gatilho</label>
          <select style={fieldStyle} value={d.triggerKind} onChange={e => updateData({ triggerKind: e.target.value })}>
            <option value="whatsapp_message">Mensagem Recebida no WhatsApp</option>
            <option value="webhook_generic">Webhook Genérico</option>
          </select>

          {d.triggerKind === 'whatsapp_message' ? (
            <>
              <label style={labelStyle}>Condição</label>
              <select style={fieldStyle} value={d.matchMode || 'any'} onChange={e => updateData({ matchMode: e.target.value })}>
                <option value="any">Qualquer mensagem</option>
                <option value="keyword">Contém palavra-chave</option>
                <option value="regex">Expressão regular (regex)</option>
              </select>

              {d.matchMode !== 'any' && (
                <>
                  <label style={labelStyle}>{d.matchMode === 'keyword' ? 'Palavras-chave (separadas por vírgula)' : 'Regex'}</label>
                  <input
                    style={fieldStyle}
                    type="text"
                    value={d.matchValue || ''}
                    onChange={e => updateData({ matchValue: e.target.value })}
                    placeholder={d.matchMode === 'keyword' ? 'preço, tabela, catalogo' : '^(oi|olá)'}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <label style={labelStyle}>Origem do Webhook</label>
              <input
                style={fieldStyle}
                type="text"
                value={d.webhookSource || ''}
                onChange={e => updateData({ webhookSource: e.target.value })}
                placeholder="whatsapp"
              />
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#666' }}>
                Aguarda POST em <code style={{ backgroundColor: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' }}>/api/automation/webhook/{d.webhookSource || '...'}</code>
              </div>
            </>
          )}
        </>
      );
    }

    if (node.type === 'condition') {
      const d = node.data as ConditionNodeData;
      return (
        <>
          <label style={labelStyle}>Variável</label>
          <input style={fieldStyle} type="text" value={d.variable || ''} onChange={e => updateData({ variable: e.target.value })} placeholder="{{mensagem}}" />

          <label style={labelStyle}>Operador</label>
          <select style={fieldStyle} value={d.operator || '=='} onChange={e => updateData({ operator: e.target.value })}>
            <option value="==">é igual a</option>
            <option value="!=">é diferente de</option>
            <option value=">">maior que</option>
            <option value="<">menor que</option>
            <option value="contains">contém</option>
          </select>

          <label style={labelStyle}>Valor</label>
          <input style={fieldStyle} type="text" value={d.value || ''} onChange={e => updateData({ value: e.target.value })} placeholder="urgente" />

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#666' }}>
            Ligue a saída <b style={{ color: '#16a34a' }}>SIM</b> ao caminho quando a condição for verdadeira, e a saída <b style={{ color: '#dc2626' }}>NÃO</b> ao caminho alternativo (pode deixar sem ligação para encerrar o fluxo nesse caso).
          </div>
        </>
      );
    }

    if (node.type === 'menu') {
      const d = node.data as MenuNodeData;
      const options = d.options || [];

      const updateOption = (id: string, patch: Partial<{ label: string; matchValue: string }>) => {
        updateData({ options: options.map(o => o.id === id ? { ...o, ...patch } : o) });
      };
      const addOption = () => {
        updateData({ options: [...options, createDefaultMenuOption(options.length + 1)] });
      };
      const removeOption = (id: string) => {
        updateData({ options: options.filter(o => o.id !== id) });
      };

      return (
        <>
          <label style={labelStyle}>Variável avaliada</label>
          <input style={fieldStyle} type="text" value={d.variable || '{{mensagem}}'} onChange={e => updateData({ variable: e.target.value })} />

          <div style={{ marginTop: '16px', fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>OPÇÕES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            {options.map(opt => (
              <div key={opt.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', position: 'relative' }}>
                <button
                  onClick={() => removeOption(opt.id)}
                  title="Remover opção"
                  style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 0 }}
                >
                  <X size={14} />
                </button>
                <label style={{ ...labelStyle, marginTop: 0 }}>Rótulo (visível no cartão)</label>
                <input style={fieldStyle} type="text" value={opt.label} onChange={e => updateOption(opt.id, { label: e.target.value })} placeholder="Ex: Quero um orçamento" />
                <label style={labelStyle}>Casa quando a mensagem contém</label>
                <input style={fieldStyle} type="text" value={opt.matchValue} onChange={e => updateOption(opt.id, { matchValue: e.target.value })} placeholder="Ex: orçamento" />
              </div>
            ))}
          </div>

          <button
            onClick={addOption}
            style={{
              marginTop: '10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '8px', background: '#ecfeff', color: '#0891b2', border: '1px dashed #67e8f9',
              borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
            }}
          >
            <Plus size={14} /> Adicionar Opção
          </button>

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#666' }}>
            Cada opção liga a uma saída própria no cartão — conecte cada uma ao caminho correspondente. Se nenhuma opção corresponder à mensagem, o fluxo termina ali.
          </div>
        </>
      );
    }

    if (node.type === 'action') {
      const d = node.data as ActionNodeData;
      const config = d.config || {};

      return (
        <>
          <label style={labelStyle}>Tipo de Ação</label>
          <select style={fieldStyle} value={d.actionType} onChange={e => updateData({ actionType: e.target.value as ActionType, config: {} })}>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          {d.actionType === 'CREATE_CLIENT' && (
            <>
              <label style={labelStyle}>Nome</label>
              <input style={fieldStyle} type="text" value={config.nome || ''} onChange={e => updateConfig({ nome: e.target.value })} placeholder="{{nome_whatsapp}}" />
              <label style={labelStyle}>Telefone</label>
              <input style={fieldStyle} type="text" value={config.telefone || ''} onChange={e => updateConfig({ telefone: e.target.value })} placeholder="{{telefone}}" />
            </>
          )}

          {d.actionType === 'CREATE_LEAD' && (
            <>
              <label style={labelStyle}>Título da Lead</label>
              <input style={fieldStyle} type="text" value={config.titulo || ''} onChange={e => updateConfig({ titulo: e.target.value })} placeholder="{{mensagem}}" />
            </>
          )}

          {d.actionType === 'REPLY_MESSAGE' && (
            <>
              <label style={labelStyle}>Telefone (opcional, padrão é quem enviou)</label>
              <input style={fieldStyle} type="text" value={config.telefone || ''} onChange={e => updateConfig({ telefone: e.target.value })} placeholder="{{telefone}}" />
              <label style={labelStyle}>Mensagem</label>
              <textarea style={{ ...fieldStyle, resize: 'vertical' }} rows={4} value={config.mensagem || ''} onChange={e => updateConfig({ mensagem: e.target.value })} placeholder="Olá {{nome_whatsapp}}..." />
            </>
          )}

          {d.actionType === 'SEND_EMAIL' && (
            <>
              <label style={labelStyle}>Destinatário (Para)</label>
              <input style={fieldStyle} type="text" value={config.para || ''} onChange={e => updateConfig({ para: e.target.value })} placeholder="{{email}} ou joao@empresa.com" />
              <label style={labelStyle}>Assunto</label>
              <input style={fieldStyle} type="text" value={config.assunto || ''} onChange={e => updateConfig({ assunto: e.target.value })} />
              <label style={labelStyle}>Corpo do Email</label>
              <textarea style={{ ...fieldStyle, resize: 'vertical' }} rows={5} value={config.corpo || ''} onChange={e => updateConfig({ corpo: e.target.value })} placeholder="Olá {{nome}}, seja bem-vindo..." />
            </>
          )}

          {['SEND_IMAGE', 'SEND_VIDEO', 'SEND_AUDIO', 'SEND_DOCUMENT'].includes(d.actionType) && (
            <>
              <label style={labelStyle}>Ficheiro</label>
              <label
                htmlFor="automation-media-upload"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  width: '100%', padding: '12px', borderRadius: '8px',
                  border: '2px dashed #93c5fd', background: '#eff6ff', color: '#1d4ed8',
                  fontSize: '13px', fontWeight: 'bold', cursor: isUploading ? 'wait' : 'pointer'
                }}
              >
                {isUploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                {isUploading ? 'A enviar...' : config.ficheiro ? 'Trocar ficheiro' : 'Escolher do dispositivo (câmara, galeria ou ficheiros)'}
              </label>
              <input
                id="automation-media-upload"
                type="file"
                accept={
                  d.actionType === 'SEND_IMAGE' ? 'image/*' :
                  d.actionType === 'SEND_VIDEO' ? 'video/*' :
                  d.actionType === 'SEND_AUDIO' ? 'audio/*' : undefined
                }
                onChange={e => e.target.files && handleFileUpload(e.target.files[0])}
                style={{ display: 'none' }}
              />

              {config.ficheiro && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ✓ {config.ficheiro.split(/[\\/]/).pop()}
                </div>
              )}

              <details style={{ marginTop: '10px' }}>
                <summary style={{ fontSize: '11px', color: '#94a3b8', cursor: 'pointer' }}>Avançado: indicar caminho manualmente</summary>
                <input style={{ ...fieldStyle, marginTop: '8px' }} type="text" value={config.ficheiro || ''} onChange={e => updateConfig({ ficheiro: e.target.value })} placeholder="C:\Caminho\para\ficheiro..." />
              </details>
            </>
          )}

          {d.actionType === 'DELAY' && (
            <>
              <label style={labelStyle}>Minutos de espera</label>
              <input style={fieldStyle} type="number" min={1} max={15} value={config.minutos || 1} onChange={e => updateConfig({ minutos: e.target.value })} />
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
                Máximo de 15 minutos — a espera acontece em memória enquanto a mensagem está a ser processada, sem fila persistente. Para esperas mais longas (horas/dias), use um nó "Notificar Equipa" ou "Transferir para Humano" em vez de bloquear o fluxo.
              </div>
            </>
          )}

          {d.actionType === 'JUMP_TO_WORKFLOW' && (
            <>
              <label style={labelStyle}>Fluxo Alvo</label>
              <select style={fieldStyle} value={config.target_workflow_nome || ''} onChange={e => updateConfig({ target_workflow_nome: e.target.value })}>
                <option value="">Selecione um fluxo...</option>
                {automations.filter(a => a.id !== currentAutomationId).map(a => (
                  <option key={a.id} value={a.nome}>{a.nome}</option>
                ))}
              </select>
            </>
          )}

          {(d.actionType === 'ADD_TAG' || d.actionType === 'REMOVE_TAG') && (
            <>
              <label style={labelStyle}>Tag(s) (separadas por vírgula)</label>
              <input style={fieldStyle} type="text" value={config.tag || ''} onChange={e => updateConfig({ tag: e.target.value })} placeholder="ex: vip, interessado" />
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
                Requer um cliente já resolvido no fluxo (ex: através de um nó "Criar Cliente" antes, ou de um trigger que já identifique o cliente pelo telefone).
              </div>
            </>
          )}

          {d.actionType === 'SET_CUSTOM_FIELD' && (
            <>
              <label style={labelStyle}>Nome do Campo</label>
              <input style={fieldStyle} type="text" value={config.campo || ''} onChange={e => updateConfig({ campo: e.target.value })} placeholder="ex: orcamento_pedido" />
              <label style={labelStyle}>Valor</label>
              <input style={fieldStyle} type="text" value={config.valor || ''} onChange={e => updateConfig({ valor: e.target.value })} placeholder="ex: 5000 ou {{mensagem}}" />
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
                O valor fica disponível como <code>{'{{' + (config.campo || 'nome_do_campo') + '}}'}</code> nos passos seguintes do fluxo.
              </div>
            </>
          )}

          {d.actionType === 'EXTERNAL_REQUEST' && (
            <>
              <label style={labelStyle}>URL</label>
              <input style={fieldStyle} type="text" value={config.url || ''} onChange={e => updateConfig({ url: e.target.value })} placeholder="https://api.exemplo.com/endpoint" />
              <label style={labelStyle}>Método</label>
              <select style={fieldStyle} value={config.method || 'GET'} onChange={e => updateConfig({ method: e.target.value })}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
              {config.method !== 'GET' && (
                <>
                  <label style={labelStyle}>Corpo (JSON)</label>
                  <textarea style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'monospace' }} rows={4} value={config.body || ''} onChange={e => updateConfig({ body: e.target.value })} placeholder='{"telefone": "{{telefone}}"}' />
                </>
              )}
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
                A resposta fica disponível como <code>{'{{external_response}}'}</code> nos passos seguintes.
              </div>
            </>
          )}

          {d.actionType === 'NOTIFY_TEAM' && (
            <>
              <label style={labelStyle}>Canal</label>
              <select style={fieldStyle} value={config.canal || 'email'} onChange={e => updateConfig({ canal: e.target.value })}>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <label style={labelStyle}>Destinatário</label>
              <input style={fieldStyle} type="text" value={config.destinatario || ''} onChange={e => updateConfig({ destinatario: e.target.value })} placeholder={config.canal === 'whatsapp' ? 'ex: 351912345678' : 'ex: equipa@empresa.com'} />
              <label style={labelStyle}>Mensagem</label>
              <textarea style={{ ...fieldStyle, resize: 'vertical' }} rows={3} value={config.mensagem || ''} onChange={e => updateConfig({ mensagem: e.target.value })} placeholder="Novo pedido de orçamento de {{nome_whatsapp}}" />
            </>
          )}

          {d.actionType === 'HANDOFF_HUMAN' && (
            <>
              <label style={labelStyle}>Telefone (opcional, padrão é quem enviou)</label>
              <input style={fieldStyle} type="text" value={config.telefone || ''} onChange={e => updateConfig({ telefone: e.target.value })} placeholder="{{telefone}}" />
              <label style={labelStyle}>Mensagem ao cliente (opcional)</label>
              <textarea style={{ ...fieldStyle, resize: 'vertical' }} rows={3} value={config.mensagem || ''} onChange={e => updateConfig({ mensagem: e.target.value })} placeholder="Um dos nossos atendentes já vai continuar a conversa consigo." />
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
                Pausa o bot para este cliente (o mesmo interruptor usado manualmente no inbox do WhatsApp) — nenhuma automação nem a IA voltam a responder até um agente reativar o bot. Combine com um nó "Notificar Equipa" antes, se quiser avisar alguém.
              </div>
            </>
          )}

          {d.actionType === 'AI_REPLY' && (
            <>
              <label style={labelStyle}>Telefone (opcional, padrão é quem enviou)</label>
              <input style={fieldStyle} type="text" value={config.telefone || ''} onChange={e => updateConfig({ telefone: e.target.value })} placeholder="{{telefone}}" />
              <label style={labelStyle}>Pergunta / instrução para a IA</label>
              <textarea style={{ ...fieldStyle, resize: 'vertical' }} rows={3} value={config.prompt || ''} onChange={e => updateConfig({ prompt: e.target.value })} placeholder="{{mensagem}}" />
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
                A resposta é gerada com base nos documentos da Base de Conhecimento da empresa (busca semântica automática) — se nada relevante for encontrado, a IA responde com conhecimento geral.
              </div>
            </>
          )}

          {d.actionType === 'LOG_MESSAGE' && (
            <>
              <label style={labelStyle}>Mensagem de Log</label>
              <input style={fieldStyle} type="text" value={config.mensagem || ''} onChange={e => updateConfig({ mensagem: e.target.value })} />
            </>
          )}
        </>
      );
    }

    return <div style={{ fontSize: '12px', color: '#666' }}>Este nó não tem configuração.</div>;
  };

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: '320px',
      backgroundColor: 'white', borderLeft: '1px solid var(--odoo-border)',
      boxShadow: '-4px 0 12px rgba(0,0,0,0.05)', zIndex: 20,
      display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: '16px', borderBottom: '1px solid var(--odoo-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: '#1a1a1a' }}>Configurar Nó</h3>
        <X size={18} style={{ cursor: 'pointer', color: '#64748b' }} onClick={onClose} />
      </div>

      <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
        {renderBody()}
      </div>

      {node.type !== 'trigger' && (
        <div style={{ padding: '16px', borderTop: '1px solid var(--odoo-border)' }}>
          <button
            onClick={() => onDelete(node.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '8px', backgroundColor: '#fff1f2', color: '#dc2626', border: '1px solid #fecdd3',
              borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
            }}
          >
            <Trash2 size={14} /> Eliminar Nó
          </button>
        </div>
      )}
    </div>
  );
}
