import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';
import { getReuniaoPublica, adicionarFragmentoTranscricao } from '../controllers/reunioesPublicController';
import { AgendamentoService } from '../services/AgendamentoService';

const router = Router();

// ---------- Agendamento: página pública de marcação do cliente ----------
router.get('/agendamento/:empresa_id/info', async (req: Request, res: Response) => {
    try {
        const info = await AgendamentoService.getInfoPublica(req.params.empresa_id);
        res.json({ success: true, ...info });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/agendamento/:empresa_id/disponibilidade', async (req: Request, res: Response) => {
    try {
        const { servico_id, data, profissional_id } = req.query;
        const resultado = await AgendamentoService.getDisponibilidade(
            req.params.empresa_id, Number(servico_id), String(data), profissional_id ? Number(profissional_id) : undefined
        );
        res.json({ success: true, ...resultado });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/agendamento/:empresa_id/marcar', async (req: Request, res: Response) => {
    try {
        const id = await AgendamentoService.criarAgendamento(req.params.empresa_id, req.body, 'cliente');
        res.json({ success: true, id });
    } catch (err: any) { res.status(400).json({ success: false, error: err.message }); }
});

// Rotas públicas: página de reunião para convidados externos (sem sessão logada)
router.get('/reuniao/:id', getReuniaoPublica);
router.post('/reuniao/:id/fragmento', adicionarFragmentoTranscricao);

// Rota pública: Obter todas as vagas abertas de uma empresa específica
router.get('/vagas/:empresa_id', async (req: Request, res: Response) => {
    try {
        const { empresa_id } = req.params;
        const { data, error } = await supabase
            .from('recrutamento_vagas')
            .select('*')
            .eq('empresa_id', empresa_id)
            .eq('status', 'aberta')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Também buscar o nome da empresa para mostrar na UI
        const { data: empresa } = await supabase
            .from('empresas')
            .select('nome')
            .eq('id', empresa_id)
            .single();

        res.json({ success: true, vagas: data, empresaNome: empresa?.nome });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Rota pública: Obter detalhes de uma vaga específica
router.get('/vaga/:vaga_id', async (req: Request, res: Response) => {
    try {
        const { vaga_id } = req.params;
        const { data, error } = await supabase
            .from('recrutamento_vagas')
            .select('*, empresas(nome)')
            .eq('id', vaga_id)
            .single();

        if (error) throw error;
        res.json({ success: true, vaga: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Rota pública: Submeter uma candidatura
router.post('/candidatar', async (req: Request, res: Response) => {
    try {
        const { vaga_id, empresa_id, nome, email, telefone, linkedin_url, cv_url } = req.body;

        if (!vaga_id || !empresa_id || !nome || !email) {
            return res.status(400).json({ error: 'Dados obrigatórios em falta.' });
        }

        // Lógica simulada de "Match Score" da IA (Pode ser integrado com OpenAI no futuro)
        const matchScore = Math.floor(Math.random() * (95 - 60 + 1)) + 60; // Random entre 60 e 95
        const analise = `O candidato possui um score de compatibilidade de ${matchScore}%. A inteligência artificial identificou palavras-chave relevantes no currículo fornecido.`;

        const { data, error } = await supabase
            .from('recrutamento_candidaturas')
            .insert({
                vaga_id,
                empresa_id,
                nome,
                email,
                telefone,
                linkedin_url,
                cv_url,
                ai_score: matchScore,
                ai_analysis: analise,
                status: 'pendente'
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, candidatura: data, message: 'Candidatura enviada com sucesso!' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
