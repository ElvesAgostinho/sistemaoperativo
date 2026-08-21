import { Router, Request, Response } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { AgendamentoService } from '../services/AgendamentoService';

const router = Router();

// ---------- Dashboard ----------
router.get('/resumo', async (req: Request, res: Response) => {
    try {
        const resumo = await AgendamentoService.getResumo(req);
        res.json({ success: true, ...resumo });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ---------- Marcações ----------
router.get('/marcacoes', async (req: Request, res: Response) => {
    try {
        const { data_inicio, data_fim, estado } = req.query;
        const agendamentos = await AgendamentoService.listarAgendamentos(req, {
            data_inicio: data_inicio as string, data_fim: data_fim as string, estado: estado as string
        });
        res.json({ success: true, agendamentos });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/marcacoes', async (req: Request, res: Response) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const client = getSupabase(req);
        const id = await AgendamentoService.criarAgendamento(empresaId, req.body, 'manual', client);
        res.json({ success: true, id });
    } catch (err: any) { res.status(400).json({ success: false, error: err.message }); }
});

router.get('/disponibilidade', async (req: Request, res: Response) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const { servico_id, data, profissional_id } = req.query;
        const client = getSupabase(req);
        const resultado = await AgendamentoService.getDisponibilidade(
            empresaId, Number(servico_id), String(data), profissional_id ? Number(profissional_id) : undefined, client
        );
        res.json({ success: true, ...resultado });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/marcacoes/:id/cancelar', async (req: Request, res: Response) => {
    try {
        await AgendamentoService.cancelarAgendamento(req, Number(req.params.id));
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/marcacoes/:id/remarcar', async (req: Request, res: Response) => {
    try {
        const { data, hora_inicio } = req.body;
        await AgendamentoService.remarcarAgendamento(req, Number(req.params.id), data, hora_inicio);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/marcacoes/:id/estado', async (req: Request, res: Response) => {
    try {
        await AgendamentoService.atualizarEstado(req, Number(req.params.id), req.body.estado);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/marcacoes/:id', async (req: Request, res: Response) => {
    try {
        await AgendamentoService.eliminarAgendamento(req, Number(req.params.id));
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ---------- Serviços ----------
router.get('/servicos', async (req: Request, res: Response) => {
    try {
        const { data, error } = await getSupabase(req).from('agendamento_servicos').select('*').order('nome');
        if (error) throw error;
        res.json({ success: true, servicos: data });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/servicos', async (req: Request, res: Response) => {
    try {
        const empresa_id = (req as any).user?.empresa_id;
        const { nome, duracao_minutos, preco, cor } = req.body;
        const { data, error } = await getSupabase(req).from('agendamento_servicos').insert({
            empresa_id, nome, duracao_minutos: duracao_minutos || 30, preco: preco || null, cor: cor || '#C9992E'
        }).select('id').single();
        if (error) throw error;
        res.json({ success: true, id: data.id });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/servicos/:id', async (req: Request, res: Response) => {
    try {
        const { error } = await getSupabase(req).from('agendamento_servicos').update({ ativo: false }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ---------- Profissionais ----------
router.get('/profissionais', async (req: Request, res: Response) => {
    try {
        const { data, error } = await getSupabase(req).from('agendamento_profissionais').select('*').order('nome');
        if (error) throw error;
        res.json({ success: true, profissionais: data });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/profissionais', async (req: Request, res: Response) => {
    try {
        const empresa_id = (req as any).user?.empresa_id;
        const { nome } = req.body;
        const { data, error } = await getSupabase(req).from('agendamento_profissionais').insert({ empresa_id, nome }).select('id').single();
        if (error) throw error;
        res.json({ success: true, id: data.id });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/profissionais/:id', async (req: Request, res: Response) => {
    try {
        const { error } = await getSupabase(req).from('agendamento_profissionais').update({ ativo: false }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ---------- Horário de funcionamento ----------
router.get('/horarios', async (req: Request, res: Response) => {
    try {
        const { data, error } = await getSupabase(req).from('agendamento_horarios').select('*').order('dia_semana');
        if (error) throw error;
        res.json({ success: true, horarios: data });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/horarios', async (req: Request, res: Response) => {
    try {
        const empresa_id = (req as any).user?.empresa_id;
        const { dia_semana, hora_inicio, hora_fim, ativo } = req.body;
        const client = getSupabase(req);
        const { error } = await client.from('agendamento_horarios')
            .upsert({ empresa_id, dia_semana, hora_inicio, hora_fim, ativo }, { onConflict: 'empresa_id,dia_semana' });
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

export default router;
