import { useState, useEffect } from 'react';
import { X, Trash2, Loader2, Plus, Upload } from 'lucide-react';
import type { ActionNodeData, ActionType, Automation, AutomationNode, ConditionNodeData, MenuNodeData, TriggerNodeData } from './types';
import { ACTION_LABELS, createDefaultMenuOption, VARIAVEIS_CONVERSA } from './types';

interface NodeConfigPanelProps {
  node: AutomationNode;
  /** Todos os nós do fluxo — necessário para escolher o menu de destino do "Voltar ao menu". */
  todosOsNos?: AutomationNode[];
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

export default function NodeConfigPanel({ node, todosOsNos = [], automations, currentAutomationId, onChangeData, onDelete, onClose }: NodeConfigPanelProps) {
  const menusDoFluxo = todosOsNos.filter(n => n.type === 'menu');
  // Templates criados em WhatsApp → Templates (para o nó "Enviar template").
  const [templates, setTemplates] = useState<any[]>([]);
  useEffect(() => {
    if ((node.data as any)?.actionType !== 'SEND_TEMPLATE') return;
    (async () => {
      try {
        const token = localStorage.getItem('os_auth_token') || '';
        const r = await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/templates`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (d.success) setTemplates(d.templates || []);
      } catch { /* sem templates disponíveis */ }
    })();
  }, [node.id, (node.data as any)?.actionType]);
  const corpoDoTemplate = (t: any) => (t?.components || []).find((c: any) => String(c.type).toUpperCase() === 'BODY')?.text || '';

  // Serviços e rótulos do módulo de Agendamento (para os nós de marcação).
  const [servicos, setServicos] = useState<any[]>([]);
  const [agendaConfig, setAgendaConfig] = useState<any>(null);
  const ehNoDeAgenda = ['CHECK_SLOTS', 'CREATE_BOOKING', 'LIST_BOOKINGS'].includes((node.data as any)?.actionType);
  useEffect(() => {
    if (!ehNoDeAgenda) return;
    (async () => {
      try {
        const token = localStorage.getItem('os_auth_token') || '';
        const h = { Authorization: `Bearer ${token}` };
        const [r1, r2] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/agendamento/servicos`, { headers: h }),
          fetch(`${import.meta.env.VITE_API_URL}/api/agendamento/config`, { headers: h })
        ]);
        const d1 = await r1.json(); const d2 = await r2.json();
        if (d1.success) setServicos(d1.servicos || []);
        if (d2.success) setAgendaConfig(d2.config);
      } catch { /* módulo não disponível */ }
    })();
  }, [node.id, ehNoDeAgenda]);
  const rotuloItem = agendaConfig?.rotulo_item || 'Serviço';
  const nomeDoMenu = (n: any, i: number) => (n.data?.pergunta ? String(n.data.pergunta).slice(0, 40) : `Menu ${i + 1}`);
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
      } else {
        alert('Erro no upload do ficheiro: ' + (data.error || 'erro desconhecido no servidor.'));
      }
    } catch (err) {
      alert('Erro de rede no upload do ficheiro.');
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
          <select style={fieldStyle} value={VARIAVEIS_CONVERSA.some(v => v.chave === (d.variable || '')) ? d.variable : '__outra__'}
            onChange={e => updateData({ variable: e.target.value === '__outra__' ? '' : e.target.value })}>
            {VARIAVEIS_CONVERSA.map(v => <option key={v.chave} value={v.chave}>{v.chave} — {v.descricao}</option>)}
            <option value="__outra__">outra variável…</option>
          </select>
          {!VARIAVEIS_CONVERSA.some(v => v.chave === (d.variable || '')) && (
            <input style={fieldStyle} type="text" value={d.variable || ''}
              onChange={e => updateData({ variable: e.target.value })}
              onBlur={e => { const v = e.target.value.trim(); if (v && !v.includes('{{')) updateData({ variable: `{{${v}}}` }); }}
              placeholder="{{campo_personalizado}}" />
          )}

          <label style={labelStyle}>Operador</label>
          <select style={fieldStyle} value={d.operator || '=='} onChange={e => updateData({ operator: e.target.value })}>
            <option value="==">é igual a</option>
            <option value="!=">é diferente de</option>
            <option value="contains">contém</option>
            <option value="not_contains">não contém</option>
            <option value="starts_with">começa por</option>
            <option value="ends_with">termina em</option>
            <option value=">">maior que (número)</option>
            <option value=">=">maior ou igual (número)</option>
            <option value="<">menor que (número)</option>
            <option value="<=">menor ou igual (número)</option>
            <option value="empty">está vazio</option>
            <option value="not_empty">não está vazio</option>
            <option value="regex">corresponde à expressão</option>
          </select>

          {!['empty', 'not_empty'].includes(d.operator || '==') && (
            <>
              <label style={labelStyle}>Valor</label>
              <input style={fieldStyle} type="text" value={d.value || ''} onChange={e => updateData({ value: e.target.value })} placeholder="urgente" />
            </>
          )}

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#666', lineHeight: 1.5 }}>
            Ligue a saída <b style={{ color: '#16a34a' }}>SIM</b> ao caminho quando a condição for verdadeira, e a saída <b style={{ color: '#dc2626' }}>NÃO</b> ao caminho alternativo (pode deixar sem ligação para encerrar o fluxo nesse caso).
            <br /><br />
            A comparação de texto ignora maiúsculas, acentos e espaços a mais ("Não" = "nao"). Para comparar com o que o cliente <b>responde a uma pergunta</b>, ponha antes um nó <b>"Aguardar resposta"</b> — senão a condição é avaliada com a mensagem que <i>iniciou</i> o fluxo.
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
          <label style={labelStyle}>Pergunta a enviar</label>
          <textarea style={{ ...fieldStyle, minHeight: '80px' }} value={d.pergunta || ''} onChange={e => updateData({ pergunta: e.target.value })}
            placeholder={'Escolha uma opção:\n1 - Preços\n2 - Reservar\n3 - Falar com alguém'} />
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', lineHeight: 1.5 }}>
            O menu envia este texto e fica à espera da resposta seguinte. É também o que volta a ser enviado quando alguém usa o nó <b>"Voltar ao menu"</b>.
          </div>

          <label style={labelStyle}>Variável avaliada</label>
          <input style={fieldStyle} type="text" value={d.variable || '{{mensagem}}'} onChange={e => updateData({ variable: e.target.value })} />

          <label style={labelStyle}>Se a resposta não for nenhuma das opções</label>
          <input style={fieldStyle} type="text" value={d.mensagemInvalida || ''} onChange={e => updateData({ mensagemInvalida: e.target.value })}
            placeholder="(por omissão repete a pergunta)" />

          <label style={labelStyle}>Tentativas antes de desistir</label>
          <input style={fieldStyle} type="number" min={1} max={10} value={d.maxTentativas ?? 3} onChange={e => updateData({ maxTentativas: Number(e.target.value) })} />

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

              {d.actionType !== 'SEND_AUDIO' && (
                <>
                  <label style={labelStyle}>Legenda (opcional)</label>
                  <textarea
                    style={{ ...fieldStyle, resize: 'vertical' }}
                    rows={2}
                    value={config.legenda || ''}
                    onChange={e => updateConfig({ legenda: e.target.value })}
                    placeholder={d.actionType === 'SEND_IMAGE' ? 'Ex: Camisa Azul — 5.000 Kz' : 'Texto que acompanha o ficheiro'}
                  />
                  <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                    Aparece junto com o ficheiro no WhatsApp — útil para descrever um produto e o preço, por exemplo.
                  </div>
                </>
              )}

              <details style={{ marginTop: '10px' }}>
                <summary style={{ fontSize: '11px', color: '#94a3b8', cursor: 'pointer' }}>Avançado: indicar caminho manualmente</summary>
                <input style={{ ...fieldStyle, marginTop: '8px' }} type="text" value={config.ficheiro || ''} onChange={e => updateConfig({ ficheiro: e.target.value })} placeholder="C:\Caminho\para\ficheiro..." />
              </details>
            </>
          )}

          {(d.actionType === 'CHECK_SLOTS' || d.actionType === 'CREATE_BOOKING') && (
            <>
              <label style={labelStyle}>{rotuloItem}</label>
              <select style={fieldStyle} value={servicos.some((sv: any) => sv.nome === config.servico) ? config.servico : '__livre__'}
                onChange={e => updateConfig({ servico: e.target.value === '__livre__' ? '' : e.target.value })}>
                <option value="__livre__">— escrever / usar uma variável —</option>
                {servicos.map((sv: any) => <option key={sv.id} value={sv.nome}>{sv.nome} ({sv.duracao_minutos} min)</option>)}
              </select>
              {!servicos.some((sv: any) => sv.nome === config.servico) && (
                <input style={{ ...fieldStyle, marginTop: '6px' }} value={config.servico || ''} onChange={e => updateConfig({ servico: e.target.value })}
                  placeholder={'ex: {{mensagem}} (o que o cliente escolheu no menu)'} />
              )}
              {servicos.length === 0 && <div style={{ fontSize: '11px', color: '#b45309', marginTop: '6px' }}>Ainda não há {String(agendaConfig?.rotulo_item_plural || 'serviços').toLowerCase()} criados no módulo Agendamento.</div>}

              <label style={labelStyle}>Data</label>
              <input style={fieldStyle} value={config.data || ''} onChange={e => updateConfig({ data: e.target.value })}
                placeholder={'{{mensagem}} · ou {{data_reserva}}'} />
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', lineHeight: 1.5 }}>
                O sistema percebe o que as pessoas escrevem: <b>hoje</b>, <b>amanhã</b>, <b>sexta</b>, <b>12/10</b>, <b>12 de outubro</b>, <b>dia 3</b>.
              </div>
            </>
          )}

          {d.actionType === 'CHECK_SLOTS' && (
            <>
              <label style={labelStyle}>Guardar os horários em</label>
              <input style={fieldStyle} value={config.guardarEm || ''} onChange={e => updateConfig({ guardarEm: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="horarios_livres" />
              <label style={labelStyle}>Quantos horários mostrar</label>
              <input style={fieldStyle} type="number" min={1} max={20} value={config.maximo ?? 8} onChange={e => updateConfig({ maximo: Number(e.target.value) })} />
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', lineHeight: 1.6 }}>
                Depois deste bloco pode usar <code>{'{{horarios_livres}}'}</code> numa mensagem e <code>{'{{tem_vagas}}'}</code> (vale "sim" ou "nao") numa condição. Se algo não for percebido, o motivo fica em <code>{'{{agendamento_erro}}'}</code>.
              </div>
            </>
          )}

          {d.actionType === 'CREATE_BOOKING' && (
            <>
              <label style={labelStyle}>Hora</label>
              <input style={fieldStyle} value={config.hora || ''} onChange={e => updateConfig({ hora: e.target.value })} placeholder={'{{mensagem}} · ou {{hora_escolhida}}'} />
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Percebe <b>14h</b>, <b>14:30</b>, <b>2 da tarde</b>, <b>meio-dia</b>.</div>

              <label style={labelStyle}>Nome do cliente</label>
              <input style={fieldStyle} value={config.nome || ''} onChange={e => updateConfig({ nome: e.target.value })} placeholder={'{{nome_cliente}} ou {{nome_whatsapp}}'} />

              <label style={labelStyle}>Telefone</label>
              <input style={fieldStyle} value={config.telefone || ''} onChange={e => updateConfig({ telefone: e.target.value })} placeholder={'{{telefone}}'} />

              <label style={labelStyle}>Notas (opcional)</label>
              <input style={fieldStyle} value={config.notas || ''} onChange={e => updateConfig({ notas: e.target.value })} placeholder="ex: pedido feito pelo WhatsApp" />

              {(agendaConfig?.campos || []).length > 0 && (
                <>
                  <label style={labelStyle}>Campos próprios da empresa</label>
                  {(agendaConfig.campos || []).map((c: any) => (
                    <div key={c.chave} style={{ marginBottom: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#475569' }}>{c.rotulo}{c.obrigatorio ? ' *' : ''}{c.tipo === 'selecao' && c.opcoes?.length ? ` (${c.opcoes.join(' / ')})` : ''}</div>
                      <input style={fieldStyle} value={(config.campos || {})[c.chave] || ''}
                        onChange={e => updateConfig({ campos: { ...(config.campos || {}), [c.chave]: e.target.value } })}
                        placeholder={`valor ou variável, ex: {{${c.chave}}}`} />
                    </div>
                  ))}
                </>
              )}

              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', lineHeight: 1.6 }}>
                Depois deste bloco: <code>{'{{agendamento_ok}}'}</code> vale "sim" ou "nao" — ligue-o a uma condição para responder ao cliente.
                Em caso de falha, <code>{'{{agendamento_erro}}'}</code> traz o motivo em português (ex: "Esse horário deixou de estar disponível").
                Quando corre bem tem <code>{'{{agendamento_id}}'}</code>, <code>{'{{agendamento_data_extenso}}'}</code> e <code>{'{{agendamento_hora}}'}</code>.
              </div>
            </>
          )}

          {d.actionType === 'LIST_BOOKINGS' && (
            <>
              <label style={labelStyle}>Telefone do cliente</label>
              <input style={fieldStyle} value={config.telefone || ''} onChange={e => updateConfig({ telefone: e.target.value })} placeholder={'{{telefone}}'} />
              <label style={labelStyle}>Guardar a lista em</label>
              <input style={fieldStyle} value={config.guardarEm || ''} onChange={e => updateConfig({ guardarEm: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="minhas_marcacoes" />
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', lineHeight: 1.6 }}>
                Traz as marcações futuras deste número, já em texto para enviar. <code>{'{{tem_marcacoes}}'}</code> vale "sim" ou "nao".
              </div>
            </>
          )}

          {d.actionType === 'SEND_TEMPLATE' && (() => {
            const escolhido = templates.find((t: any) => String(t.id) === String(config.template_id));
            const nVars = escolhido ? new Set([...String(corpoDoTemplate(escolhido)).matchAll(/{{\s*(\d+)\s*}}/g)].map(m => m[1])).size : 0;
            const params: string[] = config.params || [];
            return (
              <>
                <label style={labelStyle}>Template</label>
                <select style={fieldStyle} value={config.template_id || ''}
                  onChange={e => {
                    const t = templates.find((x: any) => String(x.id) === e.target.value);
                    updateConfig({ template_id: e.target.value, template_nome: t?.name || '', params: [] });
                  }}>
                  <option value="">Selecione um template…</option>
                  {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.language}){t.status && t.status !== 'APPROVED' && t.status !== 'LOCAL' ? ` — ${t.status}` : ''}</option>)}
                </select>
                {templates.length === 0 && <div style={{ fontSize: '11px', color: '#b45309', marginTop: '6px' }}>Ainda não há templates. Crie em WhatsApp → Templates.</div>}
                {escolhido && (
                  <div style={{ marginTop: '10px', padding: '9px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#475569', whiteSpace: 'pre-wrap' }}>
                    {corpoDoTemplate(escolhido)}
                  </div>
                )}
                {nVars > 0 && (
                  <>
                    <label style={labelStyle}>Valores das variáveis</label>
                    {Array.from({ length: nVars }, (_, i) => (
                      <input key={i} style={{ ...fieldStyle, marginBottom: '6px' }} value={params[i] || ''}
                        placeholder={`valor de {{${i + 1}}} — pode usar {{nome_whatsapp}}`}
                        onChange={e => { const p = [...params]; p[i] = e.target.value; updateConfig({ params: p }); }} />
                    ))}
                    <div style={{ fontSize: '11px', color: '#666', lineHeight: 1.5 }}>
                      Pode escrever texto fixo ou uma variável do fluxo (ex: <code>{'{{nome_whatsapp}}'}</code>, <code>{'{{resposta}}'}</code>).
                    </div>
                  </>
                )}
              </>
            );
          })()}

          {d.actionType === 'GOTO_MENU' && (
            <>
              <label style={labelStyle}>Menu de destino</label>
              <select style={fieldStyle} value={config.menuNodeId || ''}
                onChange={e => {
                  const alvo = menusDoFluxo.find(m => m.id === e.target.value);
                  const i = menusDoFluxo.findIndex(m => m.id === e.target.value);
                  updateConfig({ menuNodeId: e.target.value, menuNodeNome: alvo ? nomeDoMenu(alvo, i) : '' });
                }}>
                <option value="">Selecione um menu deste fluxo...</option>
                {menusDoFluxo.map((m, i) => <option key={m.id} value={m.id}>{nomeDoMenu(m, i)}</option>)}
              </select>
              {menusDoFluxo.length === 0 && (
                <div style={{ fontSize: '11px', color: '#b45309', marginTop: '6px' }}>Este fluxo ainda não tem nenhum nó Menu.</div>
              )}
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', lineHeight: 1.5 }}>
                Leva a conversa de volta a esse menu: a pergunta é enviada outra vez e o cliente pode escolher outra opção. É assim que se faz a opção "voltar ao menu anterior" dentro de um submenu — sem repetir a saudação nem duplicar nós.
              </div>
            </>
          )}

          {d.actionType === 'WAIT_REPLY' && (
            <>
              <label style={labelStyle}>Pergunta a enviar (opcional)</label>
              <textarea style={{ ...fieldStyle, minHeight: '70px' }} value={config.mensagem || ''} onChange={e => updateConfig({ mensagem: e.target.value })} placeholder="Qual é o seu nome?" />

              <label style={labelStyle}>Guardar a resposta em (opcional)</label>
              <input style={fieldStyle} type="text" value={config.guardarEm || ''} onChange={e => updateConfig({ guardarEm: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="nome_cliente" />

              <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', lineHeight: 1.5 }}>
                O fluxo pára aqui e continua quando o cliente responder — sem repetir as mensagens anteriores. A resposta fica em <code>{'{{mensagem}}'}</code> e em <code>{'{{resposta}}'}</code>; se preencher o campo acima, fica também em <code>{'{{nome_do_campo}}'}</code>.
              </div>
            </>
          )}

          {d.actionType === 'DELAY' && (() => {
            // Compatibilidade com fluxos antigos gravados só com `minutos`.
            const segundosAtuais = config.segundos !== undefined ? parseInt(config.segundos, 10) : (parseInt(config.minutos || '1', 10) * 60);
            const presets = [
              { label: '5 seg', valor: 5 },
              { label: '15 seg', valor: 15 },
              { label: '30 seg', valor: 30 },
              { label: '1 min', valor: 60 },
              { label: '2 min', valor: 120 },
              { label: '5 min', valor: 300 },
              { label: '15 min', valor: 900 },
            ];
            return (
              <>
                <label style={labelStyle}>Tempo de espera</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {presets.map(p => (
                    <button
                      key={p.valor}
                      type="button"
                      onClick={() => updateConfig({ segundos: p.valor, minutos: undefined })}
                      style={{
                        padding: '5px 10px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer',
                        border: segundosAtuais === p.valor ? '1px solid #0E5A6B' : '1px solid #cbd5e1',
                        background: segundosAtuais === p.valor ? '#E1EEF0' : '#fff',
                        color: segundosAtuais === p.valor ? '#0E5A6B' : '#475569',
                        fontWeight: segundosAtuais === p.valor ? 700 : 500,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    style={{ ...fieldStyle, width: '100px' }}
                    type="number"
                    min={1}
                    max={900}
                    value={segundosAtuais}
                    onChange={e => updateConfig({ segundos: e.target.value, minutos: undefined })}
                  />
                  <span style={{ fontSize: '12px', color: '#666' }}>segundos (personalizado)</span>
                </div>
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
                  Máximo de 15 minutos (900 segundos) — a espera acontece em memória enquanto a mensagem está a ser processada, sem fila persistente. Varia o tempo entre respostas para não parecer sempre o mesmo robô a esperar 1 minuto. Para esperas mais longas (horas/dias), use um nó "Notificar Equipa" ou "Transferir para Humano" em vez de bloquear o fluxo.
                </div>
              </>
            );
          })()}

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
