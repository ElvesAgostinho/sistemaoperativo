import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { rotearEExecutar } from '../services/AIRouterService';

const router = Router();

// Helper: criar cliente Supabase autenticado com o token do utilizador (respeita RLS)
const makeUserClient = (accessToken: string) => createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_KEY || '',
    {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    }
);

// Helper: cliente admin (usa service key se disponível, senão anon key)
const makeAdminClient = () => createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
);

// ─── Auth: Registo ────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
    const { email, password, nome, empresaNome, codigoConvite } = req.body;

    if (!email || !password || !nome) {
        return res.status(400).json({ error: 'Email, password e nome são obrigatórios.' });
    }

    let empresaId = null;

    // Se for funcionário, validar o código de convite antes de criar a conta
    if (!empresaNome && codigoConvite) {
        const adminClient = makeAdminClient();
        const { data: empresaEncontrada, error: empBuscaError } = await adminClient
            .from('empresas')
            .select('id')
            .eq('codigo_convite', codigoConvite)
            .single();

        if (empBuscaError || !empresaEncontrada) {
            console.error('[Register] Erro ao buscar codigo de convite:', empBuscaError);
            return res.status(400).json({ error: 'Código de convite inválido ou empresa não encontrada.' });
        }
        empresaId = empresaEncontrada.id;
    } else if (!empresaNome && !codigoConvite) {
        return res.status(400).json({ error: 'É obrigatório informar o nome da empresa ou o código de convite.' });
    }

    // Registo do utilizador no Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { nome, role: empresaNome ? 'admin' : 'pending' }, // admin se for nova empresa, pending se for funcionário
        },
    });

    if (authError || !authData.user) {
        return res.status(400).json({ error: authError?.message || 'Erro ao criar utilizador.' });
    }

    const userId = authData.user.id;

    if (empresaNome) {
        // Gerar código de convite único
        const uniqueCode = 'EMP-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // Criar a nova empresa com status pending (Usar adminClient para ultrapassar RLS)
        const adminClient = makeAdminClient();
        const { data: novaEmpresa, error: empError } = await adminClient
            .from('empresas')
            .insert({ nome: empresaNome, status: 'pending', codigo_convite: uniqueCode })
            .select()
            .single();

        if (empError) {
            console.error('[Register] Erro ao criar empresa:', empError);
        }

        if (!empError && novaEmpresa) {
            empresaId = novaEmpresa.id;
        }
    }

    // Atualizar o perfil do utilizador acabado de criar pelo trigger do supabase (ou criar se não existir trigger)
    // O trigger do supabase cria a linha em 'perfis' com base nos metadados. Vamos fazer UPDATE para colocar o empresa_id
    if (empresaId) {
        const adminClient = makeAdminClient();
        await adminClient.from('perfis').update({ empresa_id: empresaId }).eq('id', userId);
    }

    return res.json({
        success: true,
        message: empresaNome ? 'Empresa registada com sucesso. Aguarde aprovação do SuperAdmin.' : 'Utilizador registado. Aguarde aprovação do seu Admin.',
        user: { id: userId, email: authData.user.email },
    });
});

// ─── Auth: Login ─────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e password são obrigatórios.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
            return res.status(403).json({ error: 'Por favor, confirme a sua conta através do link enviado para o seu email.' });
        }
        return res.status(401).json({ error: 'Credenciais inválidas ou conta não encontrada.' });
    }

    if (!data.user || !data.session) {
        return res.status(401).json({ error: 'Falha na autenticação.' });
    }

    const userId = data.user.id;
    const accessToken = data.session.access_token;
    let perfil: any = null;

    // 1ª tentativa: função SECURITY DEFINER (bypassa RLS sem precisar de service_role key)
    try {
        const { data: fnResult, error: fnError } = await supabase
            .rpc('get_perfil_by_id', { user_id: userId });

        if (!fnError && fnResult && fnResult.length > 0) {
            const row = fnResult[0];
            perfil = {
                nome: row.nome,
                role: row.role,
                ativo: row.ativo,
                empresa_id: row.empresa_id,
                empresas: row.empresa_nome ? {
                    status: row.empresa_status,
                    nome: row.empresa_nome,
                    codigo_convite: row.codigo_convite,
                } : null,
            };
            console.log(`[Login] rpc ok: user=${email}, role=${perfil.role}`);
        } else {
            console.warn(`[Login] rpc falhou: ${JSON.stringify(fnError)}`);
        }
    } catch (rpcEx) {
        console.error('[Login] rpc exception:', rpcEx);
    }

    // 2ª tentativa: userClient com token (respeita RLS via auth.uid())
    if (!perfil) {
        const userClient = makeUserClient(accessToken);
        const { data: perfilDirect, error: perfilError } = await userClient
            .from('perfis')
            .select(`nome, role, ativo, empresa_id, empresas ( status, nome, codigo_convite )`)
            .eq('id', userId)
            .single();

        if (perfilDirect) {
            perfil = perfilDirect;
            console.log(`[Login] userClient ok: user=${email}, role=${perfil.role}`);
        } else {
            console.error(`[Login] userClient falhou: ${JSON.stringify(perfilError)}`);
        }
    }

    // 3ª tentativa: admin client com service_role key
    if (!perfil && process.env.SUPABASE_SERVICE_KEY) {
        const adminClient = makeAdminClient();
        const { data: perfilAdmin } = await adminClient
            .from('perfis')
            .select(`nome, role, ativo, empresa_id, empresas ( status, nome, codigo_convite )`)
            .eq('id', userId)
            .single();
        if (perfilAdmin) {
            perfil = perfilAdmin;
            console.log(`[Login] adminClient ok: user=${email}, role=${perfil.role}`);
        }
    }

    if (!perfil) {
        return res.status(403).json({ error: 'Perfil de utilizador não encontrado. Verifique se confirmou o seu email.' });
    }

    if (!perfil.ativo) {
        return res.status(403).json({ error: 'Conta desactivada. Contacte o administrador.' });
    }

    return processLogin(res, data, perfil, email);
});

async function processLogin(res: any, data: any, perfil: any, email: string) {
    const role = perfil?.role || 'pending';

    // Bloquear contas pendentes (não superadmin)
    if (role === 'pending') {
        return res.status(403).json({ error: 'A sua conta está a aguardar aprovação pelo administrador.' });
    }

    // Se não for superadmin, verificamos se a empresa está ativa
    if (role !== 'superadmin') {
        if (!perfil?.empresas) {
            return res.status(403).json({ error: 'Nenhuma empresa associada. Contacte o suporte.' });
        }
        const empresa = perfil.empresas as any;
        if (empresa.status !== 'active') {
            return res.status(403).json({ error: 'A subscrição da sua empresa está pendente ou suspensa. Contacte o suporte.' });
        }
    }

    // Fetch contracted modules
    let modulos = ['hr', 'crm', 'reunioes', 'auto', 'wa', 'kb', 'email', 'data', 'chat', 'pc', 'afiliados', 'contabilidade'];
    if (perfil?.empresa_id) {
        try {
            const adminClient = makeAdminClient();
            const { data: row } = await adminClient.from('configuracoes')
                .select('valor')
                .eq('empresa_id', perfil.empresa_id)
                .eq('chave', 'modulos_empresa')
                .single();
            if (row && row.valor) {
                modulos = JSON.parse(row.valor);
            }
        } catch(e) { console.error('[Login] Erro ao buscar módulos:', e); }
    }

    return res.json({
        success: true,
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        user: {
            id: data.user.id,
            email: data.user.email,
            nome: perfil?.nome || email.split('@')[0],
            role: role,
            empresa_id: perfil?.empresa_id || null,
            empresa_nome: perfil?.empresas ? (perfil.empresas as any).nome : null,
            codigo_convite: perfil?.empresas ? (perfil.empresas as any).codigo_convite : null,
            modulos_contratados: modulos,
        },
    });
}

// ─── Auth: Refresh Token ──────────────────────────────────────────────────────
router.post('/refresh', async (req: Request, res: Response) => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token é obrigatório.' });
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error || !data.session) {
        return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
    }

    return res.json({
        success: true,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
    });
});

// ─── Auth: Logout ─────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
    await supabase.auth.signOut();
    return res.json({ success: true, message: 'Sessão terminada.' });
});

// ─── Auth: Atualizar Password ───────────────────────────────────────────────
router.put('/update-password', requireAuth, async (req: AuthRequest, res: Response) => {
    const { password } = req.body;
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password inválida.' });
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
        return res.status(400).json({ error: error.message });
    }
    
    return res.json({ success: true });
});

// ─── Auth: Perfil do utilizador atual ────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
    const adminClient = makeAdminClient();
    const { data: perfil } = await adminClient
        .from('perfis')
        .select('*')
        .eq('id', req.user!.id)
        .single();

    let modulos = ['hr', 'crm', 'reunioes', 'auto', 'wa', 'kb', 'email', 'data', 'chat', 'pc', 'afiliados', 'contabilidade'];
    if (perfil?.empresa_id) {
        try {
            const adminClient = makeAdminClient();
            const { data: row } = await adminClient.from('configuracoes')
                .select('valor')
                .eq('empresa_id', perfil.empresa_id)
                .eq('chave', 'modulos_empresa')
                .single();
            if (row && row.valor) {
                modulos = JSON.parse(row.valor);
            }
        } catch(e) {}
    }

    return res.json({ success: true, user: { ...req.user, ...perfil, modulos_contratados: modulos } });
});

// ─── AI Router: Chat Inteligente HR ──────────────────────────────────────────
router.post('/ai/chat', requireAuth, async (req: AuthRequest, res: Response) => {
    const { mensagem, taskType } = req.body;

    if (!mensagem) return res.status(400).json({ error: 'Mensagem é obrigatória.' });

    const task = taskType || 'chat_hr';
    const resultado = await rotearEExecutar(task, mensagem, mensagem, req.user?.id);

    return res.json({
        success: true,
        resposta: resultado.texto,
        meta: {
            ai_usado: resultado.ai_usado,
            motivo: resultado.motivo_roteamento,
            duracao_ms: resultado.duracao_ms,
        },
    });
});

// ─── AI Router: Gerar Contrato ────────────────────────────────────────────────
router.post('/ai/contrato', requireAuth, async (req: AuthRequest, res: Response) => {
    const { nome, cargo, salario, tipo_contrato, data_inicio, data_fim } = req.body;

    // Dados com salário → sensível, mas o prompt não inclui BI/NIF, então podemos usar OpenAI
    const prompt = `Gera um contrato de trabalho angolano profissional para:
- Nome: ${nome}
- Cargo: ${cargo}  
- Salário Base: ${salario} AOA
- Tipo de Contrato: ${tipo_contrato}
- Data de Início: ${data_inicio}
${data_fim ? `- Data de Fim: ${data_fim}` : ''}

Baseia-te na Lei Geral do Trabalho de Angola (Lei n.º 7/15). Inclui cláusulas de: duração, remuneração, horário, férias, rescisão e confidencialidade.`;

    // Contrato é complexo → OpenAI. Mas o contexto inclui "salario" → detecta como sensível!
    // Usamos task_type 'contract_generation' que não é forced_local
    const resultado = await rotearEExecutar('contract_generation', prompt, '', req.user?.id);

    return res.json({
        success: true,
        contrato: resultado.texto,
        meta: { ai_usado: resultado.ai_usado, motivo: resultado.motivo_roteamento },
    });
});

// ─── AI Router: Análise de Desempenho ─────────────────────────────────────────
router.post('/ai/desempenho', requireAuth, async (req: AuthRequest, res: Response) => {
    const { nome, avaliacoes, periodo } = req.body;

    const prompt = `Analisa o desempenho do colaborador ${nome} com base nas seguintes avaliações do período ${periodo}:
${JSON.stringify(avaliacoes, null, 2)}

Fornece:
1. Resumo executivo do desempenho
2. Pontos fortes identificados
3. Áreas de melhoria prioritárias
4. Recomendação: Promoção / Manutenção / Formação / Saída
5. Plano de acção para os próximos 3 meses`;

    const resultado = await rotearEExecutar('performance_insight', prompt, nome, req.user?.id);

    return res.json({
        success: true,
        analise: resultado.texto,
        meta: { ai_usado: resultado.ai_usado, motivo: resultado.motivo_roteamento },
    });
});

// ─── AI Router: Logs (apenas admin/hr_manager) ────────────────────────────────
router.get('/ai/logs', requireAuth, async (req: AuthRequest, res: Response) => {
    if (!['admin', 'hr_manager'].includes(req.user!.role)) {
        return res.status(403).json({ error: 'Acesso negado.' });
    }

    const adminClient = makeAdminClient();
    const { data } = await adminClient
        .from('ai_router_logs')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(100);

    return res.json({ success: true, logs: data });
});

export default router;
