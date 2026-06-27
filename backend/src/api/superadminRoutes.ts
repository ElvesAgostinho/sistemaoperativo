import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';

const router = Router();

// Middleware para verificar se é superadmin
const requireSuperAdmin = (req: AuthRequest, res: Response, next: Function) => {
    if (req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acesso negado. Requer privilégios de SuperAdmin.' });
    }
    next();
};

// Obter todas as empresas
router.get('/empresas', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .order('criado_em', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, empresas: data });
});

// Aprovar/Suspender empresa
router.put('/empresas/:id/status', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body; // 'active', 'pending', 'suspended'

    if (!status) return res.status(400).json({ error: 'O status é obrigatório.' });

    const { error } = await supabase
        .from('empresas')
        .update({ status })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Status da empresa atualizado.' });
});

// Listar todos os utilizadores (apenas leitura para superadmin)
router.get('/users', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    const { data, error } = await supabase
        .from('perfis')
        .select(`*, empresas ( nome )`)
        .order('criado_em', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, users: data });
});

// removed sqlite import

// Obter módulos contratados de uma empresa
router.get('/empresas/:id/modulos', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { data: row, error } = await supabase.from('configuracoes').select('valor').eq('empresa_id', id).eq('chave', `modulos_empresa`).single();
        
        let modulos = ['hr', 'crm', 'reunioes']; // default básico
        if (row && row.valor) {
            modulos = JSON.parse(row.valor);
        }
        res.json({ success: true, modulos });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Atualizar módulos contratados de uma empresa
router.put('/empresas/:id/modulos', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { modulos } = req.body;
        
        if (!Array.isArray(modulos)) {
            return res.status(400).json({ error: 'Módulos deve ser um array.' });
        }

        const { error } = await supabase.from('configuracoes').upsert({
            empresa_id: id,
            chave: 'modulos_empresa',
            valor: JSON.stringify(modulos),
            atualizado_em: new Date().toISOString()
        }, { onConflict: 'empresa_id,chave' });

        if (error) throw error;

        res.json({ success: true, message: 'Licenciamento atualizado com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;
