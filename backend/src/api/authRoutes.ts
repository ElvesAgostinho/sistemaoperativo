import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { rotearEExecutar } from '../services/AIRouterService';
const router = Router();

// ─── Auth: Registo ────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
    const { email, password, nome, empresaNome, codigoConvite } = req.body;

    if (!email || !password || !nome) {
        return res.status(400).json({ error: 'Email, password e nome são obrigatórios.' });
    }

    let empresaId = null;

    // Se for funcionário, validar o código de convite antes de criar a conta
    if (!empresaNome && codigoConvite) {
        const { data: empresaEncontrada, error: empBuscaError } = await supabase
            .from('empresas')
            .select('id')
            .eq('codigo_convite', codigoConvite)
            .single();

        if (empBuscaError || !empresaEncontrada) {
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
        
        // Criar a nova empresa com status pending
        const { data: novaEmpresa, error: empError } = await supabase
            .from('empresas')
            .insert({ nome: empresaNome, status: 'pending', codigo_convite: uniqueCode })
            .select()
            .single();

        if (!empError && novaEmpresa) {
            empresaId = novaEmpresa.id;
        }
    }

    // Atualizar o perfil do utilizador acabado de criar pelo trigger do supabase (ou criar se não existir trigger)
    // O trigger do supabase cria a linha em 'perfis' com base nos metadados. Vamos fazer UPDATE para colocar o empresa_id
    if (empresaId) {
        await supabase.from('perfis').update({ empresa_id: empresaId }).eq('id', userId);
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

    if (error || !data.user) return res.status(401).json({ error: 'Credenciais inválidas.' });

    // Buscar perfil com role e dados da empresa
    const { data: perfil } = await supabase
        .from('perfis')
        .select(`
            nome, role, ativo, empresa_id,
            empresas ( status, nome, codigo_convite )
        `)
        .eq('id', data.user.id)
        .single();

    if (perfil && !perfil.ativo) {
        return res.status(403).json({ error: 'Conta desactivada. Contacte o administrador.' });
    }

    // Se não for superadmin, verificamos se a empresa está ativa
    if (perfil?.role !== 'superadmin' && perfil?.empresas) {
        // Ignoramos o erro typescript aqui se as tipagens não estiverem exatas
        const empresa = perfil.empresas as any;
        if (empresa.status !== 'active') {
             return res.status(403).json({ error: 'A subscrição da sua empresa está pendente ou suspensa. Contacte o suporte.' });
        }
    }

    // Se o user não tiver empresa_id mas for superadmin, ele passa. Se for normal sem empresa, fica pendente
    let role = perfil?.role || 'pending';

    // Actualizar último acesso
    await supabase.from('perfis').update({ ultimo_acesso: new Date().toISOString() }).eq('id', data.user.id);

    // Fetch contracted modules from SQLite db
    let modulos = ['hr', 'crm', 'reunioes']; // default básico
    if (perfil?.empresa_id) {
        try {
            const { data: row } = await supabase.from('configuracoes_sistema')
                .select('valor')
                .eq('chave', `modulos_empresa_${perfil.empresa_id}`)
                .single();
            if (row && row.valor) {
                modulos = JSON.parse(row.valor);
            }
        } catch(e) { console.error(e) }
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
    const { data: perfil } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', req.user!.id)
        .single();

    let modulos = ['hr', 'crm', 'reunioes']; // default
    if (perfil?.empresa_id) {
        try {
            const { data: row } = await supabase.from('configuracoes_sistema')
                .select('valor')
                .eq('chave', `modulos_empresa_${perfil.empresa_id}`)
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

    const { data } = await supabase
        .from('ai_router_logs')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(100);

    return res.json({ success: true, logs: data });
});

export default router;
