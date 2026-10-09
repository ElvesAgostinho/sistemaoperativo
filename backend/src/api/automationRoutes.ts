import { Router } from 'express';
import { FluxoDisparoService } from '../services/FluxoDisparoService';
import { getSupabase } from '../lib/supabaseClient';
import { getAutomations, createAutomation, processWebhook, deleteAutomation, toggleAutomation, updateAutomation, simulateAutomation } from '../controllers/automationController';

import multer from 'multer';
import { MediaUploadService } from '../services/MediaUploadService';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Gestão de Workflows
router.get('/', getAutomations);
router.post('/', createAutomation);
router.delete('/:id', deleteAutomation);
router.put('/:id/toggle', toggleAutomation);
router.put('/:id', updateAutomation); // Nova Rota
router.post('/:id/simular', simulateAutomation);

// Upload Multimédia — vai para o Supabase Storage e o nó guarda o link.
// (Antes era gravado num caminho de Windows fixo no código, que não existe
// no servidor Linux de produção: os nós de imagem/áudio/vídeo falhavam
// sempre com "ficheiro não encontrado".)
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });
        const empresaId = (req as any).user?.empresa_id;
        const resultado = await MediaUploadService.upload(
            req.file.buffer, req.file.originalname, req.file.mimetype, 'workflows', empresaId
        );
        res.json({ success: true, filePath: resultado.url, tipo: resultado.tipo });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Webhook Listener Genérico
router.post('/webhook/:source', processWebhook);

// ============================================================
// DISPARAR UM FLUXO PARA MUITA GENTE
// Um fluxo so arrancava quando chegava uma mensagem. Isto permite o contrario:
// escolher quem recebe e por o fluxo a correr para todos, aos poucos.
// ============================================================
router.get('/disparos', async (req: any, res: any) => {
    try {
        const empresaId = req.user?.empresa_id;
        const client = getSupabase(req);
        const { data, error } = await client.from('fluxo_disparos').select('*')
            .eq('empresa_id', empresaId).order('criado_em', { ascending: false });
        if (error) throw error;
        const comMetricas = await Promise.all((data || []).map(async (d: any) => ({
            ...d, metricas: await FluxoDisparoService.metricas(empresaId, d.id, client)
        })));
        res.json({ success: true, disparos: comMetricas });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Quantas pessoas e que este publico apanha, antes de disparar seja o que for.
router.post('/disparos/previsualizar', async (req: any, res: any) => {
    try {
        const empresaId = req.user?.empresa_id;
        const { publico_tipo, publico_tags, manual_ids } = req.body || {};
        const contactos = await FluxoDisparoService.resolverPublico(
            empresaId, publico_tipo || 'tags', { tags: publico_tags, manualIds: manual_ids }, getSupabase(req)
        );
        res.json({ success: true, total: contactos.length, amostra: contactos.slice(0, 5).map((c: any) => c.nome || c.telefone) });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.post('/disparos', async (req: any, res: any) => {
    try {
        const empresaId = req.user?.empresa_id;
        const r = await FluxoDisparoService.criar(empresaId, req.body, req.user?.id, getSupabase(req));
        res.json({ success: true, ...r });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.get('/disparos/:id/destinatarios', async (req: any, res: any) => {
    try {
        const empresaId = req.user?.empresa_id;
        const { data, error } = await getSupabase(req).from('fluxo_disparo_destinatarios')
            .select('id, nome, telefone, estado, erro, enviado_em')
            .eq('disparo_id', req.params.id).eq('empresa_id', empresaId).order('id').limit(500);
        if (error) throw error;
        res.json({ success: true, destinatarios: data });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

for (const accao of ['iniciar', 'pausar', 'cancelar'] as const) {
    router.post(`/disparos/:id/${accao}`, async (req: any, res: any) => {
        try {
            await (FluxoDisparoService as any)[accao](req.user?.empresa_id, req.params.id, getSupabase(req));
            res.json({ success: true });
        } catch (err: any) {
            res.status(400).json({ success: false, error: err.message });
        }
    });
}

router.delete('/disparos/:id', async (req: any, res: any) => {
    try {
        const empresaId = req.user?.empresa_id;
        const client = getSupabase(req);
        const { data: d } = await client.from('fluxo_disparos').select('estado')
            .eq('id', req.params.id).eq('empresa_id', empresaId).maybeSingle();
        if (!d) return res.status(404).json({ success: false, error: 'Disparo não encontrado.' });
        if (d.estado === 'Em_Execucao') return res.status(409).json({ success: false, error: 'Pare o disparo antes de o apagar.' });
        const { error } = await client.from('fluxo_disparos').delete().eq('id', req.params.id).eq('empresa_id', empresaId);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
