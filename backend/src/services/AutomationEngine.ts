import { KnowledgeBaseService } from './KnowledgeBaseService';
import { AIGatewayService } from './AIGatewayService';
import { supabase } from '../lib/supabaseClient'; // Service role client

export interface WhatsAppMessage {
    id?: string;
    conversation_id?: string;
    channel_id: string;
    phone_number: string;
    contact_name: string;
    contact_picture?: string | null;
    content: string;
    direction: 'inbound' | 'outbound';
}

interface FlowNode {
    id: string;
    type: 'trigger' | 'condition' | 'action' | 'menu' | 'end';
    position?: { x: number; y: number };
    data: any;
}

interface FlowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
}

const MAX_GRAPH_STEPS = 200;
// Profundidade máxima de "Saltar para Outro Fluxo" encadeados (A chama B, que
// chama C, ...). Um fluxo que precise de mais do que isto está mal desenhado.
const MAX_SALTOS_ENCADEADOS = 5;

export class AutomationEngine {

    public static async getAutomations() {
        const { data: automations } = await supabase.from('automations').select('*').order('criado_em', { ascending: false });
        return (automations || []).map((a: any) => this.hydrateAutomation(a));
    }

    public static async deleteAutomation(id: number) {
        await supabase.from('automations').delete().eq('id', id);
    }

    /**
     * Aciona automações cujo nó de trigger é do tipo "webhook_generic" e cujo
     * webhookSource bate com o :source da rota POST /api/automation/webhook/:source
     */
    public static async processWebhook(webhookSource: string, payload: any, empresaId?: number) {
        const phoneToCheck = payload.from || payload.telefone || payload.phone || payload.remoteJid;
        if (phoneToCheck && await this.isBotPausedForPhone(phoneToCheck, empresaId)) {
            console.log(`[Human Handover] Ignorando webhook de ${phoneToCheck} pois o bot está pausado para este cliente.`);
            return;
        }

        let autoQuery = supabase.from('automations').select('*').eq('ativo', true);
        if (empresaId) autoQuery = autoQuery.eq('empresa_id', empresaId);
        const { data: automations } = await autoQuery;

        for (const automation of (automations || [])) {
            try {
                const { nodes, edges } = this.parseGraph(automation);
                const trigger = nodes.find(n => n.type === 'trigger');
                if (!trigger || trigger.data?.triggerKind !== 'webhook_generic') continue;
                if ((trigger.data?.webhookSource || '').toLowerCase() !== webhookSource.toLowerCase()) continue;

                const firstEdge = edges.find(e => e.source === trigger.id);
                if (!firstEdge) continue;

                await this.executeGraph(nodes, edges, firstEdge.target, { ...payload }, automation.empresa_id, [automation.id]);
            } catch (err) {
                console.error(`Erro ao executar automação ${automation.nome}:`, err);
            }
        }
    }

    /**
     * Ponto de entrada único para mensagens inbound do WhatsApp (substitui o antigo
     * WorkflowEngine.processIncomingMessage). Faz a sincronização com o CRM, aplica o
     * handover humano (bot_paused), testa os triggers "whatsapp_message" das automações
     * ativas e, se nada corresponder, cai no fallback de IA.
     */
    public static async processIncomingWhatsAppMessage(message: WhatsAppMessage) {
        try {
            const { data: channelData } = await supabase.from('wa_channels').select('empresa_id').eq('id', message.channel_id).single();
            const empresaId = channelData?.empresa_id;
            if (!empresaId) {
                // Falha fechada: sem saber a que empresa este canal pertence,
                // continuar processaria a mensagem contra automações e clientes
                // de TODAS as empresas em vez de nenhuma.
                console.error(`[AUTOPILOT] Canal ${message.channel_id} sem empresa_id associado — mensagem ignorada.`);
                return;
            }

            const conversationId = await this.getOrCreateConversation(message);
            await this.saveMessage(conversationId, message);

            if (message.direction !== 'inbound') return;

            const crmInfo = await this.syncCrmFromMessage(message, empresaId);

            if (await this.isBotPausedForPhone(message.phone_number, empresaId)) {
                console.log(`[Human Handover] Ignorando mensagem de ${message.phone_number} pois o bot está pausado para este cliente.`);
                return;
            }

            const { data: automations } = await supabase.from('automations').select('*').eq('ativo', true).eq('empresa_id', empresaId);

            // Só UM fluxo responde a cada mensagem (evita respostas duplicadas).
            // Antes era "o primeiro que a base de dados devolvesse" — sem ORDER BY,
            // portanto com dois fluxos ativos a apanhar a mesma mensagem, qual deles
            // respondia era imprevisível e podia até mudar de mensagem para mensagem.
            // Agora ganha o gatilho mais específico (palavra-chave/regex antes de
            // "qualquer mensagem") e, em caso de empate, o fluxo mais antigo.
            const candidatos = (automations || [])
                .map((automation: any) => {
                    const { nodes, edges } = this.parseGraph(automation);
                    const trigger = nodes.find((n: FlowNode) => n.type === 'trigger');
                    if (!trigger || trigger.data?.triggerKind !== 'whatsapp_message') return null;
                    if (!this.evaluateWhatsAppTrigger(trigger.data, message.content)) return null;
                    return { automation, nodes, edges, trigger };
                })
                .filter((c): c is NonNullable<typeof c> => c !== null)
                .sort((a, b) => {
                    const peso = (modo?: string) => (modo === 'any' || !modo ? 1 : 0);
                    const diff = peso(a.trigger.data?.matchMode) - peso(b.trigger.data?.matchMode);
                    if (diff !== 0) return diff;
                    return Number(a.automation.id) - Number(b.automation.id);
                });

            if (candidatos.length > 1) {
                console.log(`[AUTOPILOT] ${candidatos.length} fluxos ativos apanham esta mensagem; escolhido "${candidatos[0].automation.nome}" (gatilho mais específico). Ignorados: ${candidatos.slice(1).map(c => c.automation.nome).join(', ')}.`);
            }

            let handled = false;
            for (const { automation, nodes, edges, trigger } of candidatos) {
                const context: Record<string, any> = {
                    telefone: message.phone_number,
                    nome_whatsapp: message.contact_name,
                    mensagem: message.content,
                    channel_id: message.channel_id,
                    client_id: crmInfo.clienteId,
                    tags: (crmInfo.tags || []).join(','),
                    conversation_id: conversationId,
                    ...crmInfo.customFields
                };

                const firstEdge = edges.find((e: FlowEdge) => e.source === trigger.id);
                if (firstEdge) {
                    // O próprio fluxo entra na cadeia de saltos: assim um "Saltar
                    // para Outro Fluxo" que aponte de volta para ele é travado.
                    await this.executeGraph(nodes, edges, firstEdge.target, context, empresaId || null, [automation.id]);
                }
                handled = true;
                break; // só o fluxo escolhido responde
            }

            if (!handled) {
                await this.handleAIFallback(conversationId, message, empresaId);
            }
        } catch (error) {
            console.error('Erro no Automation Engine (WhatsApp):', error);
        }
    }

    // ============================================================
    // GRAFO — helpers de leitura/execução
    // ============================================================

    private static hydrateAutomation(a: any) {
        const { nodes, edges } = this.parseGraph(a);
        return { ...a, nodes, edges };
    }

    private static parseGraph(automation: any): { nodes: FlowNode[]; edges: FlowEdge[] } {
        const nodes = typeof automation.nodes === 'string' ? JSON.parse(automation.nodes) : (automation.nodes || []);
        const edges = typeof automation.edges === 'string' ? JSON.parse(automation.edges) : (automation.edges || []);
        return { nodes, edges };
    }

    private static evaluateWhatsAppTrigger(triggerData: any, content: string): boolean {
        const text = (content || '').toLowerCase().trim();
        const mode = triggerData?.matchMode || 'any';

        switch (mode) {
            case 'any':
                return true;
            case 'keyword': {
                const keywords = String(triggerData?.matchValue || '').toLowerCase().split(',');
                return keywords.some((kw: string) => kw.trim() && text.includes(kw.trim()));
            }
            case 'regex':
                try {
                    const regex = new RegExp(triggerData?.matchValue || '', 'i');
                    return regex.test(text);
                } catch { return false; }
            default:
                return false;
        }
    }

    private static async isBotPausedForPhone(rawPhone: string, empresaId?: number): Promise<boolean> {
        const phone = String(rawPhone).replace(/\D/g, '');
        if (!phone) return false;
        try {
            let clientQuery = supabase.from('clientes').select('bot_paused').or(`telefone.eq.${phone},telefone.ilike.%${phone}%`).limit(1);
            if (empresaId) clientQuery = clientQuery.eq('empresa_id', empresaId);
            const { data: client } = await clientQuery.single();
            return !!(client && client.bot_paused);
        } catch {
            return false;
        }
    }

    /**
     * Percorre o grafo a partir de startNodeId até não haver mais aresta de saída,
     * executando nós de ação e escolhendo o branch correto em nós de condição.
     */
    private static async executeGraph(nodes: FlowNode[], edges: FlowEdge[], startNodeId: string, initialContext: any, empresa_id: number | null, cadeiaFluxos: number[] = []): Promise<any> {
        let context = { ...initialContext };
        let currentNodeId: string | undefined = startNodeId;
        let iterations = 0;

        while (currentNodeId && iterations < MAX_GRAPH_STEPS) {
            iterations++;
            const node = nodes.find(n => n.id === currentNodeId);
            if (!node) break;

            if (node.type === 'end') break;

            if (node.type === 'condition') {
                const conditionMet = this.evaluateCondition(node.data, context);
                const handle = conditionMet ? 'yes' : 'no';
                const edge = edges.find(e => e.source === node.id && e.sourceHandle === handle);
                currentNodeId = edge?.target;
                continue;
            }

            if (node.type === 'menu') {
                const matchedOption = this.evaluateMenu(node.data, context);
                const edge = matchedOption ? edges.find(e => e.source === node.id && e.sourceHandle === matchedOption.id) : undefined;
                currentNodeId = edge?.target;
                continue;
            }

            if (node.type === 'action') {
                await this.executeAction(node, context, empresa_id, nodes, edges, cadeiaFluxos);
                const edge = edges.find(e => e.source === node.id);
                currentNodeId = edge?.target;
                continue;
            }

            // trigger nodes não deveriam ser re-visitados no meio do grafo; se acontecer, encerra
            break;
        }

        return context;
    }

    private static evaluateCondition(data: any, context: any): boolean {
        const conditionVar = this.parseString(data?.variable, context);
        const operator = data?.operator || '==';
        const conditionVal = this.parseString(data?.value, context);

        switch (operator) {
            case '==':
            case '===':
                return conditionVar === conditionVal;
            case '!=':
                return conditionVar !== conditionVal;
            case '>':
                return Number(conditionVar) > Number(conditionVal);
            case '<':
                return Number(conditionVar) < Number(conditionVal);
            case 'contains':
                return conditionVar.includes(conditionVal);
            default:
                return false;
        }
    }

    /**
     * Nó de menu (respostas rápidas, estilo ManyChat): escolhe a primeira opção cujo
     * matchValue apareça na mensagem do utilizador. Sem correspondência, o fluxo
     * termina ali (mesma semântica de "sem aresta de saída" do nó de condição).
     */
    private static evaluateMenu(data: any, context: any): { id: string } | undefined {
        const mensagem = this.parseString(data?.variable || '{{mensagem}}', context).trim().toLowerCase();
        const options: any[] = Array.isArray(data?.options) ? data.options : [];
        // Correspondência exata primeiro — essencial para menus numerados: sem isto,
        // responder "1" também "batia" na opção "10"/"11" (o "1" está contido lá
        // dentro), e o fluxo saltava para o ramo errado. Só cai para "contém" como
        // fallback, para continuar a aceitar respostas em texto livre por palavra-chave.
        const exact = options.find(opt => opt.matchValue && mensagem === String(opt.matchValue).trim().toLowerCase());
        if (exact) return exact;
        return options.find(opt => opt.matchValue && mensagem.includes(String(opt.matchValue).trim().toLowerCase()));
    }

    private static async executeAction(node: FlowNode, context: any, empresa_id: number | null, allNodes: FlowNode[], allEdges: FlowEdge[], cadeiaFluxos: number[] = []) {
        const config = node.data?.config || {};

        switch (node.data?.actionType) {
            case 'LOG_MESSAGE': {
                const msg = this.parseString(config.mensagem, context);
                console.log(`[AUTOPILOT LOG]: ${msg}`);
                break;
            }

            case 'ADD_TAG':
            case 'REMOVE_TAG': {
                const clientId = context['client_id'];
                const tagsRaw = this.parseString(config.tag || config.tags, context);
                const tagList = tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean);

                if (!clientId || tagList.length === 0) {
                    console.error(`[AUTOPILOT] ${node.data.actionType} falhou: sem client_id no contexto ou sem tag indicada (o cliente é criado automaticamente ao receber a mensagem).`);
                    break;
                }

                try {
                    const { data: cliente } = await supabase.from('clientes').select('tags').eq('id', clientId).single();
                    let currentTags: string[] = cliente?.tags || [];
                    if (node.data.actionType === 'ADD_TAG') {
                        currentTags = Array.from(new Set([...currentTags, ...tagList]));
                    } else {
                        currentTags = currentTags.filter(t => !tagList.includes(t));
                    }
                    await supabase.from('clientes').update({ tags: currentTags }).eq('id', clientId);
                    context['tags'] = currentTags.join(',');
                    console.log(`[AUTOPILOT] ${node.data.actionType}: ${tagList.join(', ')} (cliente ${clientId})`);
                } catch (e) {
                    console.error(`[AUTOPILOT] Erro em ${node.data.actionType}:`, e);
                }
                break;
            }

            case 'SET_CUSTOM_FIELD': {
                const clientId = context['client_id'];
                const fieldName = this.parseString(config.campo, context);
                const fieldValue = this.parseString(config.valor, context);

                if (!clientId || !fieldName) {
                    console.error('[AUTOPILOT] SET_CUSTOM_FIELD falhou: sem client_id no contexto ou sem nome de campo.');
                    break;
                }

                try {
                    const { data: cliente } = await supabase.from('clientes').select('custom_fields').eq('id', clientId).single();
                    const merged = { ...(cliente?.custom_fields || {}), [fieldName]: fieldValue };
                    await supabase.from('clientes').update({ custom_fields: merged }).eq('id', clientId);
                    context[fieldName] = fieldValue;
                    console.log(`[AUTOPILOT] SET_CUSTOM_FIELD: ${fieldName}=${fieldValue} (cliente ${clientId})`);
                } catch (e) {
                    console.error('[AUTOPILOT] Erro em SET_CUSTOM_FIELD:', e);
                }
                break;
            }

            case 'EXTERNAL_REQUEST': {
                const url = this.parseString(config.url, context);
                const method = String(config.method || 'GET').toUpperCase();
                const bodyTemplate = config.body ? this.parseString(config.body, context) : undefined;

                if (!url) {
                    console.error('[AUTOPILOT] EXTERNAL_REQUEST falhou: sem URL configurada.');
                    break;
                }

                try {
                    const res = await fetch(url, {
                        method,
                        headers: { 'Content-Type': 'application/json' },
                        body: (method !== 'GET' && method !== 'HEAD' && bodyTemplate) ? bodyTemplate : undefined
                    });
                    let responseText = '';
                    try { responseText = await res.text(); } catch {}
                    context['external_response'] = responseText;
                    context['external_status'] = res.status;
                    console.log(`[AUTOPILOT] EXTERNAL_REQUEST ${method} ${url} -> ${res.status}`);
                } catch (e) {
                    console.error('[AUTOPILOT] EXTERNAL_REQUEST falhou:', e);
                }
                break;
            }

            case 'NOTIFY_TEAM': {
                const destinatario = this.parseString(config.destinatario, context);
                const mensagem = this.parseString(config.mensagem, context);
                const canal = config.canal === 'whatsapp' ? 'whatsapp' : 'email';

                if (!destinatario || !mensagem) {
                    console.error('[AUTOPILOT] NOTIFY_TEAM falhou: falta destinatário ou mensagem.');
                    break;
                }

                try {
                    if (canal === 'whatsapp') {
                        const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                        const { data: channel } = empresa_id
                            ? await supabase.from('wa_channels').select('id').eq('empresa_id', empresa_id).limit(1).single()
                            : { data: null }; // sem empresa_id não há como escolher um canal em segurança — nunca usar "o primeiro canal da tabela toda" (vazamento cross-tenant)
                        if (channel) await WhatsAppChannelManager.sendMessage(supabase, channel.id, destinatario, mensagem);
                    } else {
                        const { EmailService } = require('./EmailService');
                        await EmailService.enviarEmailPersonalizado(destinatario, 'Notificação do Autopilot', mensagem, empresa_id);
                    }
                    console.log(`[AUTOPILOT] NOTIFY_TEAM enviado para ${destinatario} via ${canal}`);
                } catch (e) {
                    console.error('[AUTOPILOT] Erro em NOTIFY_TEAM:', e);
                }
                break;
            }

            case 'HANDOFF_HUMAN': {
                // Pausa o bot para este cliente (mesmo mecanismo usado manualmente no
                // inbox do WhatsApp) — nenhuma automação/fallback de IA volta a responder
                // a este telefone até um agente reativar o bot.
                const handoffPhone = this.parseString(config.telefone || config.phone || '{{telefone}}', context);
                const avisoMensagem = config.mensagem ? this.parseString(config.mensagem, context) : '';

                if (!handoffPhone) {
                    console.error('[AUTOPILOT] HANDOFF_HUMAN falhou: sem telefone no contexto.');
                    break;
                }

                try {
                    const phoneDigits = handoffPhone.replace(/\D/g, '');
                    let updateQuery = supabase.from('clientes').update({ bot_paused: true }).or(`telefone.eq.${handoffPhone},telefone.ilike.%${phoneDigits}%`);
                    if (empresa_id) updateQuery = updateQuery.eq('empresa_id', empresa_id);
                    await updateQuery;

                    if (avisoMensagem) {
                        const waChannelId = config.channel_id || context['channel_id'];
                        const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                        let finalChannel = waChannelId;
                        if (!finalChannel) {
                            const { data: channel } = empresa_id
                            ? await supabase.from('wa_channels').select('id').eq('empresa_id', empresa_id).limit(1).single()
                            : { data: null }; // sem empresa_id não há como escolher um canal em segurança — nunca usar "o primeiro canal da tabela toda" (vazamento cross-tenant)
                            if (channel) finalChannel = channel.id;
                        }
                        if (finalChannel) {
                            await WhatsAppChannelManager.sendMessage(supabase, finalChannel, handoffPhone, avisoMensagem);
                        }
                    }
                    console.log(`[AUTOPILOT] HANDOFF_HUMAN: bot pausado para ${handoffPhone}`);
                } catch (e) {
                    console.error('[AUTOPILOT] Erro em HANDOFF_HUMAN:', e);
                }
                break;
            }

            case 'AI_REPLY': {
                // Resposta gerada por IA com contexto da Base de Conhecimento (RAG) —
                // chamada enxuta ao AIGatewayService (gateway self-hospedado primeiro, OpenAI como
                // reserva), não o loop completo do EnterpriseAssistantService (que tem
                // tools de sistema de ficheiros, Excel, etc. — pesadas demais para uma
                // resposta pontual num fluxo).
                const aiPhone = this.parseString(config.telefone || config.phone || '{{telefone}}', context);
                const aiPromptTemplate = this.parseString(config.prompt, context);

                if (!aiPhone || !aiPromptTemplate) {
                    console.error('[AUTOPILOT] AI_REPLY falhou: falta telefone ou prompt.');
                    break;
                }

                try {
                    const knowledgeContext = empresa_id
                        ? await KnowledgeBaseService.searchAsContext(String(empresa_id), aiPromptTemplate, supabase, 5)
                        : '';

                    const systemPrompt = knowledgeContext
                        ? `Você é um assistente de atendimento ao cliente via WhatsApp. Responda de forma direta, profissional e curta, usando APENAS as informações abaixo da Base de Conhecimento da empresa. Se a informação não estiver lá, diga que não tem essa informação em vez de inventar.\n\n=== BASE DE CONHECIMENTO ===\n${knowledgeContext}`
                        : 'Você é um assistente de atendimento ao cliente via WhatsApp. Responda de forma direta, profissional e curta.';

                    const completion = await AIGatewayService.chamarComFallback({
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: aiPromptTemplate }
                        ]
                    });

                    const aiText = completion.choices[0]?.message?.content;
                    if (aiText) {
                        context['ai_response'] = aiText;
                        const waChannelId = config.channel_id || context['channel_id'];
                        const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                        let finalChannel = waChannelId;
                        if (!finalChannel) {
                            const { data: channel } = empresa_id
                                ? await supabase.from('wa_channels').select('id').eq('empresa_id', empresa_id).limit(1).single()
                                : { data: null };
                            if (channel) finalChannel = channel.id;
                        }
                        if (finalChannel) {
                            await WhatsAppChannelManager.sendMessage(supabase, finalChannel, aiPhone, aiText);
                            console.log(`[AUTOPILOT] AI_REPLY enviado para ${aiPhone}`);
                        }
                    }
                } catch (e) {
                    console.error('[AUTOPILOT] Erro em AI_REPLY:', e);
                }
                break;
            }

            case 'JUMP_TO_WORKFLOW': {
                const targetName = config.target_workflow_nome;
                if (targetName) {
                    try {
                        // .limit(1).maybeSingle() em vez de .single(): os nomes das
                        // automações não são únicos, e o .single() rebentava (e o
                        // salto era silenciosamente ignorado) sempre que existissem
                        // dois fluxos com o mesmo nome. O .order fixa qual deles é
                        // escolhido, em vez de depender da ordem do Postgres.
                        let targetQuery = supabase.from('automations').select('*').eq('nome', targetName).eq('ativo', true);
                        if (empresa_id) targetQuery = targetQuery.eq('empresa_id', empresa_id);
                        const { data: targetAuto } = await targetQuery.order('id', { ascending: true }).limit(1).maybeSingle();

                        if (!targetAuto) {
                            console.warn(`[JUMP_TO_WORKFLOW] Automação alvo não encontrada ou inativa: ${targetName}`);
                            break;
                        }

                        // Travão de ciclos: sem isto, dois fluxos a saltarem um para o
                        // outro (A→B→A) chamavam-se recursivamente para sempre até
                        // esgotarem a memória e derrubarem o backend — de todas as
                        // empresas, não só de quem configurou o ciclo.
                        if (cadeiaFluxos.includes(targetAuto.id)) {
                            console.warn(`[JUMP_TO_WORKFLOW] Ciclo detetado: "${targetName}" já está nesta cadeia de saltos (${cadeiaFluxos.join(' → ')}). Salto ignorado.`);
                            break;
                        }
                        if (cadeiaFluxos.length >= MAX_SALTOS_ENCADEADOS) {
                            console.warn(`[JUMP_TO_WORKFLOW] Limite de ${MAX_SALTOS_ENCADEADOS} saltos encadeados atingido. Salto para "${targetName}" ignorado.`);
                            break;
                        }

                        console.log(`[JUMP_TO_WORKFLOW] A saltar para a automação: ${targetName}`);
                        const { nodes: targetNodes, edges: targetEdges } = this.parseGraph(targetAuto);
                        const targetTrigger = targetNodes.find(n => n.type === 'trigger');
                        const targetFirstEdge = targetTrigger ? targetEdges.find(e => e.source === targetTrigger.id) : undefined;
                        if (targetFirstEdge) {
                            await this.executeGraph(targetNodes, targetEdges, targetFirstEdge.target, context, targetAuto.empresa_id, [...cadeiaFluxos, targetAuto.id]);
                        }
                    } catch (e) {
                        console.error(`Erro ao saltar para workflow ${targetName}:`, e);
                    }
                }
                break;
            }

            case 'SEND_EMAIL': {
                const emailTo = this.parseString(config.para || config.to, context);
                const emailSubject = this.parseString(config.assunto || config.subject, context);
                const emailBody = this.parseString(config.mensagem || config.corpo || config.body, context);

                if (emailTo && emailSubject && emailBody) {
                    try {
                        const { EmailService } = require('./EmailService');
                        await EmailService.enviarEmailPersonalizado(emailTo, emailSubject, emailBody, empresa_id);
                        console.log(`[AUTOPILOT] Email enviado para ${emailTo}`);
                    } catch (e) {
                        console.error('[AUTOPILOT] Erro ao enviar email:', e);
                    }
                }
                break;
            }

            case 'SEND_WHATSAPP':
            case 'REPLY_MESSAGE': {
                const waPhone = this.parseString(config.telefone || config.phone || '{{telefone}}', context);
                const waMessage = this.parseString(config.mensagem || config.message, context);
                const waChannelId = config.channel_id || context['channel_id'];

                if (waPhone && waMessage) {
                    try {
                        const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                        let finalChannel = waChannelId;
                        if (!finalChannel) {
                            const { data: channel } = empresa_id
                            ? await supabase.from('wa_channels').select('id').eq('empresa_id', empresa_id).limit(1).single()
                            : { data: null }; // sem empresa_id não há como escolher um canal em segurança — nunca usar "o primeiro canal da tabela toda" (vazamento cross-tenant)
                            if (channel) finalChannel = channel.id;
                        }

                        if (finalChannel) {
                            const sentId = await WhatsAppChannelManager.sendMessage(supabase, finalChannel, waPhone, waMessage);
                            console.log(`[AUTOPILOT] WhatsApp enviado para ${waPhone}`);
                            // Sem isto, a mensagem chega mesmo ao telemóvel do cliente (a API
                            // externa foi chamada com sucesso) mas nunca aparece na conversa
                            // dentro do CRM — ninguém na equipa vê o que o Autopilot respondeu.
                            if (context['conversation_id']) {
                                await this.saveMessage(context['conversation_id'], {
                                    id: typeof sentId === 'string' ? sentId : undefined,
                                    channel_id: finalChannel,
                                    phone_number: waPhone,
                                    contact_name: 'Autopilot',
                                    content: waMessage,
                                    direction: 'outbound'
                                });
                            }
                        }
                    } catch (e) {
                        console.error('[AUTOPILOT] Erro ao enviar WhatsApp:', e);
                    }
                }
                break;
            }

            case 'SEND_IMAGE':
            case 'SEND_VIDEO':
            case 'SEND_AUDIO':
            case 'SEND_DOCUMENT': {
                const filePath = this.parseString(config.ficheiro || config.imagem || config.video || config.audio || config.documento, context);
                const mediaPhone = this.parseString(config.telefone || config.phone || '{{telefone}}', context);
                const mediaCaption = config.legenda ? this.parseString(config.legenda, context) : '';
                const mediaChannelId = config.channel_id || context['channel_id'];

                if (!filePath || !mediaPhone) {
                    console.error(`[AUTOPILOT] ${node.data.actionType} falhou: falta ficheiro ou telefone de destino.`);
                    break;
                }

                try {
                    const path = require('path');
                    // Ficheiros novos ficam no Supabase Storage e chegam aqui como
                    // link. Caminhos locais são de automações guardadas antes dessa
                    // mudança (ou de desenvolvimento) e continuam a ser lidos do disco.
                    const ehLink = /^https?:\/\//i.test(filePath);
                    const fileName = ehLink
                        ? decodeURIComponent(filePath.split('?')[0].split('/').pop() || 'ficheiro')
                        : path.basename(filePath);
                    const mimeType = this.mimeTypeForFile(ehLink ? filePath.split('?')[0] : filePath);

                    let mediaParaEnviar: string;
                    let base64Raw = '';
                    if (ehLink) {
                        mediaParaEnviar = filePath;
                    } else {
                        const fs = require('fs');
                        if (!fs.existsSync(filePath)) {
                            console.error(`[AUTOPILOT] ${node.data.actionType} falhou: ficheiro não encontrado em ${filePath}. Reenvie o ficheiro na configuração do nó.`);
                            break;
                        }
                        // Leitura assíncrona — não bloqueia o event loop em ficheiros grandes
                        // (a API do WhatsApp exige o payload completo num único pedido, então
                        // não há streaming real possível neste ponto, mas isto evita travar o
                        // resto do backend enquanto o ficheiro é lido/codificado).
                        const buffer = await fs.promises.readFile(filePath);
                        base64Raw = buffer.toString('base64');
                        // Formato enviado à Evolution/Meta: SEM ";name=" (o parser delas só
                        // aceita "data:mime;base64,..."). O nome do ficheiro para o CRM vai
                        // à parte, só na cópia guardada em wa_messages.
                        mediaParaEnviar = `data:${mimeType};base64,${base64Raw}`;
                    }

                    const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                    let finalChannel = mediaChannelId;
                    if (!finalChannel) {
                        const { data: channel } = empresa_id
                            ? await supabase.from('wa_channels').select('id').eq('empresa_id', empresa_id).limit(1).single()
                            : { data: null }; // sem empresa_id não há como escolher um canal em segurança — nunca usar "o primeiro canal da tabela toda" (vazamento cross-tenant)
                        if (channel) finalChannel = channel.id;
                    }

                    if (finalChannel) {
                        const sent = await WhatsAppChannelManager.sendMediaMessage(supabase, finalChannel, mediaPhone, mediaParaEnviar, fileName, mediaCaption);
                        if (sent) {
                            console.log(`[AUTOPILOT] ${node.data.actionType} enviado para ${mediaPhone}: ${fileName}`);
                            // Mesma lacuna do REPLY_MESSAGE: sem isto, o ficheiro chega ao
                            // telemóvel do cliente mas nunca aparece na conversa no CRM.
                            if (context['conversation_id']) {
                                const crmContent = ehLink
                                    ? `${mediaCaption ? mediaCaption + ' ' : ''}[MEDIA_URL:${filePath}]`
                                    : `${mediaCaption ? mediaCaption + ' ' : ''}[MEDIA_BASE64:data:${mimeType};name=${encodeURIComponent(fileName)};base64,${base64Raw}]`;
                                await this.saveMessage(context['conversation_id'], {
                                    channel_id: finalChannel,
                                    phone_number: mediaPhone,
                                    contact_name: 'Autopilot',
                                    content: crmContent,
                                    direction: 'outbound'
                                });
                            }
                        } else {
                            console.error(`[AUTOPILOT] ${node.data.actionType} falhou ao enviar para ${mediaPhone}`);
                        }
                    } else {
                        console.error(`[AUTOPILOT] ${node.data.actionType} falhou: nenhum canal de WhatsApp configurado.`);
                    }
                } catch (e) {
                    console.error(`[AUTOPILOT] Erro ao enviar ${node.data.actionType}:`, e);
                }
                break;
            }

            case 'DELAY':
            case 'WAIT': {
                // Ainda é uma espera em memória, dentro do mesmo processo — sem fila
                // persistente, um restart/deploy do backend durante a espera perde o
                // resto do fluxo. Por isso capamos num valor curto e seguro; delays
                // longos (horas/dias) precisariam de um agendador próprio, fora do
                // motor de execução síncrono do webhook.
                const MAX_DELAY_SECONDS = 15 * 60;
                // `segundos` é o campo atual (granularidade fina); `minutos`/`minutes`
                // ficam como fallback para fluxos gravados antes desta alteração.
                const requestedSeconds = config.segundos !== undefined
                    ? parseInt(config.segundos, 10)
                    : parseInt(config.minutos || config.minutes || '1', 10) * 60;
                const delaySeconds = Math.min(Math.max(requestedSeconds || 1, 0), MAX_DELAY_SECONDS);
                if (requestedSeconds > MAX_DELAY_SECONDS) {
                    console.warn(`[AUTOPILOT] DELAY pedia ${requestedSeconds}s — limitado a ${MAX_DELAY_SECONDS}s (sem fila persistente para esperas longas).`);
                }
                console.log(`[AUTOPILOT] A aguardar ${delaySeconds} segundo(s)...`);
                await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
                break;
            }

            default:
                console.log(`Ação não reconhecida no Autopilot: ${node.data?.actionType}`);
        }
    }

    // ============================================================
    // Sincronização com o CRM a partir de mensagens do WhatsApp
    // (portado do antigo WorkflowEngine.processIncomingMessage)
    // ============================================================

    private static async syncCrmFromMessage(message: WhatsAppMessage, empresaId?: number): Promise<{ clienteId?: string; tags: string[]; customFields: Record<string, any> }> {
        let afiliadoId = null;
        const refMatch = message.content.match(/(?:\[|\()Ref:\s*([A-Za-z0-9]+)(?:\]|\))/i);
        if (refMatch && refMatch[1]) {
            const afiliadoCode = refMatch[1].toUpperCase();
            try {
                const { data: afiliado } = await supabase.from('afiliados').select('id').eq('codigo_referencia', afiliadoCode).single();
                if (afiliado) afiliadoId = afiliado.id;
            } catch (e) {
                console.error('Erro no rastreio de afiliado WhatsApp:', e);
            }
        }

        // Falha fechada: sem empresaId não há como procurar/criar um cliente em
        // segurança — procurar só pelo telefone globalmente arriscava encontrar
        // (e alterar) o cliente errado de outra empresa.
        if (!empresaId) return { tags: [], customFields: {} };
        const { data: checkCliente } = await supabase.from('clientes').select('id, tags, custom_fields').eq('telefone', message.phone_number).eq('empresa_id', empresaId).maybeSingle();
        let clienteId = checkCliente?.id;
        let tags: string[] = checkCliente?.tags || [];
        let customFields: Record<string, any> = checkCliente?.custom_fields || {};

        if (clienteId) {
            if (afiliadoId) {
                await supabase.from('clientes').update({ afiliado_id: afiliadoId }).eq('id', clienteId).is('afiliado_id', null);
            }

            const { data: negocioAtivo } = await supabase.from('negocios')
                .select('id')
                .eq('cliente_id', clienteId)
                .not('fase', 'in', '("Perdido","Ganhos","Fechado")')
                .limit(1)
                .maybeSingle();

            if (!negocioAtivo) {
                const { data: clienteData } = await supabase.from('clientes').select('empresa_id').eq('id', clienteId).maybeSingle();
                if (clienteData?.empresa_id) {
                    await supabase.from('negocios').insert({
                        empresa_id: clienteData.empresa_id,
                        cliente_id: clienteId,
                        titulo: `Follow-up WhatsApp: ${message.contact_name || message.phone_number}`,
                        valor_estimado: 0,
                        fase: 'Nova Lead'
                    });
                }
            }
        } else {
            const empId = empresaId;

            const { data: novoCliente } = await supabase.from('clientes').insert({
                empresa_id: empId,
                nome: message.contact_name || message.phone_number,
                telefone: message.phone_number,
                afiliado_id: afiliadoId
            }).select('id, empresa_id').maybeSingle();

            if (novoCliente && empId) {
                clienteId = novoCliente.id;
                await supabase.from('negocios').insert({
                    empresa_id: empId,
                    cliente_id: clienteId,
                    titulo: `Lead WhatsApp: ${message.contact_name || message.phone_number}`,
                    valor_estimado: 0,
                    fase: 'Nova Lead'
                });
            }
        }

        return { clienteId, tags, customFields };
    }

    private static async getOrCreateConversation(message: WhatsAppMessage): Promise<string> {
        const { data: existing } = await supabase
            .from('wa_conversations')
            .select('id')
            .eq('channel_id', message.channel_id)
            .eq('phone_number', message.phone_number)
            .single();

        const updates: any = { last_message_at: new Date().toISOString() };
        if (message.direction === 'inbound') {
            updates.last_client_message_at = updates.last_message_at;
        }

        if (existing) {
            if (message.contact_name && message.contact_name !== message.phone_number) {
                updates.contact_name = message.contact_name;
            }
            // Refrescar a foto sempre que tivermos uma nova — os links da CDN do
            // WhatsApp expiram ao fim de algum tempo, por isso não basta guardar
            // uma vez; cada mensagem nova é uma oportunidade de renovar o link.
            if (message.contact_picture) {
                updates.contact_picture = message.contact_picture;
            }
            await supabase.from('wa_conversations').update(updates).eq('id', existing.id);
            return existing.id;
        }

        const { data: newConv, error } = await supabase
            .from('wa_conversations')
            .insert({
                channel_id: message.channel_id,
                phone_number: message.phone_number,
                contact_name: message.contact_name,
                contact_picture: message.contact_picture || null,
                status: 'open',
                last_message_at: updates.last_message_at,
                last_client_message_at: updates.last_client_message_at || null
            })
            .select('id')
            .single();

        if (error || !newConv) {
            console.error('Erro ao criar conversa no DB:', error);
            throw new Error('Não foi possível criar a conversa.');
        }

        return newConv.id;
    }

    private static async saveMessage(conversationId: string, message: WhatsAppMessage) {
        await supabase.from('wa_messages').insert({
            conversation_id: conversationId,
            message_id: message.id || Date.now().toString(),
            direction: message.direction,
            content: message.content,
            status: 'delivered'
        });
    }

    // Interruptor geral: dá ao dono da empresa controlo real sobre se o
    // Assistente IA responde automaticamente no WhatsApp. Desativar uma
    // automação do Autopilot NÃO desliga isto — pelo contrário, sem nenhuma
    // automação ativa a apanhar a mensagem, é este fallback que passa a
    // responder a TUDO. Por omissão fica ativo (comportamento já existente)
    // até a empresa desligar explicitamente nas Definições.
    private static async isAIFallbackEnabled(empresaId?: number): Promise<boolean> {
        if (!empresaId) return true;
        try {
            const { data } = await supabase.from('configuracoes').select('valor')
                .eq('empresa_id', empresaId).eq('chave', 'ia_whatsapp_ativa').maybeSingle();
            if (!data) return true;
            return data.valor !== 'false';
        } catch {
            return true;
        }
    }

    // O Assistente IA é um módulo pago à parte (licenciado por empresa em
    // SaaS Global > Licenciamento, mesmo id 'chat' já usado para o módulo
    // interno "Assistente IA") — sem isto, qualquer empresa com WhatsApp
    // ligado ganhava a IA de graça, mesmo sem ter contratado o módulo.
    //
    // Empresas criadas antes deste controlo existir nunca tiveram a linha
    // "modulos_empresa" gravada em configuracoes — a mesma situação que o
    // frontend já trata como "acesso concedido por defeito" (grandfather
    // clause, LEGACY_DEFAULT_MODULES em App.tsx/WhatsAppChatApp.tsx, e o
    // próprio /api/auth/login, que devolve esta mesma lista por omissão).
    // Sem este fallback aqui, essas empresas — a maioria das já existentes —
    // ficavam com o Assistente IA silenciosamente desligado, mesmo estando
    // tudo "ativo" no ecrã.
    private static async empresaTemChatLicenciado(empresaId?: number): Promise<boolean> {
        if (!empresaId) return false;
        try {
            const { data } = await supabase.from('configuracoes').select('valor')
                .eq('empresa_id', empresaId).eq('chave', 'modulos_empresa').maybeSingle();
            if (!data?.valor) return true; // sem registo explícito → grandfathered, como em todo o resto do sistema
            const modulos = JSON.parse(data.valor);
            return Array.isArray(modulos) && modulos.includes('chat');
        } catch {
            return true;
        }
    }

    private static async handleAIFallback(conversationId: string, message: WhatsAppMessage, empresaId?: number) {
        try {
            if (!(await this.empresaTemChatLicenciado(empresaId))) {
                console.log(`[Automation Engine] Módulo Assistente IA não licenciado para esta empresa — a ignorar mensagem de ${message.phone_number}.`);
                return;
            }
            if (!(await this.isAIFallbackEnabled(empresaId))) {
                console.log(`[Automation Engine] Assistente IA desativado nas Definições desta empresa — a ignorar mensagem de ${message.phone_number} sem gastar tokens.`);
                return;
            }
            console.log(`[Automation Engine] Acionando o Assistente IA para mensagem de ${message.phone_number}`);

            const { EnterpriseAssistantService } = require('./EnterpriseAssistantService');

            // Reaproveitar a conversa de IA já existente deste número (se houver) para
            // manter o contexto entre mensagens — sem isto, cada mensagem recebida
            // arrancava uma conversa nova sem memória do que já foi dito (ex: um
            // agendamento a meio de confirmação perdia tudo na mensagem seguinte).
            let existingConversaId: number | undefined;
            try {
                let conversaQuery = supabase.from('conversas_ia').select('id').eq('utilizador_id', message.phone_number);
                conversaQuery = empresaId ? conversaQuery.eq('empresa_id', empresaId) : conversaQuery.is('empresa_id', null);
                const { data: existingConversa } = await conversaQuery.order('id', { ascending: false }).limit(1).maybeSingle();
                existingConversaId = existingConversa?.id;
            } catch (e) {
                console.error('[Automation Engine] Erro ao procurar conversa de IA existente:', e);
            }

            const aiResponseObj = await EnterpriseAssistantService.chat(
                message.phone_number,
                'cliente (WhatsApp)',
                message.content,
                existingConversaId,
                empresaId,
                { telefone: message.phone_number, nomeContato: message.contact_name }
            );

            const aiResponse = aiResponseObj?.response;

            if (aiResponse) {
                try {
                    const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                    await WhatsAppChannelManager.sendMessage(supabase, message.channel_id, message.phone_number, aiResponse);
                } catch (e) {
                    console.error('[Automation Engine] Erro a enviar resposta da IA via ChannelManager:', e);
                }

                await this.saveMessage(conversationId, {
                    channel_id: message.channel_id,
                    phone_number: message.phone_number,
                    contact_name: 'Assistente IA',
                    content: aiResponse,
                    direction: 'outbound'
                });
            }
        } catch (error) {
            console.error('[Automation Engine] Erro no Fallback da IA:', error);
        }
    }

    private static readonly MIME_TYPES_BY_EXT: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
        '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.webm': 'video/webm',
        '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
        '.pdf': 'application/pdf', '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.txt': 'text/plain', '.csv': 'text/csv', '.zip': 'application/zip'
    };

    private static mimeTypeForFile(filePath: string): string {
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
        return this.MIME_TYPES_BY_EXT[ext] || 'application/octet-stream';
    }

    /**
     * Substitui variáveis {{chave}} pelos valores reais do contexto de execução.
     */
    private static parseString(template: string, context: any): string {
        if (!template) return '';
        return template.replace(/{{(.*?)}}/g, (_, key) => {
            return context[key.trim()] || '';
        });
    }
}
