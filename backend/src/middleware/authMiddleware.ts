import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Cliente com anon key (para validar token e chamar RPC SECURITY DEFINER)
const getAnonClient = () => createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

// Cliente com service_role key (se disponível - bypassa RLS completamente)
const getServiceClient = () => createClient(supabaseUrl, supabaseServiceKey || supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

/**
 * Middleware de autenticação via Supabase JWT.
 * Lê o header Authorization: Bearer <token>
 * Valida com Supabase e injeta req.user com o role correto da tabela perfis.
 *
 * Estratégia de leitura do perfil (por ordem):
 * 1. RPC get_perfil_by_id (SECURITY DEFINER - bypassa RLS, funciona com anon key)
 * 2. userClient com JWT token (respeita RLS via auth.uid())
 * 3. service_role client (se SUPABASE_SERVICE_KEY estiver configurada)
 * 4. user_metadata do token (último fallback, menos fiável)
 */
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autenticado. Faça login primeiro.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const anonClient = getAnonClient();
        const { data: authData, error: authError } = await anonClient.auth.getUser(token);
        
        if (authError || !authData?.user) {
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        const userId = authData.user.id;
        let decoded: any = {};
        try {
            // Apenas para extrair email e outras infos (a assinatura já foi validada pelo Supabase)
            decoded = jwt.decode(token) || {};
        } catch (e) {}

        let role = '';
        let empresa_id: string | null = null;

        // ── 1ª tentativa: RPC SECURITY DEFINER (bypassa RLS sem service_role key) ──
        try {
            const { data: rpcResult, error: rpcError } = await anonClient
                .rpc('get_perfil_by_id', { user_id: userId });

            if (!rpcError && rpcResult && rpcResult.length > 0) {
                const row = rpcResult[0];
                role = row.role || '';
                empresa_id = row.empresa_id || null;
                console.log(`[Auth] rpc ok: userId=${userId}, role=${role}`);
            } else if (rpcError) {
                console.warn(`[Auth] rpc erro: ${JSON.stringify(rpcError)}`);
            }
        } catch (rpcEx) {
            console.error('[Auth] rpc exception:', rpcEx);
        }

        // ── 2ª tentativa: userClient com JWT token (respeita RLS via auth.uid()) ──
        if (!role) {
            const userClient = createClient(supabaseUrl, supabaseKey, {
                global: { headers: { Authorization: `Bearer ${token}` } },
                auth: { persistSession: false, autoRefreshToken: false }
            });

            const { data: perfil, error: perfilError } = await userClient
                .from('perfis')
                .select('role, empresa_id')
                .eq('id', userId)
                .single();

            if (!perfilError && perfil) {
                role = perfil.role || '';
                empresa_id = perfil.empresa_id || null;
                console.log(`[Auth] userClient ok: userId=${userId}, role=${role}`);
            } else {
                console.warn(`[Auth] userClient erro: ${JSON.stringify(perfilError)}`);
            }
        }

        // ── 3ª tentativa: service_role client (bypassa RLS - só se SUPABASE_SERVICE_KEY existir) ──
        if (!role && supabaseServiceKey) {
            const serviceClient = getServiceClient();
            const { data: perfilService } = await serviceClient
                .from('perfis')
                .select('role, empresa_id')
                .eq('id', userId)
                .single();

            if (perfilService) {
                role = perfilService.role || '';
                empresa_id = perfilService.empresa_id || null;
                console.log(`[Auth] serviceClient ok: userId=${userId}, role=${role}`);
            }
        }

        // ── 4ª tentativa: user_metadata do JWT (último recurso) ──
        if (!role) {
            const meta = decoded.user_metadata as any || {};
            role = meta?.role || 'pending';
            console.warn(`[Auth] fallback user_metadata: userId=${userId}, role=${role}`);
        }

        req.user = {
            id: userId,
            email: decoded.email || '',
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
