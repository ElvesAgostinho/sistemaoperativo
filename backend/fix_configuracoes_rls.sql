-- ============================================================
-- SCRIPT DE CORREÇÃO — GRAVAÇÃO DE CONFIGURAÇÕES (módulos, definições)
-- Execute este script no SQL Editor do seu Supabase
-- Dashboard: https://supabase.com/dashboard/project/lmxuixmmrglrqxjrhpgn/sql
--
-- PROBLEMA CORRIGIDO: a tabela public.configuracoes tem Row Level
-- Security ativa (ver backend/fix_supabase.sql), mas só tinha uma
-- política de LEITURA ("Allow read own configuracoes"). Nunca foi
-- criada nenhuma política de escrita (INSERT/UPDATE). Como o backend
-- não tem SUPABASE_SERVICE_ROLE_KEY configurada (só a anon key), os
-- pedidos de escrita usam sempre o token do próprio utilizador — e
-- sem uma política de escrita, o Postgres rejeita SEMPRE o upsert,
-- mesmo para o SuperAdmin. Isto explica por que "liberar" ou
-- "cancelar" módulos de uma empresa (SuperAdmin → Gerir
-- Licenciamento) e guardar Definições da empresa (Settings → Guardar)
-- não tinham qualquer efeito.
-- ============================================================

DROP POLICY IF EXISTS "Allow write own configuracoes" ON public.configuracoes;
CREATE POLICY "Allow write own configuracoes"
    ON public.configuracoes FOR INSERT
    WITH CHECK (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    );

DROP POLICY IF EXISTS "Allow update own configuracoes" ON public.configuracoes;
CREATE POLICY "Allow update own configuracoes"
    ON public.configuracoes FOR UPDATE
    USING (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    )
    WITH CHECK (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Verificação: deve devolver 3 políticas para public.configuracoes (select, insert, update)
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.configuracoes'::regclass;
