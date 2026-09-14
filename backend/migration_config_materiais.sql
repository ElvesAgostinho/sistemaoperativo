-- Migration: corrige 2 tabelas em falta/incompletas encontradas na varredura
-- final antes do lançamento comercial.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- ============================================================
-- 1) MATERIAIS DE MARKETING (Módulo Parcerias/Afiliados)
--    Tabela nunca chegou a ser criada -- todos os endpoints de
--    /api/afiliados/materiais e /api/afiliados/portal/materiais
--    respondiam "Could not find the table 'public.materiais_marketing'
--    in the schema cache".
-- ============================================================
CREATE TABLE IF NOT EXISTS public.materiais_marketing (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo text NOT NULL,
    tipo text NOT NULL DEFAULT 'imagem',
    url text NOT NULL,
    descricao text DEFAULT '',
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS materiais_marketing_empresa_idx ON public.materiais_marketing (empresa_id);

ALTER TABLE public.materiais_marketing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public.materiais_marketing;
CREATE POLICY "tenant_isolation" ON public.materiais_marketing
    FOR ALL
    USING (empresa_id = current_empresa_id())
    WITH CHECK (empresa_id = current_empresa_id());

-- ============================================================
-- 2) CONFIGURACOES_SISTEMA (perfil da empresa: nome, NIF, contactos,
--    logótipo, modelo de proforma -- usado em GET/PUT /api/settings/empresa)
--    A tabela existe mas sem a coluna empresa_id -- todos os pedidos
--    respondiam "column configuracoes_sistema.empresa_id does not exist".
--    Fica nullable (sem NOT NULL) para não rebentar caso existam linhas
--    antigas sem tenant; a política de RLS já as esconde de todos (uma
--    linha com empresa_id NULL nunca bate com current_empresa_id()).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
    id SERIAL PRIMARY KEY,
    chave text NOT NULL,
    valor text,
    criado_em timestamptz DEFAULT now()
);

ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS configuracoes_sistema_empresa_idx ON public.configuracoes_sistema (empresa_id, chave);

ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public.configuracoes_sistema;
CREATE POLICY "tenant_isolation" ON public.configuracoes_sistema
    FOR ALL
    USING (empresa_id = current_empresa_id())
    WITH CHECK (empresa_id = current_empresa_id());
