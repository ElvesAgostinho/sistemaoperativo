import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import { supabase, getSupabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { exigirDono } from '../middleware/permissaoMiddleware';
import { PermissaoService } from '../services/PermissaoService';
import { AuditoriaService } from '../services/AuditoriaService';
import { LicencaService } from '../services/LicencaService';

const router = Router();
const upload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('O ficheiro tem de ser uma imagem.'));
        cb(null, true);
    }
});

// Atualizar a foto de perfil do próprio utilizador autenticado.
// Sobe para o Supabase Storage (bucket público, já usado para média do
// WhatsApp) em vez de ficar no disco local do backend — o disco local não
// sobrevive a um redeploy/restart do container, o que fazia a foto
// "desaparecer" sempre que o servidor reiniciava, mesmo com a base de
// dados a apontar corretamente para o ficheiro.
router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem recebida.' });
        if (!req.user?.id) return res.status(401).json({ error: 'Não autenticado.' });

        const buffer = fs.readFileSync(req.file.path);
        const ext = (req.file.originalname.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.jpg').toLowerCase();
        const storagePath = `avatars/${req.user.id}_${Date.now()}${ext}`;

        const { error: uploadError } = await supabase.storage
            .from('whatsapp-media')
            .upload(storagePath, buffer, { contentType: req.file.mimetype, upsert: false });

        fs.unlink(req.file.path, () => {});

        if (uploadError) return res.status(500).json({ error: 'Falha ao guardar a imagem: ' + uploadError.message });

        const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(storagePath);
        const avatarUrl = urlData?.publicUrl;
        if (!avatarUrl) return res.status(500).json({ error: 'Não foi possível gerar o link da imagem.' });

        const { error } = await getSupabase(req).from('perfis').update({ avatar_url: avatarUrl }).eq('id', req.user.id);
        if (error) return res.status(500).json({ error: error.message });

        return res.json({ success: true, avatar_url: avatarUrl });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Middleware para verificar se é admin ou superadmin
const requireAdmin = (req: AuthRequest, res: Response, next: Function) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acesso negado. Requer privilégios de administrador.' });
    }
    next();
};

// Verifica se a empresa já atingiu o limite de utilizadores contratado (plano).
// Um "lugar" só é ocupado por utilizadores ativos com role diferente de 'pending' —
// contas pendentes não contam, para não bloquear novos registos antes da aprovação.
async function limiteDeUtilizadoresAtingido(empresaId: string): Promise<{ atingido: boolean; limite: number; usados: number }> {
    const { data: empresa } = await supabase.from('empresas').select('limite_usuarios').eq('id', empresaId).single();
    const limite = empresa?.limite_usuarios;
    if (limite === null || limite === undefined) return { atingido: false, limite: -1, usados: 0 };

    const { count } = await supabase
        .from('perfis')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .neq('role', 'pending');

    const usados = count || 0;
    return { atingido: usados >= limite, limite, usados };
}

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

    // Cada linha leva consigo o que aquela pessoa abre mesmo, para o ecra nao
    // ter de voltar a calcular (e calcular de outra maneira, que era o que
    // acontecia antes: o servidor dizia uma coisa e o ecra mostrava outra).
    const users = await Promise.all((data || []).map(async (u: any) => {
        const p = await PermissaoService.efectivas(u.id);
        return {
            ...u,
            permissoes_efectivas: { modulos: p.modulos, accoes: p.accoes },
            permissoes_proprias: p.proprias,   // false = ainda esta no que o papel da
        };
    }));

    return res.json({ success: true, users });
});

/**
 * O catalogo: que modulos a empresa licenciou e que accoes existem para dar.
 * O ecra desenha as caixas a partir daqui, para nao haver uma lista no
 * servidor e outra no navegador a divergirem com o tempo.
 */
router.get('/permissoes/catalogo', requireAuth, exigirDono, async (req: AuthRequest, res: Response) => {
    try {
        const modulos = await LicencaService.modulosDaEmpresa(req.user!.empresa_id);
        res.json({
            success: true,
            modulos: modulos.filter(m => !PermissaoService.MODULOS_SEMPRE.includes(m)),
            accoes: PermissaoService.ACCOES,
            papeis: ['pending', 'agente', 'sales_manager', 'hr_manager', 'admin'].map(papel => ({
                papel, omissao: PermissaoService.omissaoDoPapel(papel)
            })),
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/** O que esta pessoa pode, e o que o papel dela daria por omissao. */
router.get('/:id/permissoes', requireAuth, exigirDono, async (req: AuthRequest, res: Response) => {
    const { data: alvo } = await supabase.from('perfis').select('empresa_id, role').eq('id', req.params.id).maybeSingle();
    if (!alvo || alvo.empresa_id !== req.user?.empresa_id) {
        return res.status(403).json({ error: 'Este utilizador nao e da sua empresa.' });
    }
    const p = await PermissaoService.efectivas(req.params.id);
    res.json({
        success: true,
        papel: p.papel,
        modulos: p.modulos.filter(m => !PermissaoService.MODULOS_SEMPRE.includes(m)),
        accoes: p.accoes,
        proprias: p.proprias,
        omissaoDoPapel: PermissaoService.omissaoDoPapel(p.papel),
    });
});

/** O dono afina as permissoes de um funcionario. */
router.put('/:id/permissoes', requireAuth, exigirDono, async (req: AuthRequest, res: Response) => {
    const { modulos, accoes, repor } = req.body || {};

    const { data: alvo } = await supabase.from('perfis').select('empresa_id, role, nome').eq('id', req.params.id).maybeSingle();
    if (!alvo || alvo.empresa_id !== req.user?.empresa_id) {
        return res.status(403).json({ error: 'Este utilizador nao e da sua empresa.' });
    }

    // Ninguem se tira a si proprio o direito de gerir a equipa: ficaria uma
    // empresa sem ninguem que pudesse voltar atras.
    if (req.params.id === req.user?.id) {
        return res.status(400).json({ error: 'Nao pode alterar as suas proprias permissoes.' });
    }
    if (alvo.role === 'admin' && !PermissaoService.mandaEmTudo(req.user?.role || '')) {
        return res.status(403).json({ error: 'Nao pode alterar as permissoes de outro administrador.' });
    }

    try {
        if (repor) {
            await PermissaoService.repor(req.params.id);
            await AuditoriaService.registar({
                empresaId: req.user!.empresa_id, quemId: req.user!.id,
                accao: 'permissoes_alteradas', alvoUtilizador: req.params.id,
                alvoTipo: 'utilizador', alvoId: req.params.id,
                detalhes: `repos as permissoes de ${alvo.nome || 'um colega'} para as normais do perfil.`,
            });
            const p = await PermissaoService.efectivas(req.params.id);
            return res.json({ success: true, modulos: p.modulos, accoes: p.accoes, proprias: false });
        }

        if (!Array.isArray(modulos) || !Array.isArray(accoes)) {
            return res.status(400).json({ error: 'Faltam as listas de modulos e accoes.' });
        }

        const antes = await PermissaoService.efectivas(req.params.id);
        const guardado = await PermissaoService.guardar(req.params.id, modulos, accoes);
        const depois = await PermissaoService.efectivas(req.params.id);

        const saiu = (a: string[], b: string[]) => a.filter(x => !b.includes(x));
        const ganhou = [...saiu(depois.modulos, antes.modulos), ...saiu(depois.accoes, antes.accoes)];
        const perdeu = [...saiu(antes.modulos, depois.modulos), ...saiu(antes.accoes, depois.accoes)];

        await AuditoriaService.registar({
            empresaId: req.user!.empresa_id, quemId: req.user!.id,
            accao: 'permissoes_alteradas', alvoUtilizador: req.params.id,
            alvoTipo: 'utilizador', alvoId: req.params.id,
            detalhes: `alterou as permissoes de ${alvo.nome || 'um colega'}.`
                + (ganhou.length ? ` Ganhou: ${ganhou.join(', ')}.` : '')
                + (perdeu.length ? ` Perdeu: ${perdeu.join(', ')}.` : ''),
            extra: { ganhou, perdeu, guardado },
        });

        return res.json({ success: true, modulos: depois.modulos, accoes: depois.accoes, proprias: true });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

// Alterar o role de um utilizador (apenas da mesma empresa)
router.put('/:id/role', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) return res.status(400).json({ error: 'O role é obrigatório.' });

    // Primeiro verificar se o utilizador pertence à mesma empresa
    const { data: userToUpdate } = await supabase.from('perfis').select('empresa_id, role').eq('id', id).single();
    if (!userToUpdate || userToUpdate.empresa_id !== req.user?.empresa_id) {
        return res.status(403).json({ error: 'Não autorizado a alterar este utilizador.' });
    }

    // Só verificamos o limite ao APROVAR alguém (sair de 'pending'), que é o
    // momento em que a empresa passa a ocupar mais um lugar do seu plano.
    if (userToUpdate.role === 'pending' && role !== 'pending') {
        const { atingido, limite, usados } = await limiteDeUtilizadoresAtingido(userToUpdate.empresa_id);
        if (atingido) {
            return res.status(403).json({ error: `Limite de utilizadores do plano atingido (${usados}/${limite}). Contacte o suporte para aumentar o número de lugares.` });
        }
    }

    const { error } = await supabase
        .from('perfis')
        .update({ role })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    await AuditoriaService.registar({
        empresaId: req.user!.empresa_id, quemId: req.user!.id,
        accao: 'papel_alterado', alvoUtilizador: id, alvoTipo: 'utilizador', alvoId: id,
        detalhes: `mudou o perfil de acesso de "${userToUpdate.role}" para "${role}".`,
        extra: { de: userToUpdate.role, para: role },
    });

    return res.json({ success: true, message: 'Função atualizada com sucesso.' });
});

// Alterar estado (ativo/inativo) de um utilizador
router.put('/:id/status', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { ativo } = req.body;

    if (ativo === undefined) return res.status(400).json({ error: 'O estado ativo é obrigatório.' });

    // Verificar empresa
    const { data: userToUpdate } = await supabase.from('perfis').select('empresa_id, role, ativo').eq('id', id).single();
    if (!userToUpdate || userToUpdate.empresa_id !== req.user?.empresa_id) {
        return res.status(403).json({ error: 'Não autorizado a alterar este utilizador.' });
    }

    // Reativar alguém que estava desativado volta a ocupar um lugar do plano
    // (contas pendentes não contam, por isso não são bloqueadas aqui).
    if (ativo === true && userToUpdate.ativo === false && userToUpdate.role !== 'pending') {
        const { atingido, limite, usados } = await limiteDeUtilizadoresAtingido(userToUpdate.empresa_id);
        if (atingido) {
            return res.status(403).json({ error: `Limite de utilizadores do plano atingido (${usados}/${limite}). Contacte o suporte para aumentar o número de lugares.` });
        }
    }

    const { error } = await supabase
        .from('perfis')
        .update({ ativo })
        .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    await AuditoriaService.registar({
        empresaId: req.user!.empresa_id, quemId: req.user!.id,
        accao: ativo ? 'utilizador_ativado' : 'utilizador_desativado',
        alvoUtilizador: id, alvoTipo: 'utilizador', alvoId: id,
        detalhes: ativo ? 'reativou o acesso de um colega.' : 'desativou o acesso de um colega.',
    });

    return res.json({ success: true, message: 'Estado atualizado com sucesso.' });
});

export default router;
