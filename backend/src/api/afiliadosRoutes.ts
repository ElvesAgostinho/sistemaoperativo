import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getSupabase } from '../lib/supabaseClient';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

interface AfiliadoRequest extends Request {
    afiliado?: { id: number; empresa_id: number | null };
}

// Autenticação do Portal do Afiliado (token próprio, assinado com JWT_SECRET,
// separado da autenticação dos utilizadores da plataforma via Supabase Auth).
const requireAfiliadoAuth = (req: AfiliadoRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || '');
        if (decoded.tipo !== 'afiliado') throw new Error('Token inválido.');
        req.afiliado = { id: decoded.afiliadoId, empresa_id: decoded.empresaId || null };
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
};

// GET /api/afiliados - List all affiliates with stats
router.get('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        // Utilizando junções ou subqueries em Supabase. No Supabase, o ideal é RPC ou buscar as relações.
        // Para simplificar, buscamos afiliados e depois as relações, ou se houver view.
        const { data: afiliados, error } = await supabase.from('afiliados').select('*, clientes(id), comissoes(valor_comissao, estado)').eq('empresa_id', empresa_id).order('criado_em', { ascending: false });
        
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
        if (!email || !senha) return res.status(400).json({ error: 'Email e senha são obrigatórios.' });

        // Rota pública (sem req.user ainda) — precisa do cliente admin para ler o afiliado pelo email.
        const { supabase: supabaseAdmin } = require('../lib/supabaseClient');
        const { data: afiliado, error } = await supabaseAdmin.from('afiliados')
            .select('id, nome, email, codigo_referencia, senha, empresa_id')
            .eq('email', email).single();

        if (error || !afiliado) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const senhaGuardada: string = afiliado.senha || '';
        const isHash = senhaGuardada.startsWith('$2');
        const senhaValida = isHash ? await bcrypt.compare(senha, senhaGuardada) : senha === senhaGuardada;

        if (!senhaValida) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        // Migração transparente: se a senha ainda estava em texto simples, cifra-a agora.
        if (!isHash) {
            const novoHash = await bcrypt.hash(senha, 10);
            await supabaseAdmin.from('afiliados').update({ senha: novoHash }).eq('id', afiliado.id);
        }

        const token = jwt.sign(
            { afiliadoId: afiliado.id, empresaId: afiliado.empresa_id, tipo: 'afiliado' },
            process.env.JWT_SECRET || '',
            { expiresIn: '30d' }
        );

        res.json({
            token,
            afiliado: { id: afiliado.id, nome: afiliado.nome, email: afiliado.email, codigo_referencia: afiliado.codigo_referencia }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// MATERIAIS DE MARKETING — vista interna (equipa da empresa, dentro do sistema)
router.get('/materiais', requireAuth, async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: materiais, error } = await supabase.from('materiais_marketing')
            .select('*').order('criado_em', { ascending: false });
        if (error) throw error;
        res.json({ materiais });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// MATERIAIS DE MARKETING — Portal do Afiliado (externo, só os da própria empresa)
router.get('/portal/materiais', requireAfiliadoAuth, async (req: AfiliadoRequest, res: Response) => {
    try {
        const { supabase: supabaseAdmin } = require('../lib/supabaseClient');
        const { data: materiais, error } = await supabaseAdmin.from('materiais_marketing')
            .select('*').eq('empresa_id', req.afiliado!.empresa_id).order('criado_em', { ascending: false });
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
        const empresa_id = (req as any).user?.empresa_id;
        const { error } = await supabase.from('materiais_marketing').delete().eq('id', req.params.id).eq('empresa_id', empresa_id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PORTAL DO AFILIADO: Obter estatísticas do Afiliado logado (identidade vem do token, nunca do URL)
router.get('/:id/portal-stats', requireAfiliadoAuth, async (req: AfiliadoRequest, res: Response) => {
    try {
        const afiliadoId = req.afiliado!.id;
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
        const senhaHash = await bcrypt.hash(senha || '123456', 10);

        const { data: info, error } = await supabase.from('afiliados').insert({
            empresa_id,
            nome, email, nif: nif || null, iban: iban || null,
            codigo_referencia,
            percentagem_comissao: percentagem_comissao || 10.0,
            tipo_comissao: tipo_comissao || 'Vitalicia',
            colaborador_id: colaborador_id || null,
            senha: senhaHash
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
        const empresa_id = (req as any).user?.empresa_id;

        const { data: comissoesData, error } = await supabase.from('comissoes').select(`
            *,
            afiliados!inner (nome, codigo_referencia, iban, colaborador_id, empresa_id),
            negocios (titulo),
            clientes (nome)
        `).eq('afiliados.empresa_id', empresa_id).order('criado_em', { ascending: false });
        
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

// Confirma que a comissão pertence a um afiliado da empresa do utilizador autenticado
// antes de qualquer alteração — evita que um admin da Empresa A aprove/pague comissões da Empresa B.
async function comissaoPertenceAEmpresa(supabase: any, comissaoId: string, empresa_id: any): Promise<boolean> {
    const { data } = await supabase.from('comissoes')
        .select('id, afiliados!inner(empresa_id)')
        .eq('id', comissaoId)
        .eq('afiliados.empresa_id', empresa_id)
        .maybeSingle();
    return !!data;
}

// POST /api/afiliados/comissoes/:id/aprovar - Approve a commission
router.post('/comissoes/:id/aprovar', requireAuth, async (req: Request, res: Response) => {
    try {
        const comissaoId = req.params.id;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        if (!(await comissaoPertenceAEmpresa(supabase, comissaoId, empresa_id))) {
            return res.status(404).json({ error: 'Comissão não encontrada.' });
        }

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
        const empresa_id = (req as any).user?.empresa_id;

        if (!(await comissaoPertenceAEmpresa(supabase, comissaoId, empresa_id))) {
            return res.status(404).json({ error: 'Comissão não encontrada.' });
        }

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
