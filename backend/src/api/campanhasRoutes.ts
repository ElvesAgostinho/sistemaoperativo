import { Router, Response } from 'express';
import { getSupabase, supabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { CampaignService } from '../services/CampaignService';

const router = Router();

// Tags distintas já usadas nos contactos da empresa — para o seletor de público-alvo.
router.get('/tags-disponiveis', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { data } = await getSupabase(req).from('clientes').select('tags').eq('empresa_id', req.user!.empresa_id);
        const set = new Set<string>();
        (data || []).forEach((row: any) => (row.tags || []).forEach((t: string) => set.add(t)));
        res.json({ success: true, tags: Array.from(set).sort() });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Pré-visualização do público-alvo (quantos contactos, amostra) antes de criar a campanha.
router.post('/publico/preview', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { publico_tipo, publico_tags, manual_ids } = req.body;
        const contactos = await CampaignService.resolverPublico(req.user!.empresa_id!, publico_tipo, publico_tags, manual_ids, getSupabase(req));
        res.json({ success: true, total: contactos.length, amostra: contactos.slice(0, 5) });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { data, error } = await getSupabase(req).from('campanhas').select('*').eq('empresa_id', req.user!.empresa_id).order('criado_em', { ascending: false });
        if (error) throw error;

        const comMetricas = await Promise.all((data || []).map(async (c: any) => ({
            ...c, metricas: await CampaignService.getMetrics(req.user!.empresa_id!, c.id, getSupabase(req))
        })));
        res.json({ success: true, campanhas: comMetricas });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const empresaId = req.user!.empresa_id!;
        const { channel_id, ...dados } = req.body;
        if (!channel_id) return res.status(400).json({ error: 'channel_id é obrigatório.' });

        const resultado = await CampaignService.criarCampanha(empresaId, channel_id, dados, req.user!.id, getSupabase(req));

        // Se pedida para arrancar já / agendada, inicia logo após a criação.
        if (dados.iniciar_imediatamente || dados.agendada_para) {
            await CampaignService.iniciarCampanha(empresaId, resultado.id, getSupabase(req));
        }

        res.json({ success: true, ...resultado });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { data, error } = await getSupabase(req).from('campanhas').select('*').eq('id', req.params.id).eq('empresa_id', req.user!.empresa_id).single();
        if (error || !data) return res.status(404).json({ error: 'Campanha não encontrada.' });
        const metricas = await CampaignService.getMetrics(req.user!.empresa_id!, data.id, getSupabase(req));
        res.json({ success: true, campanha: { ...data, metricas } });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/destinatarios', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const estado = req.query.estado as string | undefined;
        let query = getSupabase(req).from('campanha_destinatarios').select('*')
            .eq('campanha_id', req.params.id).eq('empresa_id', req.user!.empresa_id)
            .order('atualizado_em', { ascending: false }).limit(200);
        if (estado) query = query.eq('estado', estado);
        const { data, error } = await query;
        if (error) throw error;
        res.json({ success: true, destinatarios: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/iniciar', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        await CampaignService.iniciarCampanha(req.user!.empresa_id!, req.params.id, getSupabase(req));
        await getSupabase(req).from('wa_audit_logs').insert({ campanha_id: req.params.id, action: 'campanha_iniciada', performed_by: req.user!.id });
        res.json({ success: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/:id/pausar', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        await CampaignService.pausarCampanha(req.user!.empresa_id!, req.params.id, getSupabase(req));
        await getSupabase(req).from('wa_audit_logs').insert({ campanha_id: req.params.id, action: 'campanha_pausada', performed_by: req.user!.id });
        res.json({ success: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/:id/cancelar', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        await CampaignService.cancelarCampanha(req.user!.empresa_id!, req.params.id, getSupabase(req));
        await getSupabase(req).from('wa_audit_logs').insert({ campanha_id: req.params.id, action: 'campanha_cancelada', performed_by: req.user!.id });
        res.json({ success: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { data: campanha } = await getSupabase(req).from('campanhas').select('estado').eq('id', req.params.id).eq('empresa_id', req.user!.empresa_id).single();
        if (!campanha) return res.status(404).json({ error: 'Campanha não encontrada.' });
        if (['Em_Execucao'].includes(campanha.estado)) return res.status(400).json({ error: 'Pause a campanha antes de a eliminar.' });
        const { error } = await getSupabase(req).from('campanhas').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
