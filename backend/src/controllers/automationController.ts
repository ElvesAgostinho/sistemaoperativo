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
        // O isolamento entre empresas nunca pode depender só do RLS: a política
        // da tabela deixa o superadmin ver tudo (precisa disso no SaaS Global),
        // e sem este filtro os fluxos de OUTRAS empresas apareciam no Autopilot
        // de quem tem esse papel. Aqui dentro só se vê a empresa em que se está.
        const empresa_id = (req as any).user?.empresa_id;
        if (!empresa_id) return res.status(400).json({ error: 'Utilizador sem empresa associada.' });
        const { data: automations, error } = await supabase.from('automations').select('*')
            .eq('empresa_id', empresa_id).order('criado_em', { ascending: false });
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

/**
 * Simulador: corre o fluxo a seco com uma mensagem e devolve o que o cliente
 * receberia e por que nós passou. Não envia nada nem grava nada.
 */
export const simulateAutomation = async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        if (!empresa_id) return res.status(400).json({ error: 'Utilizador sem empresa associada.' });

        const { data: automation, error } = await supabase.from('automations').select('*')
            .eq('id', Number(req.params.id)).eq('empresa_id', empresa_id).maybeSingle();
        if (error) throw error;
        if (!automation) return res.status(404).json({ error: 'Fluxo não encontrado.' });

        const mensagem = String(req.body?.mensagem ?? '');
        const estado = req.body?.estado || null;
        const resultado = await AutomationEngine.simular(automation, mensagem, estado, req.body?.contexto || {});
        return res.json({ success: true, ...resultado });
    } catch (error: any) {
        console.error('Erro na simulação:', error);
        return res.status(500).json({ error: error.message || 'Erro de servidor' });
    }
};

export const deleteAutomation = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data, error } = await supabase.from('automations').delete().eq('id', Number(id)).eq('empresa_id', empresa_id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, error: 'Automação não encontrada ou sem permissão para eliminar.' });
        }
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
        const empresa_id = (req as any).user?.empresa_id;
        // Sem o filtro por empresa_id e sem confirmar a linha afetada, um
        // UPDATE bloqueado silenciosamente pelo isolamento entre empresas
        // respondia sempre "sucesso" — a pessoa ativava a automação, o ícone
        // ficava verde, mas o estado nunca mudava mesmo na base de dados.
        const { data, error } = await supabase.from('automations').update({ ativo }).eq('id', Number(id)).eq('empresa_id', empresa_id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, error: 'Automação não encontrada ou sem permissão para editar.' });
        }
        return res.json({ success: true, message: 'Estado da automação atualizado.' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
};

export const updateAutomation = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const { nodes, edges, nome } = req.body;

        const updatePayload: Record<string, any> = {};

        if (nodes !== undefined) {
            if (!Array.isArray(nodes)) {
                return res.status(400).json({ error: 'Campo "nodes" tem de ser uma lista.' });
            }
            updatePayload.nodes = JSON.stringify(nodes);
            updatePayload.edges = JSON.stringify(edges || []);
            updatePayload.trigger_type = deriveTriggerType(nodes);
        }

        if (nome !== undefined) {
            if (typeof nome !== 'string' || !nome.trim()) {
                return res.status(400).json({ error: 'O nome não pode ficar vazio.' });
            }
            updatePayload.nome = nome.trim();
        }

        if (Object.keys(updatePayload).length === 0) {
            return res.status(400).json({ error: 'Nada para atualizar (envie "nodes" e/ou "nome").' });
        }

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data, error } = await supabase.from('automations')
            .update(updatePayload)
            .eq('id', Number(id))
            .eq('empresa_id', empresa_id)
            .select('id');
        if (error) throw error;
        // Sem isto, um UPDATE que a proteção de isolamento entre empresas
        // bloqueia silenciosamente (0 linhas afetadas) respondia sempre
        // "guardado com sucesso" — o cliente via o alerta de sucesso mas as
        // alterações nunca chegavam a ficar gravadas.
        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, error: 'Automação não encontrada ou sem permissão para editar.' });
        }
        return res.json({ success: true, message: 'Automação guardada com sucesso.' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
};

export const processWebhook = async (req: Request, res: Response) => {
    try {
        const { source } = req.params; // ex: 'whatsapp'
        const payload = req.body;
        const empresaId = (req as any).user?.empresa_id;
        // Sem empresa não se dispara nada: caso contrário o webhook corria as
        // automações de TODAS as empresas.
        if (!empresaId) return res.status(400).json({ error: 'Utilizador sem empresa associada.' });

        // Emite o evento assíncrono para o motor e devolve 200 rápido para a API cliente
        AutomationEngine.processWebhook(source, payload, empresaId).catch(err => {
            console.error('Erro no processamento do webhook assíncrono:', err);
        });

        return res.json({ success: true, message: 'Webhook recebido e em processamento.' });
    } catch (error: any) {
        console.error('Erro a processar webhook:', error);
        return res.status(500).json({ error: 'Erro de servidor' });
    }
};
