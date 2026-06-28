import { CrmService } from './CrmService';
import { supabase } from '../lib/supabaseClient'; // Service role client

export class AutomationEngine {
    
    // Deprecated em favor do getAutomations no controller
    public static async getAutomations() {
        const { data: automations } = await supabase.from('automations').select('*').order('criado_em', { ascending: false });
        return (automations || []).map((a: any) => ({
            ...a,
            steps: typeof a.steps === 'string' ? JSON.parse(a.steps) : a.steps
        }));
    }

    public static async createAutomation(dados: { nome: string, trigger_type: string, steps: any[], empresa_id?: number }) {
        const { data, error } = await supabase.from('automations').insert({
            empresa_id: dados.empresa_id || null,
            nome: dados.nome,
            trigger_type: dados.trigger_type,
            steps: JSON.stringify(dados.steps),
            ativo: true
        }).select('id').single();

        if (error) throw error;
        return data.id;
    }

    public static async deleteAutomation(id: number) {
        await supabase.from('automations').delete().eq('id', id);
    }

    public static async processWebhook(trigger_type: string, payload: any) {
        // Extract phone number from payload to check human handover
        let phoneToCheck = payload.from || payload.telefone || payload.phone || payload.remoteJid;
        if (phoneToCheck) {
            phoneToCheck = phoneToCheck.replace(/\D/g, '');
            try {
                const { data: client } = await supabase.from('clientes').select('bot_paused').or(`telefone.eq.${phoneToCheck},telefone.ilike.%${phoneToCheck}%`).limit(1).single();
                if (client && client.bot_paused) {
                    console.log(`[Human Handover] Ignorando webhook de ${phoneToCheck} pois o bot está pausado para este cliente.`);
                    return; // Abort webhook execution for this user
                }
            } catch (err) {}
        }

        // Find all active automations for this trigger
        const { data: automations } = await supabase.from('automations').select('*').eq('trigger_type', trigger_type).eq('ativo', true);

        for (const automation of (automations || [])) {
            try {
                const steps = typeof automation.steps === 'string' ? JSON.parse(automation.steps) : automation.steps;
                await this.executeSteps(steps, payload, automation.empresa_id);
            } catch (err) {
                console.error(`Erro ao executar automação ${automation.nome}:`, err);
            }
        }
    }

    private static async executeSteps(steps: any[], initialContext: any, empresa_id: number | null) {
        // context is a mutable object holding variables as steps execute
        let context = { ...initialContext };

        for (const step of steps) {
            switch (step.type) {
                case 'CREATE_CLIENT':
                    // Map payload fields to client fields
                    const clientName = this.parseString(step.config.nome, context);
                    const clientPhone = this.parseString(step.config.telefone, context);
                    
                    const clientData = {
                        empresa_id,
                        nome: clientName || clientPhone || 'Sem Nome',
                        telefone: clientPhone
                    };
                    
                    // Check if client exists (by phone)
                    let clientId;
                    if (clientPhone) {
                        const { data: existing } = await supabase.from('clientes').select('id').eq('telefone', clientPhone).limit(1).single();
                        if (existing) {
                            clientId = existing.id;
                        } else {
                            // CrmService is likely async now
                            clientId = await CrmService.createCliente(null, clientData);
                        }
                    } else {
                        clientId = await CrmService.createCliente(null, clientData);
                    }
                    
                    context['client_id'] = clientId;
                    break;
                
                case 'CREATE_LEAD':
                    const leadTitle = this.parseString(step.config.titulo, context);
                    const leadClientId = context['client_id'];
                    
                    if (leadClientId) {
                        const leadId = await CrmService.createNegocio(null, {
                            empresa_id,
                            cliente_id: leadClientId,
                            titulo: leadTitle || 'Nova Lead',
                            valor_estimado: 0
                        });
                        context['lead_id'] = leadId;
                    } else {
                        console.error('CREATE_LEAD falhou: Nenhum client_id no contexto.');
                    }
                    break;
                
                case 'LOG_MESSAGE':
                    const msg = this.parseString(step.config.mensagem, context);
                    console.log(`[AUTOPILOT LOG]: ${msg}`);
                    break;
                
                case 'JUMP_TO_WORKFLOW':
                    const targetName = step.config.target_workflow_nome;
                    if (targetName) {
                        try {
                            const { data: targetAuto } = await supabase.from('automations').select('*').eq('nome', targetName).eq('ativo', true).single();
                            if (targetAuto) {
                                console.log(`[JUMP_TO_WORKFLOW] A saltar para a automação: ${targetName}`);
                                const targetSteps = typeof targetAuto.steps === 'string' ? JSON.parse(targetAuto.steps) : targetAuto.steps;
                                await this.executeSteps(targetSteps, context, empresa_id);
                            } else {
                                console.warn(`[JUMP_TO_WORKFLOW] Automação alvo não encontrada ou inativa: ${targetName}`);
                            }
                        } catch (e) {
                            console.error(`Erro ao saltar para workflow ${targetName}:`, e);
                        }
                    }
                    break;
                
                case 'SEND_EMAIL':
                    const emailTo = this.parseString(step.config.para || step.config.to, context);
                    const emailSubject = this.parseString(step.config.assunto || step.config.subject, context);
                    const emailBody = this.parseString(step.config.mensagem || step.config.corpo || step.config.body, context);
                    
                    if (emailTo && emailSubject && emailBody) {
                        try {
                            const { EmailService } = require('./EmailService');
                            await EmailService.enviarEmailPersonalizado(emailTo, emailSubject, emailBody, empresa_id);
                            console.log(`[AUTOPILOT] Email enviado para ${emailTo}`);
                        } catch(e) {
                            console.error('[AUTOPILOT] Erro ao enviar email:', e);
                        }
                    }
                    break;
                
                case 'SEND_WHATSAPP':
                case 'REPLY_MESSAGE':
                    const waPhone = this.parseString(step.config.telefone || step.config.phone || '{{telefone}}', context);
                    const waMessage = this.parseString(step.config.mensagem || step.config.message, context);
                    const waChannelId = step.config.channel_id || context['channel_id'];

                    if (waPhone && waMessage) {
                        try {
                            const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
                            // Fallback channel se nao vier no contexto
                            let finalChannel = waChannelId;
                            if (!finalChannel) {
                                const { data: channel } = await supabase.from('wa_channels').select('id').limit(1).single();
                                if (channel) finalChannel = channel.id;
                            }

                            if (finalChannel) {
                                await WhatsAppChannelManager.sendMessage(finalChannel, waPhone, waMessage);
                                console.log(`[AUTOPILOT] WhatsApp enviado para ${waPhone}`);
                            }
                        } catch(e) {
                            console.error('[AUTOPILOT] Erro ao enviar WhatsApp:', e);
                        }
                    }
                    break;
                
                case 'IF_CONDITION':
                    const conditionVar = this.parseString(step.config.variavel || step.config.variable, context);
                    const operator = step.config.operador || step.config.operator || '==';
                    const conditionVal = this.parseString(step.config.valor || step.config.value, context);
                    
                    let conditionMet = false;
                    if (operator === '==' || operator === '===') conditionMet = conditionVar === conditionVal;
                    else if (operator === '!=') conditionMet = conditionVar !== conditionVal;
                    else if (operator === '>') conditionMet = Number(conditionVar) > Number(conditionVal);
                    else if (operator === '<') conditionMet = Number(conditionVar) < Number(conditionVal);
                    else if (operator === 'contains') conditionMet = conditionVar.includes(conditionVal);

                    if (!conditionMet) {
                        console.log(`[AUTOPILOT] IF_CONDITION falhou (${conditionVar} ${operator} ${conditionVal}). Abortando restantes passos.`);
                        return; // Stop execution
                    }
                    break;
                
                case 'DELAY':
                case 'WAIT':
                    const delayMinutes = parseInt(step.config.minutos || step.config.minutes || '1', 10);
                    console.log(`[AUTOPILOT] A aguardar ${delayMinutes} minuto(s)...`);
                    await new Promise(resolve => setTimeout(resolve, delayMinutes * 60000));
                    break;

                default:
                    console.log(`Ação não reconhecida no Autopilot: ${step.type}`);
            }
        }
    }

    /**
     * Replaces variable templates like {{telefone}} with actual values from the context
     */
    private static parseString(template: string, context: any): string {
        if (!template) return '';
        return template.replace(/{{(.*?)}}/g, (_, key) => {
            return context[key.trim()] || '';
        });
    }
}
