import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/authMiddleware';
import { getSupabase } from '../lib/supabaseClient';
import { EmailService } from '../services/EmailService';
import { EmailSyncService } from '../services/EmailSyncService';
import { EmailCampaignService } from '../services/EmailCampaignService';
import { MediaUploadService } from '../services/MediaUploadService';

const router = express.Router();

// 25 MB por ficheiro: é o limite prático do Gmail e da maioria dos servidores de
// correio. Acima disto a mensagem seria recusada do outro lado.
const LIMITE_ANEXO = 25 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE_ANEXO } });

router.post('/send', requireAuth, async (req, res) => {
    const { para, assunto, corpo, cc, bcc, anexos } = req.body;

    if (!para || !assunto || !corpo) {
        return res.status(400).json({ success: false, error: 'Preencha o destinatário, o assunto e a mensagem.' });
    }

    try {
        const empresaId = (req as any).user?.empresa_id;
        const userClient = getSupabase(req);
        const lista = Array.isArray(anexos) ? anexos : [];

        const r = lista.length
            ? await EmailService.enviarComAnexosDeLinks(para, assunto, corpo, lista, empresaId, { cc, bcc, userClient })
            : { ok: await EmailService.enviarEmailPersonalizado(para, assunto, corpo, empresaId, userClient, { cc, bcc }) };

        if (r.ok) res.json({ success: true, message: 'Email enviado.' });
        else res.status(500).json({ success: false, error: 'Não foi possível enviar. Confirme as definições de email da empresa.' });
    } catch (err: any) {
        console.error('Erro ao enviar email:', err);
        res.status(500).json({ success: false, error: 'Falha ao enviar o email: ' + err.message });
    }
});

/**
 * Anexar um ficheiro. O ficheiro é guardado no Storage e devolve-se o link — é
 * assim que um anexo grande não tem de viajar outra vez a cada destinatário de
 * uma campanha, e que a mensagem pode ser guardada como rascunho.
 */
router.post('/anexos', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum ficheiro recebido.' });
        const empresaId = (req as any).user?.empresa_id;
        const r = await MediaUploadService.upload(
            req.file.buffer, req.file.originalname, req.file.mimetype, 'campanhas', empresaId
        );
        res.json({ success: true, anexo: { nome: r.nome, url: r.url, tipo: req.file.mimetype, tamanho: req.file.size } });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// O multer rejeita ficheiros acima do limite com um erro próprio — sem isto a
// pessoa via um erro técnico em inglês em vez de saber o que se passou.
router.use((err: any, _req: any, res: any, next: any) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: 'O ficheiro é maior do que 25 MB, que é o máximo que o email aceita.' });
    }
    next(err);
});

// ============================================================
// CAMPANHAS DE EMAIL
// ============================================================
router.get('/campanhas', requireAuth, async (req, res) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const client = getSupabase(req);
        const { data, error } = await client.from('email_campanhas').select('*')
            .eq('empresa_id', empresaId).order('criado_em', { ascending: false });
        if (error) throw error;

        const comMetricas = await Promise.all((data || []).map(async (c: any) => ({
            ...c, metricas: await EmailCampaignService.metricas(empresaId, c.id, client)
        })));
        res.json({ success: true, campanhas: comMetricas });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Quantas pessoas é que este público-alvo apanha, antes de criar a campanha.
router.post('/campanhas/previsualizar', requireAuth, async (req, res) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const { publico_tipo, publico_tags, manual_ids, lista } = req.body;
        const contactos = await EmailCampaignService.resolverPublico(
            empresaId, publico_tipo || 'todos',
            { tags: publico_tags, manualIds: manual_ids, lista }, getSupabase(req)
        );
        res.json({ success: true, total: contactos.length, amostra: contactos.slice(0, 5).map(c => c.email) });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.post('/campanhas', requireAuth, async (req, res) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const r = await EmailCampaignService.criar(empresaId, req.body, (req as any).user?.id, getSupabase(req));
        res.json({ success: true, ...r });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.get('/campanhas/:id/destinatarios', requireAuth, async (req, res) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const { data, error } = await getSupabase(req).from('email_campanha_destinatarios')
            .select('id, nome, email, estado, erro, enviado_em')
            .eq('campanha_id', req.params.id).eq('empresa_id', empresaId)
            .order('id').limit(500);
        if (error) throw error;
        res.json({ success: true, destinatarios: data });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

for (const [accao, metodo] of [['iniciar', 'iniciar'], ['pausar', 'pausar'], ['cancelar', 'cancelar']] as const) {
    router.post(`/campanhas/:id/${accao}`, requireAuth, async (req, res) => {
        try {
            const empresaId = (req as any).user?.empresa_id;
            await (EmailCampaignService as any)[metodo](empresaId, req.params.id, getSupabase(req));
            res.json({ success: true });
        } catch (err: any) {
            res.status(400).json({ success: false, error: err.message });
        }
    });
}

router.delete('/campanhas/:id', requireAuth, async (req, res) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const client = getSupabase(req);
        const { data: c } = await client.from('email_campanhas').select('estado')
            .eq('id', req.params.id).eq('empresa_id', empresaId).single();
        if (!c) return res.status(404).json({ success: false, error: 'Campanha não encontrada.' });
        if (c.estado === 'Em_Execucao') {
            return res.status(409).json({ success: false, error: 'Pare a campanha antes de a apagar.' });
        }
        const { error } = await client.from('email_campanhas').delete().eq('id', req.params.id).eq('empresa_id', empresaId);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/', requireAuth, async (req, res) => {
    try {
        const userClient = getSupabase(req);
        const empresaId = (req as any).user?.empresa_id;
        
        let query = userClient.from('emails').select('*').order('data_envio', { ascending: false });
        if (empresaId) query = query.eq('empresa_id', empresaId);
        else query = query.is('empresa_id', null);

        const { data, error } = await query;
        if (error) throw error;
        
        res.json({ success: true, emails: data });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/sync', requireAuth, async (req, res) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const addedCount = await EmailSyncService.syncInbox(empresaId);
        res.json({ success: true, addedCount });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/:id/read', requireAuth, async (req, res) => {
    try {
        const userClient = getSupabase(req);
        const empresaId = (req as any).user?.empresa_id;
        const { error } = await userClient.from('emails').update({ lido: true }).eq('id', req.params.id).eq('empresa_id', empresaId);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const userClient = getSupabase(req);
        const empresaId = (req as any).user?.empresa_id;
        const { error } = await userClient.from('emails').delete().eq('id', req.params.id).eq('empresa_id', empresaId);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
