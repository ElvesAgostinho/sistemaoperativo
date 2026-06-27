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

export default router;
