import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';

const router = Router();

// Middleware para verificar se é admin ou superadmin
const requireAdmin = (req: AuthRequest, res: Response, next: Function) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acesso negado. Requer privilégios de administrador.' });
    }
    next();
};

// Obter todos os utilizadores (perfis) da mesma empresa
router.get('/', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    if (!req.user?.empresa_id) {
        // Se for superadmin mas não tiver empresa, devolvemos uma lista vazia na Gestão de Equipa (ele tem a dashboard SaaS Global para ver todos)
        if (req.user?.role === 'superadmin') return res.json({ success: true, users: [] });
        return res.status(400).json({ error: 'Admin não tem empresa associada.' });
    }

    const { data, error } = await supabase
        .from('perfis')
        .select('*')
        .eq('empresa_id', req.user.empresa_id)
        .order('criado_em', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, users: data });
});

// Alterar o role de um utilizador (apenas da mesma empresa)
router.put('/:id/role', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) return res.status(400).json({ error: 'O role é obrigatório.' });

    // Primeiro verificar se o utilizador pertence à mesma empresa
    const { data: userToUpdate } = await supabase.from('perfis').select('empresa_id').eq('id', id).single();
    if (!userToUpdate || userToUpdate.empresa_id !== req.user?.empresa_id) {
        return res.status(403).json({ error: 'Não autorizado a alterar este utilizador.' });
    }

    const { error } = await supabase
        .from('perfis')
        .update({ role })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Função atualizada com sucesso.' });
});

// Alterar estado (ativo/inativo) de um utilizador
router.put('/:id/status', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { ativo } = req.body;

    if (ativo === undefined) return res.status(400).json({ error: 'O estado ativo é obrigatório.' });

    // Verificar empresa
    const { data: userToUpdate } = await supabase.from('perfis').select('empresa_id').eq('id', id).single();
    if (!userToUpdate || userToUpdate.empresa_id !== req.user?.empresa_id) {
        return res.status(403).json({ error: 'Não autorizado a alterar este utilizador.' });
    }

    const { error } = await supabase
        .from('perfis')
        .update({ ativo })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Estado atualizado com sucesso.' });
});

export default router;
