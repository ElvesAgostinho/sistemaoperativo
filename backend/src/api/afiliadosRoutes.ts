import { Router, Request, Response } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// GET /api/afiliados - List all affiliates with stats
router.get('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        // Utilizando junções ou subqueries em Supabase. No Supabase, o ideal é RPC ou buscar as relações.
        // Para simplificar, buscamos afiliados e depois as relações, ou se houver view.
        const { data: afiliados, error } = await supabase.from('afiliados').select('*, clientes(id), comissoes(valor_comissao, estado)').order('criado_em', { ascending: false });
        
        if (error) throw error;

        const results = (afiliados || []).map((a: any) => {
            const totalClientes = a.clientes ? a.clientes.length : 0;
            const comissoes = a.comissoes || [];
            const totalGerado = comissoes.reduce((acc: number, c: any) => acc + (Number(c.valor_comissao) || 0), 0);
            const totalPendente = comissoes
                .filter((c: any) => c.estado === 'Pendente' || c.estado === 'Aprovada')
                .reduce((acc: number, c: any) => acc + (Number(c.valor_comissao) || 0), 0);
            
            return {
                ...a,
                total_clientes: totalClientes,
                total_gerado: totalGerado,
                total_pendente: totalPendente
            };
        });
        
        return res.json({ success: true, afiliados: results });
    } catch (error) {
        console.error("Erro GET /api/afiliados:", error);
        return res.status(500).json({ error: 'Erro ao listar afiliados.' });
    }
});

// LOGIN DO AFILIADO (Portal Externo)
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        // In a real scenario, use Supabase Auth for affiliates. Here we mock it based on old DB schema.
        // We use process.env to create a service role client to bypass RLS for login, or we rely on the specific query.
        // But since it's a login route and has no req.user yet, we must use a service role client.
        const { supabase: supabaseAdmin } = require('../lib/supabaseClient'); 
        const { data: afiliado, error } = await supabaseAdmin.from('afiliados').select('id, nome, email, codigo_referencia').eq('email', email).eq('senha', senha).single();
        
        if (error || !afiliado) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }
        
        // Simples auth base (Num sistema real usaríamos JWT)
        res.json({ afiliado });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// MATERIAIS DE MARKETING
router.get('/materiais', async (req, res) => {
    try {
        const { supabase: supabaseAdmin } = require('../lib/supabaseClient'); 
        const { data: materiais, error } = await supabaseAdmin.from('materiais_marketing').select('*').order('criado_em', { ascending: false });
        if (error) throw error;
        res.json({ materiais });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/materiais', requireAuth, async (req, res) => {
    try {
        const { titulo, tipo, url, descricao } = req.body;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        
        const { data: info, error } = await supabase.from('materiais_marketing').insert({
            empresa_id, titulo, tipo: tipo || 'imagem', url, descricao: descricao || ''
        }).select('id').single();
        
        if (error) throw error;
        res.json({ success: true, id: info.id });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/materiais/:id', requireAuth, async (req, res) => {
    try {
        const supabase = getSupabase(req);
        const { error } = await supabase.from('materiais_marketing').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PORTAL DO AFILIADO: Obter estatísticas do Afiliado logado
router.get('/:id/portal-stats', async (req, res) => {
    try {
        const afiliadoId = req.params.id;
        const { supabase: supabaseAdmin } = require('../lib/supabaseClient'); 
        
        const { data: comissoes, error: cErr } = await supabaseAdmin.from('comissoes').select('*, negocios(titulo)').eq('afiliado_id', afiliadoId).order('criado_em', { ascending: false });
        if (cErr) throw cErr;
        
        const leads_gerados = comissoes ? comissoes.length : 0;
        const ganhos_aprovados = (comissoes || []).filter((c: any) => ['Aprovada', 'Paga', 'Processada'].includes(c.estado)).reduce((acc: number, c: any) => acc + (Number(c.valor_comissao) || 0), 0);
        const ganhos_pendentes = (comissoes || []).filter((c: any) => c.estado === 'Pendente').reduce((acc: number, c: any) => acc + (Number(c.valor_comissao) || 0), 0);
        
        const recentes = (comissoes || []).slice(0, 10).map((c: any) => ({
            id: c.id,
            valor_comissao: c.valor_comissao,
            estado: c.estado,
            criado_em: c.criado_em,
            negocio_titulo: c.negocios?.titulo
        }));

        res.json({ stats: { leads_gerados, ganhos_aprovados, ganhos_pendentes }, recentes });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/afiliados - Create a new affiliate
router.post('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const { nome, email, nif, iban, codigo_referencia, percentagem_comissao, tipo_comissao, colaborador_id, senha } = req.body;
        
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: info, error } = await supabase.from('afiliados').insert({
            empresa_id,
            nome, email, nif: nif || null, iban: iban || null, 
            codigo_referencia, 
            percentagem_comissao: percentagem_comissao || 10.0, 
            tipo_comissao: tipo_comissao || 'Vitalicia', 
            colaborador_id: colaborador_id || null,
            senha: senha || '123456'
        }).select('id').single();

        if (error) {
            if (error.code === '23505') { // Postgres unique violation
                return res.status(400).json({ error: 'Email ou Código de Referência já existe.' });
            }
            throw error;
        }

        return res.json({ success: true, id: info.id });
    } catch (error: any) {
        return res.status(500).json({ error: 'Erro ao criar afiliado.' });
    }
});

// GET /api/afiliados/comissoes - List all commissions
router.get('/comissoes', requireAuth, async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        
        const { data: comissoesData, error } = await supabase.from('comissoes').select(`
            *,
            afiliados (nome, codigo_referencia, iban, colaborador_id),
            negocios (titulo),
            clientes (nome)
        `).order('criado_em', { ascending: false });
        
        if (error) throw error;

        const comissoes = (comissoesData || []).map((c: any) => ({
            ...c,
            afiliado_nome: c.afiliados?.nome,
            codigo_referencia: c.afiliados?.codigo_referencia,
            iban: c.afiliados?.iban,
            colaborador_id: c.afiliados?.colaborador_id,
            negocio_titulo: c.negocios?.titulo,
            cliente_nome: c.clientes?.nome
        }));
        
        return res.json({ success: true, comissoes });
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao listar comissões.' });
    }
});

// POST /api/afiliados/comissoes/:id/aprovar - Approve a commission
router.post('/comissoes/:id/aprovar', requireAuth, async (req: Request, res: Response) => {
    try {
        const comissaoId = req.params.id;
        const supabase = getSupabase(req);
        
        const { data, error } = await supabase.from('comissoes').update({ estado: 'Aprovada' }).eq('id', comissaoId).eq('estado', 'Pendente').select('id');
        
        if (error || !data || data.length === 0) {
            return res.status(400).json({ error: 'Comissão não encontrada ou já aprovada/paga.' });
        }
        
        return res.json({ success: true, message: 'Comissão aprovada com sucesso.' });
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao aprovar comissão.' });
    }
});

// POST /api/afiliados/comissoes/:id/pagar - Mark a commission as paid (manual)
router.post('/comissoes/:id/pagar', requireAuth, async (req: Request, res: Response) => {
    try {
        const comissaoId = req.params.id;
        const supabase = getSupabase(req);
        
        const { data, error } = await supabase.from('comissoes')
            .update({ estado: 'Paga', pago_em: new Date().toISOString() })
            .eq('id', comissaoId)
            .in('estado', ['Aprovada', 'Pendente'])
            .select('id');
        
        if (error || !data || data.length === 0) {
            return res.status(400).json({ error: 'Comissão não encontrada ou já paga.' });
        }
        
        return res.json({ success: true, message: 'Comissão marcada como Paga.' });
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao pagar comissão.' });
    }
});

export default router;
