import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { getSupabase } from '../lib/supabaseClient';
import { EmailService } from '../services/EmailService';

const router = express.Router();

router.post('/send', requireAuth, async (req, res) => {
    const { para, assunto, corpo } = req.body;
    
    if (!para || !assunto || !corpo) {
        return res.status(400).json({ success: false, error: 'Campos para, assunto e corpo são obrigatórios.' });
    }

    try {
        const empresaId = (req as any).user?.empresa_id;
        const userClient = getSupabase(req);
        
        const enviado = await EmailService.enviarEmailPersonalizado(para, assunto, corpo, empresaId, userClient);

        if (enviado) {
            res.json({ success: true, message: 'Email enviado com sucesso!' });
        } else {
            res.status(500).json({ success: false, error: 'Falha ao enviar o email. Verifique as suas configurações SMTP.' });
        }
    } catch (err: any) {
        console.error('Erro ao enviar email:', err);
        res.status(500).json({ success: false, error: 'Falha ao enviar o email: ' + err.message });
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

router.put('/:id/read', requireAuth, async (req, res) => {
    try {
        const userClient = getSupabase(req);
        const { error } = await userClient.from('emails').update({ lido: true }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const userClient = getSupabase(req);
        const { error } = await userClient.from('emails').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
