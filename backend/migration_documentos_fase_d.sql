-- Migration: Documentos — FASE D
--   retenção, arquivo físico (localização + etiqueta QR), assinaturas
--   (adaptadores), partilha temporária por link, favoritos.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase (depois de
-- migration_documentos_fase_c.sql).

-- ============================================================
-- RETENÇÃO: política por tipo de documento
-- ============================================================
ALTER TABLE public.documento_tipos ADD COLUMN IF NOT EXISTS retencao_anos integer;              -- null = sem política
ALTER TABLE public.documento_tipos ADD COLUMN IF NOT EXISTS retencao_acao text NOT NULL DEFAULT 'rever'
    CHECK (retencao_acao IN ('rever', 'eliminar'));                                              -- ao vencer: pedir decisão / eliminar automaticamente
ALTER TABLE public.documento_tipos ADD COLUMN IF NOT EXISTS retencao_base text NOT NULL DEFAULT 'arquivo'
    CHECK (retencao_base IN ('arquivo', 'validade', 'documento'));                              -- conta a partir de: arquivado_em / validade / data_documento

ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS retencao_ate date;                       -- calculado quando o documento é arquivado/caduca
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS retencao_decisao text;                   -- 'manter' | 'eliminar' (decisão humana registada)
CREATE INDEX IF NOT EXISTS documentos_retencao_idx ON public.documentos (retencao_ate) WHERE retencao_ate IS NOT NULL;

-- ============================================================
-- ARQUIVO FÍSICO
-- ============================================================
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS localizacao_fisica jsonb;                -- { edificio, sala, armario, prateleira, caixa, pasta, notas }
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS codigo_fisico text;                      -- o que vai na etiqueta (por omissão o código documental)
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS emprestado_a text;                       -- quem tem o papel neste momento
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS emprestado_em timestamptz;
CREATE INDEX IF NOT EXISTS documentos_codigo_fisico_idx ON public.documentos (empresa_id, codigo_fisico);

-- ============================================================
-- ASSINATURAS (adaptadores: 'interna' = confirmação no sistema; 'externa' = fornecedor certificado)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_assinaturas (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
    versao integer NOT NULL,
    fornecedor text NOT NULL DEFAULT 'interna' CHECK (fornecedor IN ('interna', 'externa')),
    signatario_user_id uuid,                    -- assinatura interna: utilizador do sistema
    signatario_nome text NOT NULL,
    signatario_email text,
    estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'assinada', 'recusada', 'cancelada')),
    hash_documento text NOT NULL,               -- sha256 do ficheiro no momento do pedido: prova de que assinou ESTA versão
    pedido_por uuid,
    pedido_em timestamptz DEFAULT now(),
    concluido_em timestamptz,
    evidencia jsonb,                            -- { ip, user_agent, declaracao, referencia_externa }
    motivo text,
    referencia_externa text                     -- id no fornecedor externo, quando houver
);
CREATE INDEX IF NOT EXISTS documento_assinaturas_doc_idx ON public.documento_assinaturas (documento_id, versao);
CREATE INDEX IF NOT EXISTS documento_assinaturas_user_idx ON public.documento_assinaturas (empresa_id, signatario_user_id, estado);

-- ============================================================
-- PARTILHA TEMPORÁRIA POR LINK
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_partilhas (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    criado_por uuid,
    destinatario text,                          -- só informativo (para quem foi)
    expira_em timestamptz NOT NULL,
    max_acessos integer,                        -- null = sem limite
    acessos integer NOT NULL DEFAULT 0,
    senha_hash text,                            -- opcional
    revogado boolean NOT NULL DEFAULT false,
    ultimo_acesso_em timestamptz,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documento_partilhas_doc_idx ON public.documento_partilhas (documento_id);

-- ============================================================
-- FAVORITOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_favoritos (
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
    criado_em timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, documento_id)
);

-- ============================================================
-- RLS
-- ============================================================
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('documento_assinaturas', 'documento_partilhas', 'documento_favoritos')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON public.%I', t);
        EXECUTE format('CREATE POLICY "tenant_isolation" ON public.%I
            FOR ALL
            USING (empresa_id = current_empresa_id())
            WITH CHECK (empresa_id = current_empresa_id())', t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
