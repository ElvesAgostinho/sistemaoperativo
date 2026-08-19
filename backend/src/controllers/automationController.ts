import { Request, Response } from 'express';
import { AutomationEngine } from '../services/AutomationEngine';
import { getSupabase } from '../lib/supabaseClient';

/**
 * Deriva um trigger_type "legado" (texto simples) a partir do nó de trigger do grafo,
 * apenas para exibição rápida na sidebar (ex: badges/ícones) sem desempacotar jsonb.
 * O motor de execução (AutomationEngine) lê exclusivamente `nodes`/`edges`.
 */
function deriveTriggerType(nodes: any[]): string {
    const trigger = Array.isArray(nodes) ? nodes.find(n => n?.type === 'trigger') : null;
    if (!trigger) return 'MANUAL';
    if (trigger.data?.triggerKind === 'whatsapp_message') return 'WHATSAPP_MESSAGE';
    if (trigger.data?.triggerKind === 'webhook_generic') return `WEBHOOK_${String(trigger.data?.webhookSource || '').toUpperCase()}`;
    return 'MANUAL';
}

export const getAutomations = async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: automations, error } = await supabase.from('automations').select('*').order('criado_em', { ascending: false });
        if (error) throw error;
        return res.json({ success: true, automations });
    } catch (error) {
        console.error('Erro a listar automações:', error);
        return res.status(500).json({ error: 'Erro de servidor' });
    }
};

export const createAutomation = async (req: Request, res: Response) => {
    try {
        const dados = req.body;
        if (!dados.nome || !Array.isArray(dados.nodes)) {
            return res.status(400).json({ error: 'Faltam dados obrigatórios (nome, nodes).' });
        }

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data, error } = await supabase.from('automations').insert({
            empresa_id,
            nome: dados.nome,
            trigger_type: deriveTriggerType(dados.nodes),
            nodes: JSON.stringify(dados.nodes),
            edges: JSON.stringify(dados.edges || []),
            ativo: dados.ativo !== undefined ? dados.ativo : true
        }).select('id').single();

        if (error) throw error;

        return res.json({
            success: true,
            message: 'Automação registada com sucesso.',
            automation_id: data.id
        });
    } catch (error: any) {
        console.error('Erro a registar automação:', error);
        return res.status(500).json({ error: 'Erro ao registar na base de dados.', details: error.message });
    }
};

export const deleteAutomation = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const supabase = getSupabase(req);
        const { error } = await supabase.from('automations').delete().eq('id', Number(id));
        if (error) throw error;
        return res.json({ success: true, message: 'Automação apagada com sucesso.' });
    } catch (error: any) {
        console.error('Erro ao apagar automação:', error);
        return res.status(500).json({ error: 'Erro de servidor' });
    }
};

export const toggleAutomation = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const { ativo } = req.body;
        const supabase = getSupabase(req);
        const { error } = await supabase.from('automations').update({ ativo }).eq('id', Number(id));
        if (error) throw error;
        return res.json({ success: true, message: 'Estado da automação atualizado.' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
};

export const updateAutomation = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const { nodes, edges } = req.body;
        if (!Array.isArray(nodes)) {
            return res.status(400).json({ error: 'Campo "nodes" é obrigatório.' });
        }

        const supabase = getSupabase(req);
        const { error } = await supabase.from('automations').update({
            nodes: JSON.stringify(nodes),
            edges: JSON.stringify(edges || []),
            trigger_type: deriveTriggerType(nodes)
        }).eq('id', Number(id));
        if (error) throw error;
        return res.json({ success: true, message: 'Automação guardada com sucesso.' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
};

export const processWebhook = async (req: Request, res: Response) => {
    try {
        const { source } = req.params; // ex: 'whatsapp'
        const payload = req.body;

        // Emite o evento assíncrono para o motor e devolve 200 rápido para a API cliente
        AutomationEngine.processWebhook(source, payload).catch(err => {
            console.error('Erro no processamento do webhook assíncrono:', err);
        });

        return res.json({ success: true, message: 'Webhook recebido e em processamento.' });
    } catch (error: any) {
        console.error('Erro a processar webhook:', error);
        return res.status(500).json({ error: 'Erro de servidor' });
    }
};
