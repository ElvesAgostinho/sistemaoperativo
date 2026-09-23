import { Router, Request, Response } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { AgendamentoService } from '../services/AgendamentoService';
import { AgendamentoFluxoService, MODELOS_AGENDAMENTO } from '../services/AgendamentoFluxoService';

const router = Router();

// ---------- Configuração: como a empresa chama as coisas + campos extra ----------
router.get('/config', async (req: Request, res: Response) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const config = await AgendamentoFluxoService.config(empresaId, getSupabase(req));
        res.json({ success: true, config, modelos: MODELOS_AGENDAMENTO });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/config', async (req: Request, res: Response) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        if (!['admin', 'superadmin'].includes((req as any).user?.role)) return res.status(403).json({ error: 'Só administradores.' });

        const corpo = req.body || {};
        const alt: any = {};
        // Escolher um modelo pronto traz os rótulos e os campos sugeridos.
        if (corpo.modelo && MODELOS_AGENDAMENTO[corpo.modelo]) {
            Object.assign(alt, MODELOS_AGENDAMENTO[corpo.modelo], { modelo: corpo.modelo });
            delete (alt as any).nome; delete (alt as any).exemplos;
        }
        for (const k of ['rotulo_item', 'rotulo_item_plural', 'rotulo_recurso', 'rotulo_recurso_plural', 'rotulo_agendamento', 'rotulo_agendamento_plural']) {
            if (typeof corpo[k] === 'string' && corpo[k].trim()) alt[k] = corpo[k].trim().slice(0, 40);
        }
        if (Array.isArray(corpo.campos)) {
            const vistos = new Set<string>();
            alt.campos = [];
            for (const c of corpo.campos) {
                const chave = String(c?.chave || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
                const rotulo = String(c?.rotulo || '').trim().slice(0, 60);
                if (!chave || !rotulo || vistos.has(chave)) continue;
                if (!['texto', 'numero', 'selecao'].includes(c?.tipo)) continue;
                vistos.add(chave);
                alt.campos.push({ chave, rotulo, tipo: c.tipo, obrigatorio: !!c.obrigatorio, opcoes: Array.isArray(c.opcoes) ? c.opcoes.map((o: any) => String(o).slice(0, 40)).filter(Boolean) : [] });
            }
        }
        const config = await AgendamentoFluxoService.guardarConfig(empresaId, alt, getSupabase(req));
        res.json({ success: true, config });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

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
        const { data, error } = await getSupabase(req).from('agendamento_servicos').select('*').eq('empresa_id', (req as any).user?.empresa_id).order('nome');
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
        const { data, error } = await getSupabase(req).from('agendamento_servicos').update({ ativo: false }).eq('id', req.params.id).eq('empresa_id', (req as any).user?.empresa_id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ success: false, error: 'Serviço não encontrado ou sem permissão para eliminar.' });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ---------- Profissionais ----------
router.get('/profissionais', async (req: Request, res: Response) => {
    try {
        const { data, error } = await getSupabase(req).from('agendamento_profissionais').select('*').eq('empresa_id', (req as any).user?.empresa_id).order('nome');
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
        const { data, error } = await getSupabase(req).from('agendamento_profissionais').update({ ativo: false }).eq('id', req.params.id).eq('empresa_id', (req as any).user?.empresa_id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ success: false, error: 'Profissional não encontrado ou sem permissão para eliminar.' });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// ---------- Horário de funcionamento ----------
router.get('/horarios', async (req: Request, res: Response) => {
    try {
        const { data, error } = await getSupabase(req).from('agendamento_horarios').select('*').eq('empresa_id', (req as any).user?.empresa_id).order('dia_semana');
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
