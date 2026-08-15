import { supabase } from '../lib/supabaseClient';

export interface WhatsAppMessage {
    id?: string;
    conversation_id?: string;
    channel_id: string;
    phone_number: string;
    contact_name: string;
    content: string;
    direction: 'inbound' | 'outbound';
}

export class WorkflowEngine {
    
    /**
     * Processa uma nova mensagem recebida (inbound) e decide se algum workflow deve ser ativado.
     */
    public static async processIncomingMessage(message: WhatsAppMessage) {
        try {
            // Resolve empresa_id from channel
            const { data: channelData } = await supabase.from('wa_channels').select('empresa_id').eq('id', message.channel_id).single();
            const empresaId = channelData?.empresa_id;

            // 1. Garantir que a conversa existe ou criar
            let conversationId = await this.getOrCreateConversation(message);
            
            // 2. Guardar a mensagem na BD
            await this.saveMessage(conversationId, message);

            // 2.5. Sincronização com CRM e Rastreio de Afiliados
            if (message.direction === 'inbound') {
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

                // Verificar se o cliente já existe no CRM
                let checkClienteQuery = supabase.from('clientes').select('id').eq('telefone', message.phone_number);
                if (empresaId) checkClienteQuery = checkClienteQuery.eq('empresa_id', empresaId);
                const { data: checkCliente } = await checkClienteQuery.maybeSingle();
                let clienteId = checkCliente?.id;

                if (clienteId) {
                    if (afiliadoId) {
                        // Atualiza afiliado se não tiver
                        await supabase.from('clientes').update({ afiliado_id: afiliadoId }).eq('id', clienteId).is('afiliado_id', null);
                    }
                    
                    // Verificar se o cliente tem um negócio ativo no Kanban
                    // Assumimos que 'Perdido', 'Ganhos', 'Fechado' são fases terminadas.
                    const { data: negocioAtivo } = await supabase.from('negocios')
                        .select('id')
                        .eq('cliente_id', clienteId)
                        .not('fase', 'in', '("Perdido","Ganhos","Fechado")')
                        .limit(1)
                        .maybeSingle();

                    if (!negocioAtivo) {
                        // Opcional: precisamos de empresa_id para criar o negócio, se a tabela requer
                        // Vamos buscar a empresa associada ao cliente
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
                    // CRIAR CLIENTE NO CRM
                    // Utilizar a empresa_id associada ao canal
                    const empId = empresaId;

                    const { data: novoCliente } = await supabase.from('clientes').insert({
                        empresa_id: empId,
                        nome: message.contact_name || message.phone_number,
                        telefone: message.phone_number,
                        afiliado_id: afiliadoId
                    }).select('id, empresa_id').maybeSingle();

                    if (novoCliente && empId) {
                        clienteId = novoCliente.id;
                        // CRIAR NO KANBAN (Negócios)
                        await supabase.from('negocios').insert({
                            empresa_id: empId,
                            cliente_id: clienteId,
                            titulo: `Lead WhatsApp: ${message.contact_name || message.phone_number}`,
                            valor_estimado: 0,
                            fase: 'Nova Lead'
                        });
                    }
                }
            }

            // 3. Procurar Workflows Ativos
            let workflowsQuery = supabase
                .from('wa_workflows')
                .select('*')
                .eq('is_active', true);
            if (empresaId) workflowsQuery = workflowsQuery.eq('empresa_id', empresaId);
            const { data: workflows } = await workflowsQuery;

            if (!workflows || workflows.length === 0) return;

            // 4. Testar cada workflow contra a mensagem
            let handled = false;
            for (const wf of workflows) {
                if (this.evaluateTrigger(wf, message.content)) {
                    await this.executeActions(wf, conversationId, message);
                    handled = true;
                    // Opcional: parar no primeiro workflow que bate certo para evitar múltiplas respostas
                    break;
                }
            }

            // 5. Fallback para Inteligência Artificial (OpenClaw)
            if (!handled && message.direction === 'inbound') {
                await this.handleAIFallback(conversationId, message);
            }

        } catch (error) {
            console.error('Erro no Workflow Engine:', error);
        }
    }

    private static async getOrCreateConversation(message: WhatsAppMessage): Promise<string> {
        // Tentar encontrar conversa existente
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
            // Se recebemos um nome real (que não é apenas o número de telefone), vamos atualizar
            if (message.contact_name && message.contact_name !== message.phone_number) {
                // Idealmente só deveríamos atualizar se o nome atual for o telefone, mas como não carregamos o nome anterior aqui, 
                // atualizar sempre que houver um pushName válido mantém a lista atualizada com o perfil do WhatsApp.
                updates.contact_name = message.contact_name;
            }
            // Atualiza last_message_at e possivelmente last_client_message_at e contact_name
            await supabase.from('wa_conversations').update(updates).eq('id', existing.id);
            return existing.id;
        }

        // Criar nova conversa
        const { data: newConv, error } = await supabase
            .from('wa_conversations')
            .insert({
                channel_id: message.channel_id,
                phone_number: message.phone_number,
                contact_name: message.contact_name,
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

    private static evaluateTrigger(workflow: any, content: string): boolean {
        const text = content.toLowerCase().trim();
        
        switch (workflow.trigger_type) {
            case 'all':
                return true;
            case 'keyword':
                const keywords = (workflow.trigger_condition || '').toLowerCase().split(',');
                return keywords.some((kw: string) => text.includes(kw.trim()));
            case 'regex':
                try {
                    const regex = new RegExp(workflow.trigger_condition, 'i');
                    return regex.test(text);
                } catch { return false; }
            default:
                return false;
        }
    }

    private static async executeActions(workflow: any, conversationId: string, originalMsg: WhatsAppMessage) {
        const actions = workflow.actions || [];
        
        for (const action of actions) {
            if (action.type === 'send_message') {
                // Aqui chamaremos o WhatsAppChannelManager para disparar fisicamente
                console.log(`[Workflow Engine] Enviar Auto-Resposta para ${originalMsg.phone_number}: ${action.text}`);
                
                try {
                    const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                    await WhatsAppChannelManager.sendMessage(supabase, originalMsg.channel_id, originalMsg.phone_number, action.text);
                } catch(e) {
                    console.error('Erro a enviar msg via ChannelManager:', e);
                }

                // Guardar como outbound na BD para histórico
                await this.saveMessage(conversationId, {
                    channel_id: originalMsg.channel_id,
                    phone_number: originalMsg.phone_number,
                    contact_name: originalMsg.contact_name,
                    content: action.text,
                    direction: 'outbound'
                });
            }
        }
    }

    private static async handleAIFallback(conversationId: string, message: WhatsAppMessage) {
        try {
            console.log(`[Workflow Engine] Acionando IA (OpenClaw) para mensagem de ${message.phone_number}`);
            
            // O WhatsApp usa o telefone como "ID de utilizador" provisório.
            // Para identificar o Role, verificamos se existe na DB de Colaboradores ou Clientes (simplificado para 'cliente' por defeito se não encontrado).
            // A chamada retorna um objeto com { response, conversaId }
            const { EnterpriseAssistantService } = require('./EnterpriseAssistantService');
            
            const aiResponseObj = await EnterpriseAssistantService.chat(
                message.phone_number, 
                'cliente (WhatsApp)', 
                message.content, 
                undefined // Opcionalmente gerir o conversaId do OpenClaw aqui depois
            );
            
            const aiResponse = aiResponseObj?.response;
            
            if (aiResponse) {
                // Envia de volta para o cliente
                try {
                    const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                    await WhatsAppChannelManager.sendMessage(supabase, message.channel_id, message.phone_number, aiResponse);
                } catch(e) {
                    console.error('[Workflow Engine] Erro a enviar resposta da IA via ChannelManager:', e);
                }

                // Guarda na Base de Dados
                await this.saveMessage(conversationId, {
                    channel_id: message.channel_id,
                    phone_number: message.phone_number,
                    contact_name: 'IA (OpenClaw)',
                    content: aiResponse,
                    direction: 'outbound'
                });
            }
        } catch (error) {
            console.error('[Workflow Engine] Erro no Fallback da IA:', error);
        }
    }
}
