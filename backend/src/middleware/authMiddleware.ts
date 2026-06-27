import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
        empresa_id: string | null;
    };
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';

/**
 * Cliente administrativo - usa service_role key se disponível para
 * contornar o RLS e fazer leituras privilegiadas de perfis.
 * Se não houver SUPABASE_SERVICE_KEY, usa o token do utilizador.
 */
const getAdminClient = () => {
    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        }
    });
};

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
        // Validar o token com o cliente admin
        const adminClient = getAdminClient();
        const { data, error } = await adminClient.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        const userId = data.user.id;

        // Buscar role do perfil usando cliente autenticado com o token do próprio utilizador
        // Isto garante que o RLS permite a leitura do próprio perfil
        const userClient = createClient(supabaseUrl, supabaseKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            },
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            }
        });

        const { data: perfil, error: perfilError } = await userClient
            .from('perfis')
            .select('role, empresa_id')
            .eq('id', userId)
            .single();

        // Se o perfil não existir ou RLS bloquear, tentamos via admin client
        let role = 'pending';
        let empresa_id = null;

        if (!perfilError && perfil) {
            role = perfil.role || 'pending';
            empresa_id = perfil.empresa_id || null;
        } else {
            // Fallback: tentar com admin client (service_role bypassa RLS)
            const { data: perfilAdmin } = await adminClient
                .from('perfis')
                .select('role, empresa_id')
                .eq('id', userId)
                .single();

            if (perfilAdmin) {
                role = perfilAdmin.role || 'pending';
                empresa_id = perfilAdmin.empresa_id || null;
            } else {
                // Último fallback: ler dos user_metadata do token (definido no registo)
                const meta = data.user.user_metadata as any;
                role = meta?.role || 'pending';
            }
        }

        req.user = {
            id: userId,
            email: data.user.email || '',
            role,
            empresa_id,
        };

        next();
    } catch (err) {
        console.error('[Auth Middleware Error]:', err);
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
