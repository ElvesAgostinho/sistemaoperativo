import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';

const router = Router();

// Helper: criar cliente com o token do utilizador autenticado (respeita RLS superadmin)
const getClientForUser = (req: AuthRequest) => {
    const token = req.headers.authorization?.split(' ')[1];
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    // Se tiver service key, usa para contornar RLS completamente
    if (serviceKey) {
        return createClient(process.env.SUPABASE_URL || '', serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    
    // Caso contrário, usa o token do utilizador (RLS policy de superadmin deve permitir)
    return createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '', {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    });
};

// Middleware para verificar se é superadmin
const requireSuperAdmin = (req: AuthRequest, res: Response, next: Function) => {
    if (req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acesso negado. Requer privilégios de SuperAdmin.' });
    }
    next();
};

// Obter todas as empresas
router.get('/empresas', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    const db = getClientForUser(req);
    const { data, error } = await db
        .from('empresas')
        .select('*')
        .order('criado_em', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, empresas: data });
});

// Apagar uma empresa VAZIA. Existe por causa das empresas repetidas que o registo
// criava: ficavam duas com o mesmo nome, uma delas sem utilizador nenhum. Só
// apaga quando não há nada lá dentro — se houver, devolve o que encontrou e não
// mexe. Não é um "apagar empresa" genérico, de propósito.
router.delete('/empresas/:id', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const db = getClientForUser(req);

    const { data: empresa } = await db.from('empresas').select('id, nome').eq('id', id).maybeSingle();
    if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada.' });

    const tabelas = ['perfis', 'clientes', 'agendamentos', 'automations', 'wa_channels', 'documentos'];
    const conteudo: Record<string, number> = {};
    for (const t of tabelas) {
        const { count, error } = await db.from(t).select('id', { count: 'exact', head: true }).eq('empresa_id', id);
        if (error) continue;                 // tabela que não existe nesta instalação — ignora
        if (count && count > 0) conteudo[t] = count;
    }

    if (Object.keys(conteudo).length) {
        return res.status(409).json({
            error: `"${empresa.nome}" não está vazia e por isso não foi apagada.`,
            conteudo
        });
    }

    await db.from('configuracoes_sistema').delete().eq('empresa_id', id);
    const { error } = await db.from('empresas').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    console.log(`[SuperAdmin] Empresa vazia "${empresa.nome}" (${id}) apagada.`);
    return res.json({ success: true, message: `"${empresa.nome}" apagada.` });
});

// Empresas repetidas: mesmo nome, criadas com segundos de diferença, uma delas
// sem utilizadores. Devolve a lista para o painel poder assinalá-las.
router.get('/empresas/duplicadas', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    const db = getClientForUser(req);
    const { data: empresas } = await db.from('empresas').select('id, nome, status, criado_em');
    const { data: perfis } = await db.from('perfis').select('empresa_id');

    const comUtilizadores = new Set((perfis || []).map((p: any) => String(p.empresa_id)));
    const porNome: Record<string, any[]> = {};
    for (const e of (empresas || [])) (porNome[e.nome] = porNome[e.nome] || []).push(e);

    const vazias = Object.values(porNome)
        .filter(grupo => grupo.length > 1)
        .flatMap(grupo => grupo.filter(e => !comUtilizadores.has(String(e.id))));

    return res.json({ success: true, vazias });
});

// Aprovar/Suspender empresa
router.put('/empresas/:id/status', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: 'O status é obrigatório.' });

    const db = getClientForUser(req);
    const { error } = await db
        .from('empresas')
        .update({ status })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Status da empresa atualizado.' });
});

// Definir o limite de utilizadores de uma empresa (upsell de "lugares" por plano)
router.put('/empresas/:id/limite', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { limite_usuarios } = req.body;

    if (limite_usuarios !== null && (!Number.isInteger(limite_usuarios) || limite_usuarios < 0)) {
        return res.status(400).json({ error: 'O limite tem de ser um número inteiro (0 ou mais) ou null para ilimitado.' });
    }

    const db = getClientForUser(req);
    const { error } = await db
        .from('empresas')
        .update({ limite_usuarios })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: 'Limite de utilizadores atualizado.' });
});

// Listar todos os utilizadores (apenas leitura para superadmin)
router.get('/users', requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    const db = getClientForUser(req);
    const { data, error } = await db
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
        const db = getClientForUser(req);
        const { data: row, error } = await db.from('configuracoes').select('valor').eq('empresa_id', id).eq('chave', `modulos_empresa`).single();
        
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
        const db = getClientForUser(req);
        
        if (!Array.isArray(modulos)) {
            return res.status(400).json({ error: 'Módulos deve ser um array.' });
        }

        const { error } = await db.from('configuracoes').upsert({
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
