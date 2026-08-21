import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { rotearEExecutar } from '../services/AIRouterService';
import crypto from 'crypto';

const router = Router();

// Helper: criar cliente Supabase autenticado com o token do utilizador (respeita RLS)
const makeUserClient = (accessToken: string) => createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    }
);

// Helper: cliente admin (usa service key se disponível, senão anon key)
const makeAdminClient = () => createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
);

// Helper: cliente efémero para operações de auth (NUNCA usar o singleton global)
const makeAuthClient = () => createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
);

// ─── Auth: Registo ────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
    const { email, password, nome, empresaNome, codigoConvite } = req.body;

    if (!email || !password || !nome) {
        return res.status(400).json({ error: 'Email, password e nome são obrigatórios.' });
    }

    // Se for funcionário, validar o código de convite ANTES de registar o utilizador
    // e guardar a empresa associada para a atribuirmos ao perfil logo a seguir ao signup.
    let empresaIdConvite: string | null = null;
    if (!empresaNome && codigoConvite) {
        // Usar a RPC criada na BD que faz a verificação sem precisar de Service Key
        const { data: inviteRows, error: rpcError } = await supabase.rpc('check_invite_code', { codigo: codigoConvite });
        const inviteRow = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;

        if (rpcError || !inviteRow?.valido || !inviteRow?.empresa_id) {
            console.error('[Register] Erro ao validar codigo de convite:', rpcError);
            return res.status(400).json({ error: 'Código de convite inválido ou empresa não encontrada.' });
        }
        empresaIdConvite = inviteRow.empresa_id;
    } else if (!empresaNome && !codigoConvite) {
        return res.status(400).json({ error: 'É obrigatório informar o nome da empresa ou o código de convite.' });
    }

    // Registo do utilizador no Auth (usa cliente efémero, não o singleton global)
    const authClient = makeAuthClient();
    const { data: authData, error: authError } = await authClient.auth.signUp({
        email,
        password,
        options: {
            data: { 
                nome, 
                role: empresaNome ? 'admin' : 'pending',
                empresaNome: empresaNome || null,
                codigoConvite: codigoConvite || null
            },
        },
    });

    if (authError || !authData.user) {
        return res.status(400).json({ error: authError?.message || 'Erro ao criar utilizador.' });
    }

    // Se for criação de empresa SaaS, criar a empresa e associar ao perfil imediatamente
    // Isto evita o ecrã branco após confirmação de email
    if (empresaNome) {
        try {
            const adminClient = makeAdminClient();
            const codigoConviteEmpresa = 'EMP-' + crypto.randomBytes(3).toString('hex').toUpperCase();

            // 1. Criar a empresa
            const { data: novaEmpresa, error: empErr } = await adminClient.from('empresas').insert({
                nome: empresaNome,
                status: 'pending',
                codigo_convite: codigoConviteEmpresa
            }).select('id').single();

            if (empErr) {
                console.error('[Register] Erro ao criar empresa:', empErr);
            } else if (novaEmpresa) {
                // 2. Associar perfil à empresa (o trigger handle_new_user já criou o perfil)
                // Aguardar um momento para o trigger executar
                await new Promise(resolve => setTimeout(resolve, 1000));
                await adminClient.from('perfis').update({
                    empresa_id: novaEmpresa.id,
                    role: 'admin'
                }).eq('id', authData.user.id);

                console.log(`[Register] Empresa '${empresaNome}' criada (ID: ${novaEmpresa.id}) e associada ao user ${authData.user.id}`);
            }
        } catch (e) {
            console.error('[Register] Erro ao criar empresa no registo:', e);
        }
    }

    // Se for funcionário via código de convite, associar imediatamente à empresa do convite.
    // Sem isto, o perfil ficava com empresa_id NULL e nunca aparecia na lista de aprovação do admin.
    if (empresaIdConvite) {
        try {
            const adminClient = makeAdminClient();
            // Aguardar um momento para o trigger handle_new_user criar o perfil primeiro
            await new Promise(resolve => setTimeout(resolve, 1000));
            const { error: linkErr } = await adminClient.from('perfis')
                .update({ empresa_id: empresaIdConvite })
                .eq('id', authData.user.id);

            if (linkErr) {
                console.error('[Register] Erro ao associar funcionário à empresa do convite:', linkErr);
            } else {
                console.log(`[Register] Funcionário ${authData.user.id} associado à empresa ${empresaIdConvite}`);
            }
        } catch (e) {
            console.error('[Register] Erro ao associar funcionário à empresa:', e);
        }
    }

    return res.json({
        success: true,
        message: empresaNome ? 'Empresa registada com sucesso. Aguarde aprovação do SuperAdmin.' : 'Utilizador registado. Aguarde aprovação do seu Admin.',
        user: { id: authData.user.id, email: authData.user.email },
    });
});

// ─── Auth: Login ─────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e password são obrigatórios.' });
    }

    // Usar cliente efémero para login (NUNCA o singleton global para evitar session contamination)
    const authClient = makeAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

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

    // Nenhum dos 3 métodos acima seleciona avatar_url (RPC tem colunas fixas, os outros
    // dois usam uma lista explícita de colunas) — buscamos à parte para não se perder a
    // cada login, sem arriscar mexer na função SECURITY DEFINER às cegas.
    try {
        const userClient = makeUserClient(data.session.access_token);
        const { data: avatarRow } = await userClient.from('perfis').select('avatar_url').eq('id', userId).maybeSingle();
        if (avatarRow) perfil.avatar_url = avatarRow.avatar_url;
    } catch (e) {}

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
    let modulos = ['hr', 'crm', 'reunioes', 'auto', 'wa', 'kb', 'email', 'data', 'chat', 'afiliados', 'contabilidade'];
    if (perfil?.empresa_id && data?.session?.access_token) {
        try {
            const userClient = makeUserClient(data.session.access_token);
            const { data: row } = await userClient.from('configuracoes')
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

    // Usar cliente efémero para refresh (não contaminar o singleton)
    const authClient = makeAuthClient();
    const { data, error } = await authClient.auth.refreshSession({ refresh_token });

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
// Nota: Em server-side, não há sessão para destruir no backend.
// O cliente frontend apaga os tokens do localStorage. O token JWT expira naturalmente.
router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
    // NÃO chamar supabase.auth.signOut() no singleton global — causa session contamination
    return res.json({ success: true, message: 'Sessão terminada.' });
});

// ─── Auth: Atualizar Password ───────────────────────────────────────────────
router.put('/update-password', requireAuth, async (req: AuthRequest, res: Response) => {
    const { password } = req.body;
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password inválida.' });
    }

    // Usar admin client para atualizar password (requer service key)
    const adminClient = makeAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(req.user!.id, { password });
    if (error) {
        return res.status(400).json({ error: error.message });
    }
    
    return res.json({ success: true });
});

// ─── Auth: Perfil do utilizador atual ────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const userClient = makeUserClient(token);
    
    const { data: perfil } = await userClient
        .from('perfis')
        .select('*')
        .eq('id', req.user!.id)
        .single();

    let modulos = ['hr', 'crm', 'reunioes', 'auto', 'wa', 'kb', 'email', 'data', 'chat', 'afiliados', 'contabilidade'];
    if (perfil?.empresa_id) {
        try {
            const { data: row } = await userClient.from('configuracoes')
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
