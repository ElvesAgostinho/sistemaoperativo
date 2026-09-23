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
// Quanto tempo um fluxo fica à espera da resposta do cliente antes de a conversa
// recomeçar do princípio (ninguém responde a um menu três dias depois).
const ESTADO_FLUXO_VALIDADE_MS = 6 * 60 * 60 * 1000;
// Respostas fora das opções seguidas antes de seguir pela saída "sem resposta".
const MENU_MAX_TENTATIVAS = 3;
// "Voltar ao menu" seguidos numa só passagem (proteção contra ciclos mal feitos).
const MAX_SALTOS_DE_MENU = 10;

/**
 * Execução "a seco": corre a MESMA lógica do motor mas em vez de enviar
 * mensagens, escrever na base de dados ou chamar APIs, regista o que teria
 * acontecido. É o que alimenta o simulador do construtor de fluxos.
 */
export interface Simulacao {
    passos: { nodeId: string; tipo: string; titulo: string; detalhe?: string }[];
    mensagens: { de: 'bot'; texto: string; tipo?: string }[];
    pendente: { nodeId: string; contexto: any; tentativas: number } | null;
    terminou: boolean;
}

/** Como o grafo está a ser executado (arranque pelo gatilho ou retoma de uma resposta). */
interface ExecOpcoes {
    mensagemDisponivel?: boolean;   // a mensagem que chegou é a resposta a um nó de espera
    conversationId?: string | null; // onde guardar o estado quando o fluxo espera
    automationId?: number | null;
    tentativas?: number;            // respostas inválidas já dadas no nó onde retomámos
    simulacao?: Simulacao;          // execução a seco (nada sai para o mundo real)
}
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
        // Nunca correr automações sem saber de que empresa são (ver nota no controller).
        if (!empresaId) {
            console.error('[AUTOPILOT] Webhook sem empresa_id — ignorado para não cruzar dados entre empresas.');
            return;
        }
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
            // O Evolution/Meta reentregam o mesmo evento quando o webhook demora ou
            // falha. Sem isto, a mesma mensagem era gravada e respondida duas vezes.
            if (!(await this.registarEventoUnico(message))) {
                console.log(`[AUTOPILOT] Evento ${message.id} repetido — ignorado.`);
                return;
            }
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

            // O cliente está a meio de um fluxo (respondeu a um menu, a uma
            // pergunta)? Então a mensagem é a RESPOSTA, não um novo começo: retoma-se
            // onde o fluxo ficou em vez de o repetir desde a saudação.
            if (await this.retomarFluxoPendente(conversationId, message, empresaId, crmInfo)) return;

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
                    // mensagemDisponivel = false: a mensagem que chegou foi consumida
                    // pelo gatilho; um menu logo a seguir tem de esperar pela próxima.
                    await this.executeGraph(nodes, edges, firstEdge.target, context, empresaId || null, [automation.id],
                        { mensagemDisponivel: false, conversationId, automationId: automation.id });
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

    /**
     * Corre o fluxo a seco com uma mensagem do "cliente" e devolve o que teria
     * acontecido. `estado` é o ponto onde a simulação anterior ficou (null = começa
     * do gatilho). Não toca na base de dados nem envia nada.
     */
    public static async simular(automation: any, mensagem: string, estado: { nodeId: string; contexto: any; tentativas: number } | null, contextoInicial: Record<string, any> = {}): Promise<Simulacao> {
        const { nodes, edges } = this.parseGraph(automation);
        const sim: Simulacao = { passos: [], mensagens: [], pendente: null, terminou: false };
        const trigger = nodes.find((n: FlowNode) => n.type === 'trigger');

        const contextoBase = {
            telefone: '244900000000', nome_whatsapp: 'Cliente de teste', tags: '',
            ...contextoInicial, ...(estado?.contexto || {}), mensagem, resposta: mensagem
        };

        if (estado?.nodeId) {
            if (!nodes.some((n: FlowNode) => n.id === estado.nodeId)) {
                sim.passos.push({ nodeId: estado.nodeId, tipo: 'erro', titulo: 'O nó onde a conversa estava já não existe no fluxo.' });
                sim.terminou = true;
                return sim;
            }
            // A empresa vai a sério: os nós que só LEEM (horários livres, marcações
            // do cliente) precisam dela para mostrar dados reais na simulação. Os que
            // gravam ficam travados pelo `simulacao` no executeAction.
            await this.executeGraph(nodes, edges, estado.nodeId, contextoBase, automation.empresa_id ?? null, [automation.id],
                { mensagemDisponivel: true, tentativas: estado.tentativas || 0, simulacao: sim });
            return sim;
        }

        if (!trigger) {
            sim.passos.push({ nodeId: '', tipo: 'erro', titulo: 'O fluxo não tem nó de gatilho.' });
            sim.terminou = true;
            return sim;
        }
        if (trigger.data?.triggerKind === 'whatsapp_message' && !this.evaluateWhatsAppTrigger(trigger.data, mensagem)) {
            sim.passos.push({ nodeId: trigger.id, tipo: 'trigger', titulo: 'O gatilho não reage a esta mensagem', detalhe: `modo: ${trigger.data?.matchMode || 'any'}${trigger.data?.matchValue ? ` · "${trigger.data.matchValue}"` : ''}` });
            sim.terminou = true;
            return sim;
        }
        sim.passos.push({ nodeId: trigger.id, tipo: 'trigger', titulo: 'Gatilho disparado' });
        const primeira = edges.find((e: FlowEdge) => e.source === trigger.id);
        if (!primeira) {
            sim.passos.push({ nodeId: trigger.id, tipo: 'erro', titulo: 'O gatilho não está ligado a nenhum nó.' });
            sim.terminou = true;
            return sim;
        }
        await this.executeGraph(nodes, edges, primeira.target, contextoBase, automation.empresa_id ?? null, [automation.id],
            { mensagemDisponivel: false, simulacao: sim });
        return sim;
    }

    // ============================================================
    // ESTADO DA CONVERSA (fluxos que esperam pela resposta do cliente)
    // ============================================================

    /**
     * Marca o evento como processado. Devolve false se já lá estava (entrega
     * repetida do webhook). Sem id de mensagem não há como desduplicar: deixa passar.
     */
    private static async registarEventoUnico(message: WhatsAppMessage): Promise<boolean> {
        if (!message.id) return true;
        try {
            const { error } = await supabase.from('wa_eventos_processados').insert({ chave: `${message.channel_id}:${message.id}` });
            if (error) {
                if (error.code === '23505') return false;            // chave duplicada = já processado
                console.warn('[AUTOPILOT] Não foi possível registar o evento (a continuar):', error.message);
            }
            return true;
        } catch {
            return true;   // a tabela ainda não existe (migração por correr): não bloquear mensagens
        }
    }

    /** Guarda onde o fluxo ficou à espera da resposta do cliente. */
    private static async guardarEstadoFluxo(conversationId: string, automationId: number | null, nodeId: string, context: any, tentativas = 0) {
        try {
            const contexto = { ...context };
            delete contexto.mensagem;   // a mensagem seguinte é que vai preencher isto
            await supabase.from('wa_conversations').update({
                fluxo_automation_id: automationId ?? null,
                fluxo_node_id: nodeId,
                fluxo_contexto: contexto,
                fluxo_tentativas: tentativas,
                fluxo_ate: new Date(Date.now() + ESTADO_FLUXO_VALIDADE_MS).toISOString()
            }).eq('id', conversationId);
        } catch (e: any) {
            console.error('[AUTOPILOT] Falha a guardar o estado do fluxo:', e.message);
        }
    }

    public static async limparEstadoFluxo(conversationId: string) {
        try {
            await supabase.from('wa_conversations').update({
                fluxo_automation_id: null, fluxo_node_id: null, fluxo_contexto: null, fluxo_tentativas: 0, fluxo_ate: null
            }).eq('id', conversationId);
        } catch { /* nada a fazer */ }
    }

    /**
     * Se a conversa tiver um fluxo à espera de resposta e o estado ainda for
     * válido, continua daí com a nova mensagem. Devolve true se tratou a mensagem.
     */
    private static async retomarFluxoPendente(conversationId: string, message: WhatsAppMessage, empresaId: number, crmInfo: any): Promise<boolean> {
        let conv: any = null;
        try {
            const { data } = await supabase.from('wa_conversations')
                .select('fluxo_automation_id, fluxo_node_id, fluxo_contexto, fluxo_tentativas, fluxo_ate').eq('id', conversationId).maybeSingle();
            conv = data;
        } catch { return false; }
        if (!conv?.fluxo_node_id) return false;

        if (conv.fluxo_ate && new Date(conv.fluxo_ate) < new Date()) {
            console.log('[AUTOPILOT] Estado do fluxo caducado — a conversa recomeça do início.');
            await this.limparEstadoFluxo(conversationId);
            return false;
        }

        const { data: automation } = await supabase.from('automations').select('*').eq('id', conv.fluxo_automation_id).eq('empresa_id', empresaId).maybeSingle();
        if (!automation || !automation.ativo) {
            await this.limparEstadoFluxo(conversationId);
            return false;
        }

        const { nodes, edges } = this.parseGraph(automation);
        if (!nodes.some((n: FlowNode) => n.id === conv.fluxo_node_id)) {
            // o fluxo foi editado e o nó já não existe
            await this.limparEstadoFluxo(conversationId);
            return false;
        }

        const context: Record<string, any> = {
            ...(conv.fluxo_contexto || {}),
            telefone: message.phone_number,
            nome_whatsapp: message.contact_name,
            mensagem: message.content,
            resposta: message.content,
            channel_id: message.channel_id,
            client_id: crmInfo.clienteId,
            tags: (crmInfo.tags || []).join(','),
            conversation_id: conversationId,
            ...crmInfo.customFields
        };
        // Guardar o que interessa ANTES de limpar o estado — a seguir a linha da
        // conversa deixa de ter estes campos.
        const noDeRetoma = String(conv.fluxo_node_id);
        const tentativas = Number(conv.fluxo_tentativas || 0);
        console.log(`[AUTOPILOT] A retomar "${automation.nome}" no nó ${noDeRetoma} com a resposta "${message.content}".`);
        await this.limparEstadoFluxo(conversationId);
        await this.executeGraph(nodes, edges, noDeRetoma, context, empresaId || null, [automation.id],
            { mensagemDisponivel: true, conversationId, automationId: automation.id, tentativas });
        return true;
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
    private static async executeGraph(nodes: FlowNode[], edges: FlowEdge[], startNodeId: string, initialContext: any, empresa_id: number | null, cadeiaFluxos: number[] = [], opts: ExecOpcoes = {}): Promise<any> {
        let context = { ...initialContext };
        let currentNodeId: string | undefined = startNodeId;
        let iterations = 0;
        // A mensagem que chegou só serve de RESPOSTA quando o fluxo foi retomado;
        // no arranque foi consumida pelo gatilho. Cada nó de espera consome-a uma vez.
        let mensagemDisponivel = !!opts.mensagemDisponivel;
        let saltosDeMenu = 0;   // "Voltar ao menu" encadeados na mesma passagem
        const sim = opts.simulacao;
        const registar = (node: FlowNode, titulo: string, detalhe?: string) => {
            if (sim) sim.passos.push({ nodeId: node.id, tipo: node.type, titulo, detalhe });
        };
        const { conversationId, automationId } = opts;
        const podeEsperar = !!conversationId;

        while (currentNodeId && iterations < MAX_GRAPH_STEPS) {
            iterations++;
            const node = nodes.find(n => n.id === currentNodeId);
            if (!node) break;

            if (node.type === 'end') break;

            if (node.type === 'condition') {
                const conditionMet = this.evaluateCondition(node.data, context);
                const handle = conditionMet ? 'yes' : 'no';
                registar(node, `Condição: ${conditionMet ? 'SIM' : 'NÃO'}`,
                    `${this.resolverVariavel(node.data?.variable, context)} ${node.data?.operator || '=='} ${this.parseString(String(node.data?.value ?? ''), context)}`);
                const edge = edges.find(e => e.source === node.id && e.sourceHandle === handle);
                if (!edge) {
                    console.log(`[AUTOPILOT] Condição no nó ${node.id}: resultado ${conditionMet ? 'SIM' : 'NÃO'} sem ligação — o fluxo termina aqui.`);
                    break;
                }
                currentNodeId = edge.target;
                continue;
            }

            if (node.type === 'menu') {
                // Um menu é uma pergunta: envia-a (se estiver configurada) e espera
                // pela mensagem seguinte do cliente.
                if (!mensagemDisponivel) {
                    if (node.data?.pergunta) await this.responderNoWhatsApp(context, this.parseString(node.data.pergunta, context), sim);
                    registar(node, 'Menu: à espera da resposta');
                    if (sim) { sim.pendente = { nodeId: node.id, contexto: context, tentativas: 0 }; return context; }
                    if (podeEsperar) {
                        await this.guardarEstadoFluxo(conversationId!, automationId ?? null, node.id, context, 0);
                        console.log(`[AUTOPILOT] Menu ${node.id}: à espera da resposta do cliente.`);
                    }
                    return context;
                }
                mensagemDisponivel = false;
                const matchedOption = this.evaluateMenu(node.data, context);
                if (!matchedOption) {
                    // Resposta fora das opções: repete a pergunta e continua à espera,
                    // em vez de deixar o cliente sem resposta ou recomeçar o fluxo.
                    const tentativas = (opts.tentativas || 0) + 1;
                    const maxTentativas = Number(node.data?.maxTentativas ?? MENU_MAX_TENTATIVAS);
                    const saidaSemResposta = edges.find(e => e.source === node.id && e.sourceHandle === 'fallback');
                    if (tentativas >= maxTentativas && saidaSemResposta) {
                        currentNodeId = saidaSemResposta.target;
                        continue;
                    }
                    const aviso = node.data?.mensagemInvalida
                        || (node.data?.pergunta ? `Não percebi essa resposta.\n\n${node.data.pergunta}` : null)
                        || `Não percebi essa resposta. ${(node.data?.options || []).map((o: any, i: number) => `${o.matchValue || i + 1} - ${o.label || ''}`).join(' | ')}`;
                    await this.responderNoWhatsApp(context, this.parseString(aviso, context), sim);
                    registar(node, 'Menu: resposta fora das opções', `tentativa ${tentativas}`);
                    if (sim) { sim.pendente = { nodeId: node.id, contexto: context, tentativas }; return context; }
                    if (podeEsperar) await this.guardarEstadoFluxo(conversationId!, automationId ?? null, node.id, context, tentativas);
                    return context;
                }
                registar(node, `Menu: opção "${(matchedOption as any).label || matchedOption.id}"`);
                const edge = edges.find(e => e.source === node.id && e.sourceHandle === matchedOption.id);
                if (!edge) {
                    console.log(`[AUTOPILOT] Menu ${node.id}: opção "${matchedOption.id}" sem ligação — o fluxo termina aqui.`);
                    break;
                }
                currentNodeId = edge.target;
                continue;
            }

            if (node.type === 'action') {
                // "Voltar ao menu": salta para um menu do mesmo fluxo, que volta a
                // fazer a pergunta e fica à espera. É assim que se faz um submenu
                // com a opção "voltar ao menu anterior".
                if (node.data?.actionType === 'GOTO_MENU') {
                    const alvoId = String(node.data?.config?.menuNodeId || '');
                    const alvo = nodes.find(n => n.id === alvoId && n.type === 'menu');
                    if (!alvo) {
                        console.warn(`[AUTOPILOT] "Voltar ao menu" no nó ${node.id} sem menu válido escolhido — o fluxo termina aqui.`);
                        break;
                    }
                    if (++saltosDeMenu > MAX_SALTOS_DE_MENU) {
                        console.warn('[AUTOPILOT] Demasiados "Voltar ao menu" seguidos — a parar para não entrar em ciclo.');
                        break;
                    }
                    registar(node, 'Voltar ao menu', (alvo.data as any)?.pergunta?.slice(0, 40));
                    mensagemDisponivel = false;   // o menu volta a perguntar e espera
                    currentNodeId = alvo.id;
                    continue;
                }

                // "Aguardar resposta": pára aqui e continua na mensagem seguinte.
                if (node.data?.actionType === 'WAIT_REPLY') {
                    const seguinte = edges.find(e => e.source === node.id)?.target;
                    if (!mensagemDisponivel) {
                        const pergunta = node.data?.config?.mensagem;
                        if (pergunta) await this.responderNoWhatsApp(context, this.parseString(pergunta, context), sim);
                        registar(node, 'Aguardar resposta do cliente');
                        if (sim) { sim.pendente = { nodeId: node.id, contexto: context, tentativas: 0 }; return context; }
                        if (podeEsperar) {
                            await this.guardarEstadoFluxo(conversationId!, automationId ?? null, node.id, context, 0);
                            console.log(`[AUTOPILOT] Aguardar resposta no nó ${node.id}.`);
                        }
                        return context;
                    }
                    // Retomámos aqui: a mensagem do cliente é a resposta.
                    mensagemDisponivel = false;
                    const chave = String(node.data?.config?.guardarEm || '').trim();
                    if (chave) context[chave] = context.mensagem;
                    currentNodeId = seguinte;
                    continue;
                }

                await this.executeAction(node, context, empresa_id, nodes, edges, cadeiaFluxos, sim);
                const edge = edges.find(e => e.source === node.id);
                currentNodeId = edge?.target;
                continue;
            }

            // trigger nodes não deveriam ser re-visitados no meio do grafo; se acontecer, encerra
            break;
        }

        // Chegou ao fim: já não há nada à espera de resposta nesta conversa.
        if (sim) { sim.terminou = true; return context; }
        if (conversationId) await this.limparEstadoFluxo(conversationId);
        return context;
    }

    /**
     * Lê o lado esquerdo de uma condição. Aceita "{{mensagem}}" e também
     * "mensagem" — escrever o nome da variável sem chavetas é o engano mais
     * comum e, antes, comparava a palavra literal (a condição dava sempre falso).
     */
    private static resolverVariavel(bruto: any, context: any): string {
        const s = String(bruto ?? '').trim();
        if (!s) return '';
        if (s.includes('{{')) return this.parseString(s, context);
        if (Object.prototype.hasOwnProperty.call(context, s)) return String(context[s] ?? '');
        return s;
    }

    /** Compara texto como uma pessoa compara: sem acentos, sem maiúsculas, sem espaços a mais. */
    private static normalizarTexto(v: any): string {
        return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    }

    /** "25.000,50 Kz" → 25000.5 (formato de Angola) e também "1,234.56" (inglês). */
    private static numeroDe(v: any): number | null {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        let t = String(v ?? '').replace(/[^\d.,-]/g, '').trim();
        if (!t) return null;
        const temPonto = t.includes('.'), temVirgula = t.includes(',');
        if (temPonto && temVirgula) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
        else if (temVirgula) t = t.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
        else if (temPonto && /\.\d{3}\b/.test(t)) t = t.replace(/\./g, '');
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }

    private static evaluateCondition(data: any, context: any): boolean {
        const esquerda = this.resolverVariavel(data?.variable, context);
        const operator = data?.operator || '==';
        const direita = this.parseString(String(data?.value ?? ''), context);
        const a = this.normalizarTexto(esquerda), b = this.normalizarTexto(direita);
        const na = this.numeroDe(esquerda), nb = this.numeroDe(direita);
        const comparaNumeros = (fn: (x: number, y: number) => boolean) => (na !== null && nb !== null ? fn(na, nb) : false);

        switch (operator) {
            case '==':
            case '===':
                return na !== null && nb !== null ? na === nb : a === b;
            case '!=':
            case '!==':
                return na !== null && nb !== null ? na !== nb : a !== b;
            case '>': return comparaNumeros((x, y) => x > y);
            case '>=': return comparaNumeros((x, y) => x >= y);
            case '<': return comparaNumeros((x, y) => x < y);
            case '<=': return comparaNumeros((x, y) => x <= y);
            case 'contains': return !!b && a.includes(b);
            case 'not_contains': return !b || !a.includes(b);
            case 'starts_with': return !!b && a.startsWith(b);
            case 'ends_with': return !!b && a.endsWith(b);
            case 'empty': return a === '';
            case 'not_empty': return a !== '';
            case 'regex':
                try { return new RegExp(direita, 'i').test(esquerda); } catch { return false; }
            default:
                console.warn(`[AUTOPILOT] Operador de condição desconhecido: "${operator}" — tratado como falso.`);
                return false;
        }
    }

    /**
     * Nó de menu (respostas rápidas, estilo ManyChat): escolhe a primeira opção cujo
     * matchValue apareça na mensagem do utilizador. Sem correspondência, o fluxo
     * termina ali (mesma semântica de "sem aresta de saída" do nó de condição).
     */
    private static evaluateMenu(data: any, context: any): { id: string } | undefined {
        const mensagem = this.normalizarTexto(this.resolverVariavel(data?.variable || '{{mensagem}}', context));
        const options: any[] = Array.isArray(data?.options) ? data.options : [];
        // Correspondência exata primeiro — essencial para menus numerados: sem isto,
        // responder "1" também "batia" na opção "10"/"11" (o "1" está contido lá
        // dentro), e o fluxo saltava para o ramo errado. Só cai para "contém" como
        // fallback, para continuar a aceitar respostas em texto livre por palavra-chave.
        const exact = options.find(opt => opt.matchValue && mensagem === this.normalizarTexto(opt.matchValue));
        if (exact) return exact;
        // Também aceita a etiqueta escrita por extenso ("preços" em vez de "1").
        const porEtiqueta = options.find(opt => opt.label && this.normalizarTexto(opt.label) === mensagem);
        if (porEtiqueta) return porEtiqueta;
        return options.find(opt => opt.matchValue && mensagem.includes(this.normalizarTexto(opt.matchValue)));
    }

    /**
     * Separa a lista de destinatários (vírgulas, pontos e vírgulas ou linhas) e
     * decide, para cada um, se é um email ou um telemóvel. O que a pessoa
     * escreveu manda sobre o canal escolhido na caixa: um endereço com "@" vai
     * sempre por email, um número vai sempre por WhatsApp. Assim o aviso chega
     * mesmo quando o canal ficou mal escolhido no painel.
     */
    private static destinatariosDe(texto: string, preferencia: string): { valor: string; tipo: 'email' | 'whatsapp' }[] {
        const partes = String(texto || '').split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
        const alvos: { valor: string; tipo: 'email' | 'whatsapp' }[] = [];
        for (const parte of partes) {
            if (parte.includes('@')) { alvos.push({ valor: parte, tipo: 'email' }); continue; }
            const digitos = parte.replace(/\D/g, '');
            if (digitos.length >= 8) { alvos.push({ valor: digitos, tipo: 'whatsapp' }); continue; }
            // Não se percebe o que é: segue a preferência da caixa, sem inventar.
            if (preferencia === 'whatsapp') alvos.push({ valor: digitos || parte, tipo: 'whatsapp' });
            else alvos.push({ valor: parte, tipo: 'email' });
        }
        return alvos;
    }

    private static async executeAction(node: FlowNode, context: any, empresa_id: number | null, allNodes: FlowNode[], allEdges: FlowEdge[], cadeiaFluxos: number[] = [], sim?: Simulacao) {
        const config = node.data?.config || {};

        // Simulação: nada sai para o mundo real. Regista-se o que seria feito, com
        // as variáveis já substituídas, para se ver exatamente o que o cliente receberia.
        if (sim) {
            const tipo = String(node.data?.actionType || '');
            const texto = this.parseString(config.mensagem || config.message || '', context);
            const resumo: Record<string, string> = {
                REPLY_MESSAGE: texto, SEND_WHATSAPP: texto, AI_REPLY: '(resposta gerada pela IA a partir da Base de Conhecimento)',
                SEND_IMAGE: `imagem: ${config.ficheiro || '(sem ficheiro)'}`, SEND_VIDEO: `vídeo: ${config.ficheiro || '(sem ficheiro)'}`,
                SEND_AUDIO: `áudio: ${config.ficheiro || '(sem ficheiro)'}`, SEND_DOCUMENT: `documento: ${config.ficheiro || '(sem ficheiro)'}`,
                SEND_TEMPLATE: `template "${config.template_nome || config.template_id || ''}"${(config.params || []).length ? ` com ${(config.params || []).map((v: any) => this.parseString(String(v ?? ''), context)).join(', ')}` : ''}`,
                CHECK_SLOTS: `ver horários livres de "${this.parseString(config.servico || '', context)}" em "${this.parseString(config.data || '{{mensagem}}', context)}"`,
                CREATE_BOOKING: `marcar "${this.parseString(config.servico || '', context)}" para ${this.parseString(config.data || '', context)} às ${this.parseString(config.hora || '', context)} (${this.parseString(config.nome || '{{nome_whatsapp}}', context)})`,
                LIST_BOOKINGS: 'listar as marcações do cliente',
                SEND_EMAIL: `email para ${this.parseString(config.para || '', context)}: ${this.parseString(config.assunto || '', context)}`,
                ADD_TAG: `etiqueta +${config.tag || ''}`, REMOVE_TAG: `etiqueta -${config.tag || ''}`,
                SET_CUSTOM_FIELD: `${config.campo || ''} = ${this.parseString(config.valor || '', context)}`,
                NOTIFY_TEAM: `notificar ${config.destinatario || ''}`, HANDOFF_HUMAN: 'passa a conversa para um humano (bot pausado)',
                EXTERNAL_REQUEST: `${config.method || 'GET'} ${this.parseString(config.url || '', context)}`,
                JUMP_TO_WORKFLOW: `salta para o fluxo "${config.target_workflow_nome || ''}"`,
                DELAY: `espera ${config.segundos ?? (config.minutos ? Number(config.minutos) * 60 : 1)}s`,
                LOG_MESSAGE: texto
            };
            // Os nós de agendamento que só LEEM correm na mesma na simulação, para se
            // ver os horários reais; o que grava (CREATE_BOOKING) fica só registado.
            if ((tipo === 'CHECK_SLOTS' || tipo === 'LIST_BOOKINGS') && empresa_id) {
                try {
                    const { AgendamentoFluxoService } = require('./AgendamentoFluxoService');
                    if (tipo === 'CHECK_SLOTS') {
                        const r = await AgendamentoFluxoService.horariosLivres(String(empresa_id), this.parseString(config.servico || '', context), this.parseString(config.data || '{{mensagem}}', context), Number(config.maximo) || 8);
                        context[config.guardarEm || 'horarios_livres'] = r.texto;
                        context['tem_vagas'] = r.horarios?.length ? 'sim' : 'nao';
                        context['agendamento_erro'] = r.erro || '';
                        sim.passos.push({ nodeId: node.id, tipo: 'action', titulo: tipo, detalhe: r.texto || r.erro || '' });
                        return;
                    }
                    const r = await AgendamentoFluxoService.minhasMarcacoes(String(empresa_id), this.parseString(config.telefone || '{{telefone}}', context));
                    context[config.guardarEm || 'minhas_marcacoes'] = r.texto;
                    context['tem_marcacoes'] = r.lista.length ? 'sim' : 'nao';
                    sim.passos.push({ nodeId: node.id, tipo: 'action', titulo: tipo, detalhe: r.texto || 'sem marcações' });
                    return;
                } catch { /* segue para o registo normal */ }
            }
            if (tipo === 'CREATE_BOOKING') {
                // Na simulação não se cria nada: só se mostra o que seria criado.
                // As variáveis são preenchidas na mesma (lendo a data e a hora pelas
                // mesmas regras de sempre), para a mensagem de confirmação aparecer
                // aqui exatamente como o cliente a receberia.
                const { TextoDataHoraService } = require('./TextoDataHoraService');
                const iso = TextoDataHoraService.data(this.parseString(config.data || '', context));
                const hora = TextoDataHoraService.hora(this.parseString(config.hora || '', context));
                context['agendamento_ok'] = iso && hora ? 'sim' : 'nao';
                context['agendamento_erro'] = iso ? (hora ? '' : 'Não percebi a hora.') : 'Não percebi a data.';
                context['agendamento_id'] = '(simulação)';
                context['agendamento_data'] = iso || '';
                context['agendamento_data_extenso'] = iso ? TextoDataHoraService.dataPorExtenso(iso) : '';
                context['agendamento_hora'] = hora || '';
                context['agendamento_servico'] = this.parseString(config.servico || '', context);
            }
            sim.passos.push({ nodeId: node.id, tipo: 'action', titulo: tipo, detalhe: resumo[tipo] ?? '' });
            if (['REPLY_MESSAGE', 'SEND_WHATSAPP'].includes(tipo) && texto) sim.mensagens.push({ de: 'bot', texto });
            if (tipo === 'SEND_TEMPLATE') sim.mensagens.push({ de: 'bot', texto: resumo.SEND_TEMPLATE, tipo: 'template' });
            if (['SEND_IMAGE', 'SEND_VIDEO', 'SEND_AUDIO', 'SEND_DOCUMENT'].includes(tipo)) sim.mensagens.push({ de: 'bot', texto: resumo[tipo], tipo: tipo.replace('SEND_', '').toLowerCase() });
            if (tipo === 'AI_REPLY') sim.mensagens.push({ de: 'bot', texto: resumo[tipo] });
            // Efeitos só no contexto (não saem para fora) continuam a valer, para as
            // condições seguintes serem avaliadas com os mesmos dados.
            if (tipo === 'SET_CUSTOM_FIELD' && config.campo) context[config.campo] = this.parseString(config.valor || '', context);
            return;
        }

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

            // Avisa quem trata do assunto. É o nó que traz dinheiro à porta, por
            // isso nunca falha em silêncio: aceita vários destinatários, percebe
            // sozinho se cada um é um email ou um telemóvel, escolhe um canal de
            // WhatsApp que esteja mesmo LIGADO, e se não conseguir entregar pelo
            // WhatsApp cai para o email alternativo. O resultado fica em
            // {{notificacao_ok}} / {{notificacao_erro}} para o fluxo poder reagir.
            case 'NOTIFY_TEAM': {
                const mensagem = this.parseString(config.mensagem, context);
                const preferencia = String(config.canal || 'email').toLowerCase();
                const alvos = this.destinatariosDe(this.parseString(config.destinatario, context), preferencia);

                if (!alvos.length || !mensagem) {
                    console.error('[AUTOPILOT] NOTIFY_TEAM: falta destinatário ou mensagem — nada enviado.');
                    context['notificacao_ok'] = 'nao';
                    context['notificacao_erro'] = !mensagem ? 'Falta a mensagem do aviso.' : 'Falta o destinatário do aviso.';
                    break;
                }

                const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                const { EmailService } = require('./EmailService');
                const emailAlternativo = this.parseString(config.emailAlternativo || '', context).trim();
                const falhas: string[] = [];
                let entregues = 0;

                // O canal de WhatsApp é procurado uma só vez, e só dentro desta empresa
                // (sem empresa não se escolhe canal nenhum — seria falar pelo número de outro cliente).
                let canalWa: any = null;
                if (alvos.some(a => a.tipo === 'whatsapp')) {
                    if (!empresa_id) {
                        falhas.push('sem empresa associada ao fluxo, não é possível escolher um canal de WhatsApp');
                    } else {
                        const { data: canais } = await supabase.from('wa_channels')
                            .select('id, status').eq('empresa_id', empresa_id);
                        // Normaliza: conforme os cabeçalhos, o PostgREST tanto devolve
                        // uma lista como um único objeto.
                        const lista: any[] = Array.isArray(canais) ? canais : (canais ? [canais] : []);
                        canalWa = lista.find((c: any) => c.status === 'connected')
                            // Um canal sem estado registado ainda é melhor do que não tentar de todo.
                            || lista.find((c: any) => !c.status) || null;
                        if (!canalWa && lista.length) falhas.push('o canal de WhatsApp da empresa não está ligado');
                        else if (!canalWa) falhas.push('a empresa não tem nenhum canal de WhatsApp');
                    }
                }

                for (const alvo of alvos) {
                    try {
                        if (alvo.tipo === 'whatsapp') {
                            if (!canalWa) throw new Error('sem canal de WhatsApp ligado');
                            await WhatsAppChannelManager.sendMessage(supabase, canalWa.id, alvo.valor, mensagem);
                        } else {
                            const enviado = await EmailService.enviarEmailPersonalizado(alvo.valor, 'Notificação do Autopilot', mensagem, empresa_id);
                            if (enviado === false) throw new Error('o email não foi aceite (verifique o SMTP em Definições)');
                        }
                        entregues++;
                        console.log(`[AUTOPILOT] NOTIFY_TEAM entregue a ${alvo.valor} por ${alvo.tipo}`);
                    } catch (e: any) {
                        falhas.push(`${alvo.valor}: ${e?.message || e}`);
                        console.error(`[AUTOPILOT] NOTIFY_TEAM falhou para ${alvo.valor} (${alvo.tipo}):`, e?.message || e);
                    }
                }

                // Rede de segurança: se nada chegou por WhatsApp mas há um email de
                // recurso configurado, o dono é avisado na mesma.
                if (!entregues && emailAlternativo && emailAlternativo.includes('@')) {
                    try {
                        const enviado = await EmailService.enviarEmailPersonalizado(
                            emailAlternativo, 'Notificação do Autopilot',
                            `${mensagem}\n\n(Este aviso ia por WhatsApp, mas não foi possível entregar: ${falhas.join('; ')})`,
                            empresa_id);
                        if (enviado !== false) { entregues++; console.log(`[AUTOPILOT] NOTIFY_TEAM: avisado por email de recurso (${emailAlternativo}).`); }
                    } catch (e: any) {
                        falhas.push(`email de recurso ${emailAlternativo}: ${e?.message || e}`);
                    }
                }

                context['notificacao_ok'] = entregues > 0 ? 'sim' : 'nao';
                context['notificacao_erro'] = entregues > 0 ? '' : (falhas.join('; ') || 'não foi possível entregar o aviso');
                if (!entregues) console.error('[AUTOPILOT] NOTIFY_TEAM: NENHUM aviso foi entregue —', context['notificacao_erro']);
                break;
            }

            case 'HANDOFF_HUMAN': {
                if (context['conversation_id']) await this.limparEstadoFluxo(context['conversation_id']);
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

            // ---------- AGENDAMENTO ----------
            // Vê os horários livres e guarda-os em variáveis, para o fluxo os poder
            // mostrar ao cliente e decidir com uma condição.
            case 'CHECK_SLOTS': {
                const { AgendamentoFluxoService } = require('./AgendamentoFluxoService');
                const servico = this.parseString(config.servico || '', context);
                const dataTexto = this.parseString(config.data || '{{mensagem}}', context);
                const r = await AgendamentoFluxoService.horariosLivres(String(empresa_id), servico, dataTexto, Number(config.maximo) || 8);
                context[config.guardarEm || 'horarios_livres'] = r.texto;
                context['horarios_lista'] = (r.horarios || []).join(', ');
                context['tem_vagas'] = r.horarios && r.horarios.length > 0 ? 'sim' : 'nao';
                context['agendamento_data'] = r.data || '';
                context['agendamento_data_extenso'] = r.dataPorExtenso || '';
                context['agendamento_servico'] = r.servico?.nome || servico;
                context['agendamento_erro'] = r.erro || '';
                console.log(`[AUTOPILOT] Horários livres (${servico} · ${dataTexto}): ${r.texto || r.erro}`);
                break;
            }

            // Cria mesmo a marcação no módulo de Agendamento, com o que o cliente
            // escreveu. Nunca inventa: o que não perceber fica em {{agendamento_erro}}
            // para o fluxo poder voltar a perguntar.
            case 'CREATE_BOOKING': {
                const { AgendamentoFluxoService } = require('./AgendamentoFluxoService');
                const dadosExtra: Record<string, any> = {};
                for (const [chave, valor] of Object.entries(config.campos || {})) {
                    dadosExtra[chave] = this.parseString(String(valor ?? ''), context);
                }
                const r = await AgendamentoFluxoService.criarPeloFluxo(String(empresa_id), {
                    servico: this.parseString(config.servico || '', context),
                    data: this.parseString(config.data || '', context),
                    hora: this.parseString(config.hora || '', context),
                    nome: this.parseString(config.nome || '{{nome_whatsapp}}', context),
                    telefone: this.parseString(config.telefone || '{{telefone}}', context),
                    notas: this.parseString(config.notas || '', context),
                    dados: dadosExtra,
                    automationId: cadeiaFluxos[0] || null
                });
                context['agendamento_ok'] = r.ok ? 'sim' : 'nao';
                context['agendamento_erro'] = r.erro || '';
                context['agendamento_id'] = r.id ? String(r.id) : '';
                context['agendamento_data'] = r.data || '';
                context['agendamento_data_extenso'] = r.data ? require('./TextoDataHoraService').TextoDataHoraService.dataPorExtenso(r.data) : '';
                context['agendamento_hora'] = r.hora || '';
                context['agendamento_servico'] = r.servicoNome || '';
                console.log(r.ok ? `[AUTOPILOT] Marcação #${r.id} criada pelo fluxo.` : `[AUTOPILOT] Marcação não criada: ${r.erro}`);
                break;
            }

            // Lista as marcações futuras deste cliente (pelo telefone da conversa).
            case 'LIST_BOOKINGS': {
                const { AgendamentoFluxoService } = require('./AgendamentoFluxoService');
                const tel = this.parseString(config.telefone || '{{telefone}}', context);
                const r = await AgendamentoFluxoService.minhasMarcacoes(String(empresa_id), tel);
                context[config.guardarEm || 'minhas_marcacoes'] = r.texto;
                context['tem_marcacoes'] = r.lista.length > 0 ? 'sim' : 'nao';
                break;
            }

            // Envia um template criado em WhatsApp → Templates. No número oficial
            // sai como template da Meta (só se aprovado); no número por QR sai como
            // mensagem normal com o mesmo conteúdo.
            case 'SEND_TEMPLATE': {
                const templateId = config.template_id;
                const telefoneAlvo = this.parseString(config.telefone || '{{telefone}}', context);
                if (!templateId || !telefoneAlvo) { console.warn('[AUTOPILOT] Nó de template sem template escolhido ou sem telefone.'); break; }
                try {
                    const { data: template } = await supabase.from('wa_templates').select('*').eq('id', templateId).maybeSingle();
                    if (!template || (empresa_id && String(template.empresa_id) !== String(empresa_id))) {
                        console.error('[AUTOPILOT] Template não encontrado nesta empresa:', templateId);
                        break;
                    }
                    let canalId = config.channel_id || context['channel_id'];
                    if (!canalId && empresa_id) {
                        const { data: c } = await supabase.from('wa_channels').select('id').eq('empresa_id', empresa_id).limit(1).maybeSingle();
                        canalId = c?.id;
                    }
                    const { data: canal } = await supabase.from('wa_channels').select('*').eq('id', canalId).maybeSingle();
                    if (!canal) { console.error('[AUTOPILOT] Canal não encontrado para enviar o template.'); break; }

                    const params = (Array.isArray(config.params) ? config.params : []).map((v: any) => this.parseString(String(v ?? ''), context));
                    const { WhatsAppTemplateService } = require('./WhatsAppTemplateService');
                    const r = await WhatsAppTemplateService.enviar(supabase, canal, telefoneAlvo, template, params);
                    if (!r.ok) { console.error('[AUTOPILOT] Template não enviado:', r.erro); break; }
                    console.log(`[AUTOPILOT] Template "${template.name}" enviado para ${telefoneAlvo}`);
                    if (context['conversation_id']) {
                        await this.saveMessage(context['conversation_id'], {
                            id: r.id, channel_id: canal.id, phone_number: telefoneAlvo,
                            contact_name: 'Autopilot', content: r.textoEnviado, direction: 'outbound'
                        });
                    }
                } catch (e: any) {
                    console.error('[AUTOPILOT] Erro ao enviar template:', e.message);
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

    /**
     * Envia uma mensagem ao cliente e deixa-a visível na conversa do CRM.
     * Usado pelos nós de espera (repetir o menu, fazer a pergunta).
     */
    private static async responderNoWhatsApp(context: any, texto: string, sim?: Simulacao): Promise<void> {
        if (!texto) return;
        if (sim) { sim.mensagens.push({ de: 'bot', texto }); return; }
        if (!context?.telefone || !context?.channel_id) return;
        try {
            const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
            const sentId = await WhatsAppChannelManager.sendMessage(supabase, context.channel_id, context.telefone, texto);
            if (context.conversation_id) {
                await this.saveMessage(context.conversation_id, {
                    id: typeof sentId === 'string' ? sentId : undefined,
                    channel_id: context.channel_id, phone_number: context.telefone,
                    contact_name: 'Autopilot', content: texto, direction: 'outbound'
                });
            }
        } catch (e: any) {
            console.error('[AUTOPILOT] Falha ao responder:', e.message);
        }
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
