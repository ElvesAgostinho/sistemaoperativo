import { Router } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

/**
 * GET /api/settings
 * Retorna todas as configurações como um objeto chave-valor.
 * Valores sensíveis (como passwords) são mascarados.
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const supabase = getSupabase(req);
        const { data: rows, error } = await supabase.from('configuracoes').select('chave, valor, descricao');
        
        if (error) throw error;
        
        const config: Record<string, string> = {};
        (rows || []).forEach(r => {
            // Mascarar campos sensíveis
            if (r.chave.toLowerCase().includes('pass') || r.chave.toLowerCase().includes('token') || r.chave.toLowerCase().includes('secret')) {
                config[r.chave] = r.valor ? '••••••••••••' : '';
            } else {
                config[r.chave] = r.valor || '';
            }
        });
        res.json({ success: true, config });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/settings/:chave
 * Retorna o valor real de uma configuração específica (uso interno backend).
 */
router.get('/raw/:chave', requireAuth, async (req, res) => {
    try {
        const supabase = getSupabase(req);
        const { data: row, error } = await supabase.from('configuracoes').select('valor').eq('chave', req.params.chave).single();
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"
        res.json({ success: true, valor: row?.valor || null });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/settings
 * Guarda múltiplas configurações de uma vez.
 * Body: { configs: { chave: valor, ... } }
 */
router.put('/', requireAuth, async (req, res) => {
    const { configs } = req.body;
    if (!configs || typeof configs !== 'object') {
        return res.status(400).json({ error: 'Body deve conter { configs: { chave: valor } }' });
    }
    try {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        
        const upsertData = Object.entries(configs).map(([chave, valor]) => ({
            empresa_id,
            chave,
            valor,
            atualizado_em: new Date().toISOString()
        }));

        const { error } = await supabase.from('configuracoes').upsert(upsertData, { onConflict: 'empresa_id,chave' });
        if (error) throw error;
        
        res.json({ success: true, message: 'Configurações guardadas com sucesso!' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
