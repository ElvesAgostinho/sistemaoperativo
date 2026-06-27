import { Request, Response } from 'express';
import { AutomationEngine } from '../services/AutomationEngine';
import { getSupabase } from '../lib/supabaseClient';

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
        if (!dados.nome || !dados.trigger_type || !dados.steps) {
            return res.status(400).json({ error: 'Faltam dados obrigatórios.' });
        }
        
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data, error } = await supabase.from('automations').insert({
            empresa_id,
            nome: dados.nome,
            trigger_type: dados.trigger_type,
            steps: JSON.stringify(dados.steps),
            ativo: true
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
        const { steps } = req.body;
        const supabase = getSupabase(req);
        const { error } = await supabase.from('automations').update({ steps: JSON.stringify(steps) }).eq('id', Number(id));
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
        AutomationEngine.processWebhook(`WEBHOOK_${source.toUpperCase()}`, payload).catch(err => {
            console.error('Erro no processamento do webhook assíncrono:', err);
        });
        
        return res.json({ success: true, message: 'Webhook recebido e em processamento.' });
    } catch (error: any) {
        console.error('Erro a processar webhook:', error);
        return res.status(500).json({ error: 'Erro de servidor' });
    }
};

import OpenAI from 'openai';

export const generateAutomation = async (req: Request, res: Response) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt é obrigatório.' });

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        const systemPrompt = `
        És um especialista em automação e integração de sistemas, responsável por construir Workflows JSON detalhados.
        O utilizador quer um workflow para: responder mensagens no whatsapp, enviar emails ou outras tarefas avançadas.
        Se o utilizador pedir para enviar ficheiros (fotos, videos, audios), assume que os ficheiros estarão disponíveis na pasta local "C:\\Users\\DELL\\Desktop\\SISTEMA OPERATIVO\\Media_Workflows\\".
        
        Regras para os nós do Workflow (steps):
        - Usa: CREATE_CLIENT, IF_CONDITION, REPLY_MESSAGE, SEND_DOCUMENT, SEND_IMAGE, SEND_VIDEO, SEND_AUDIO, SEND_EMAIL.
        - Se for necessário interligar com outro workflow, usa o nó "JUMP_TO_WORKFLOW" onde os "config" contêm o "target_workflow_nome" com o nome da automação a chamar.
        - Se o pedido exigir uma API externa (como Stripe, Twilio, Meta, etc), deves ADICIONAR um step do tipo "API_REQUIRED" onde os "config" tem os campos de input que a pessoa deverá preencher (ex: { type: "API_REQUIRED", config: { service: "Stripe", fields: ["API_KEY", "ENDPOINT_URL"] } }).

        Gera APENAS um objeto JSON válido (sem blocos markdown) com o seguinte formato exato:
        {
          "nome": "Nome criativo da automação",
          "trigger_type": "WEBHOOK_WHATSAPP ou WEBHOOK_EMAIL ou MANUAL",
          "steps": [
             { "type": "TIPO", "config": { ... } }
          ]
        }
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("A IA não retornou conteúdo");

        const parsedWorkflow = JSON.parse(content);

        return res.json({ success: true, workflow: parsedWorkflow });

    } catch (error: any) {
        console.error('Erro na IA Construtor:', error);
        return res.status(500).json({ error: 'Falha ao gerar workflow com IA.', details: error.message });
    }
};
