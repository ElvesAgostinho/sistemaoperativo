import { Request, Response, NextFunction } from 'express';
import { supabase, getSupabase } from '../lib/supabaseClient';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
        empresa_id: string | null;
    };
}

/**
 * Middleware de autenticação via Supabase JWT.
 * Lê o header Authorization: Bearer <token>
 * Valida com Supabase e injeta req.user
 */
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autenticado. Faça login primeiro.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        // Buscar role do perfil com o token do user
        const { data: perfil } = await supabase
            .from('perfis')
            .select('role, empresa_id')
            .eq('id', data.user.id)
            .single();

        req.user = {
            id: data.user.id,
            email: data.user.email || '',
            role: perfil?.role || 'pending',
            empresa_id: perfil?.empresa_id || null,
        };

        next();
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao validar autenticação.' });
    }
};

/**
 * Middleware de role guard
 */
export const requireRole = (...roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: `Acesso negado. Requer: ${roles.join(' ou ')}` });
        }
        next();
    };
};
