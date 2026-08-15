import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';

const supabaseUrl = process.env.SUPABASE_URL || '';

// Chave ANON (pública) — usada para requests autenticados com JWT do utilizador.
// PostgREST avalia o JWT e aplica Row Level Security (RLS).
const supabaseAnonKey = process.env.SUPABASE_KEY || '';

// Chave SERVICE ROLE — bypassa RLS completamente.
// Usar APENAS para operações de sistema (webhooks, cron jobs, admin).
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = require('ws');
}

/**
 * Cliente ADMIN (service role) — bypassa RLS.
 * Usar APENAS para: webhooks sem contexto de user, cron jobs, operações de superadmin.
 * NUNCA usar para requests normais de utilizadores autenticados.
 */
export const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

/**
 * Alias explícito para o cliente admin — torna o código mais legível.
 */
export const supabaseAdmin = supabase;

/**
 * Cria um cliente Supabase com RLS ativo, usando a ANON KEY + JWT do utilizador.
 * PostgREST avalia o apikey (anon) e o Authorization header (JWT) para aplicar RLS.
 * Esta é a função que DEVE ser usada em TODAS as rotas autenticadas.
 */
export const getSupabase = (req: Request): SupabaseClient => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        return createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: authHeader
                }
            },
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    // Fallback para anon client sem auth (não deve acontecer em rotas protegidas)
    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
};
