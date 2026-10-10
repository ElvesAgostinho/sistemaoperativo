import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { PermissaoService } from '../services/PermissaoService';

/**
 * Guardas de permissão para as rotas.
 *
 * Até agora o controlo de acessos vivia todo no ecrã: o App.tsx escondia o
 * botão do RH a um agente e dava-se o assunto por resolvido. Mas esconder um
 * botão não fecha a porta — bastava chamar o endereço directamente. Para um
 * sistema que se vende a empresas, isso não chega.
 *
 * Estes guardas correm no servidor, onde o cliente não manda.
 */

/** Exige uma acção concreta (ex: 'wa.auditoria'). */
export const exigirPermissao = (accao: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user?.id) return res.status(401).json({ error: 'Não autenticado.' });

        try {
            const p = await PermissaoService.efectivas(req.user.id);
            if (!p.accoes.includes(accao)) {
                const detalhe = PermissaoService.ACCOES.find(a => a.chave === accao);
                return res.status(403).json({
                    success: false,
                    error: detalhe
                        ? `Não tem permissão para ${detalhe.nome.toLowerCase()}. Peça ao administrador da empresa.`
                        : 'Não tem permissão para esta operação.',
                    permissao: accao,
                });
            }
            next();
        } catch (e: any) {
            // Na dúvida, não deixa passar.
            console.error('[Permissoes] Erro a verificar:', e?.message || e);
            return res.status(500).json({ error: 'Não foi possível verificar as suas permissões.' });
        }
    };
};

/** Exige que a pessoa abra este módulo (ex: 'hr'). Cobre também a licença da empresa. */
export const exigirModulo = (modulo: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user?.id) return res.status(401).json({ error: 'Não autenticado.' });

        try {
            const p = await PermissaoService.efectivas(req.user.id);
            if (!p.modulos.includes(modulo)) {
                return res.status(403).json({
                    success: false,
                    error: 'Não tem acesso a este módulo. Peça ao administrador da empresa.',
                    modulo,
                });
            }
            next();
        } catch (e: any) {
            console.error('[Permissoes] Erro a verificar o módulo:', e?.message || e);
            return res.status(500).json({ error: 'Não foi possível verificar as suas permissões.' });
        }
    };
};

/**
 * Exige que seja o dono da empresa (ou o superadmin). Para o que não se
 * delega: mexer nas permissões dos outros.
 */
export const exigirDono = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Não autenticado.' });

    try {
        const p = await PermissaoService.efectivas(req.user.id);
        if (!PermissaoService.mandaEmTudo(p.papel) && !p.accoes.includes('equipa.gerir')) {
            return res.status(403).json({
                success: false,
                error: 'Só o administrador da empresa pode fazer isto.',
            });
        }
        next();
    } catch (e: any) {
        console.error('[Permissoes] Erro a verificar o dono:', e?.message || e);
        return res.status(500).json({ error: 'Não foi possível verificar as suas permissões.' });
    }
};
