import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';

const router = Router();

// ==============================================================
// 2. ROTAS PARA O OPENCLAW (VPS 2) SE COMUNICAR COM O BACKEND
// ==============================================================

/**
 * Endpoint de Ferramentas (Tools) do Agente.
 * O OpenClaw será configurado para disparar um Webhook para esta rota
 * sempre que a IA decidir que precisa de uma ação externa (ex: consultar saldo, gerar PDF).
 */
router.post('/tools', async (req: Request, res: Response) => {
    try {
        // Validação básica de segurança (Token de autorização do OpenClaw)
        const authHeader = req.headers.authorization;
        const expectedToken = process.env.AGENT_WEBHOOK_SECRET;

        if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
            return res.status(401).json({ error: 'Unauthorized agent' });
        }

        const { action, payload, empresaId } = req.body;

        console.log(`[AgentWebhook] Recebida requisição de ação: ${action} para empresa: ${empresaId}`);

        // Aqui nós substituímos o n8n: Cada 'action' é uma automação construída em código
        switch (action) {
            case 'CHECK_CLIENT_STATUS':
                // Exemplo: Consultar se o cliente X (telefone do payload) tem faturas atrasadas
                const phone = payload.phoneNumber;
                const { data: client } = await supabase
                    .from('clientes')
                    .select('*')
                    .eq('empresa_id', empresaId)
                    .eq('telefone', phone)
                    .single();

                if (!client) {
                    return res.json({ result: "Cliente não encontrado na base de dados." });
                }

                return res.json({
                    result: `Cliente encontrado. Nome: ${client.nome}. Status: ${client.status_pagamento || 'Em dia'}.`
                });

            case 'CREATE_TICKET':
                // Exemplo: Criar um ticket de suporte
                const { data: ticket } = await supabase.from('suporte_tickets').insert({
                    empresa_id: empresaId,
                    titulo: payload.issue,
                    status: 'aberto'
                }).select().single();

                return res.json({ result: `Ticket criado com sucesso! Número do ticket: #${ticket?.id}` });

            case 'GET_COMPANY_INFO':
                // RAG Dinâmico: Buscar informações do Supabase e devolver ao agente
                return res.json({ result: "A nossa empresa atende de segunda a sexta, das 09h às 18h." });

            default:
                return res.status(400).json({ error: `Action '${action}' not supported.` });
        }

    } catch (err: any) {
        console.error('[AgentWebhook] Erro ao processar webhook do OpenClaw:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
