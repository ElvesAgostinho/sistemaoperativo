-- Migration: módulo de Gestão de Documentos e Informação (licenciado à parte,
-- id de módulo "documentos").
--
-- Um arquivo que se organiza sozinho: os documentos entram por upload manual,
-- por anexos de email (automático) ou por WhatsApp (opcional), a IA lê,
-- classifica, extrai campos e validade, e liga a um cliente, colaborador ou
-- ativo. Os documentos gerados pelo próprio sistema (proformas, recibos,
-- atas, declarações) também são registados aqui.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- ============================================================
-- ATIVOS (máquinas, viaturas, equipamento informático, instalações...)
-- Um dossiê por ativo: manuais, manutenções, certificados, inspeções.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ativos (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    categoria text NOT NULL DEFAULT 'Equipamento',
    marca text,
    modelo text,
    numero_serie text,
    localizacao text,
    estado text NOT NULL DEFAULT 'Ativo' CHECK (estado IN ('Ativo', 'Em manutenção', 'Desativado')),
    notas text,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ativos_empresa_idx ON public.ativos (empresa_id);

-- ============================================================
-- DOCUMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documentos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,

    titulo text NOT NULL,
    nome_ficheiro text NOT NULL,
    url text,                                   -- (não usado: os links são assinados na leitura)
    storage_path text,                          -- caminho no bucket privado "documentos"
    mime_type text,
    tamanho integer,
    hash text,                                  -- sha256 do conteúdo, para não guardar o mesmo ficheiro duas vezes

    area text NOT NULL DEFAULT 'Outros',        -- Legal & Licenças, Financeiro, RH, Clientes, Fornecedores, Operações, Qualidade & Segurança, Outros
    tipo text,                                  -- Fatura, Contrato, Certificado, Licença, Recibo, Manual, Relatório, Identificação, Ficha de Segurança, ...
    resumo text,                                -- uma linha, escrita pela IA
    texto text,                                 -- texto extraído (para pesquisa e pré-visualização)
    campos jsonb DEFAULT '{}'::jsonb,           -- nif, valor, moeda, numero, emissor, ... extraídos pela IA
    data_documento date,
    validade date,                              -- quando caduca (licenças, certificados, contratos, BI...)

    entidade_tipo text CHECK (entidade_tipo IN ('cliente', 'colaborador', 'ativo', 'negocio', 'reuniao')),
    entidade_id text,
    entidade_nome text,                         -- nome sugerido pela IA, mesmo quando não conseguiu ligar a um registo

    origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'email', 'whatsapp', 'sistema')),
    origem_ref text,                            -- id do email, da mensagem de WhatsApp, ou do registo do sistema
    origem_detalhe text,                        -- ex: remetente do email

    estado text NOT NULL DEFAULT 'a_processar' CHECK (estado IN ('a_processar', 'arquivado', 'por_rever', 'descartado', 'erro')),
    confianca numeric(3,2),                     -- 0 a 1, quão certa a IA ficou da classificação
    erro text,

    criado_por uuid,
    criado_em timestamptz DEFAULT now(),
    atualizado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documentos_empresa_idx ON public.documentos (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS documentos_estado_idx ON public.documentos (empresa_id, estado);
CREATE INDEX IF NOT EXISTS documentos_area_idx ON public.documentos (empresa_id, area);
CREATE INDEX IF NOT EXISTS documentos_validade_idx ON public.documentos (empresa_id, validade) WHERE validade IS NOT NULL;
CREATE INDEX IF NOT EXISTS documentos_entidade_idx ON public.documentos (empresa_id, entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS documentos_hash_idx ON public.documentos (empresa_id, hash);

-- ============================================================
-- TRECHOS PARA PESQUISA SEMÂNTICA (mesma técnica da Base de Conhecimento)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.documento_chunks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL,
    conteudo text NOT NULL,
    embedding vector(1536)
);
CREATE INDEX IF NOT EXISTS documento_chunks_doc_idx ON public.documento_chunks (documento_id);
CREATE INDEX IF NOT EXISTS documento_chunks_empresa_idx ON public.documento_chunks (empresa_id);

CREATE OR REPLACE FUNCTION public.match_documento_chunks(
    query_embedding vector(1536),
    match_empresa_id uuid,
    match_count integer DEFAULT 8
)
RETURNS TABLE (documento_id uuid, conteudo text, similarity double precision)
LANGUAGE sql STABLE
AS $$
    SELECT dc.documento_id, dc.conteudo, 1 - (dc.embedding <=> query_embedding) AS similarity
    FROM public.documento_chunks dc
    WHERE dc.empresa_id = match_empresa_id
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ============================================================
-- PERMISSÕES POR ÁREA
-- Sem nenhuma linha para um utilizador, ele vê todas as áreas (comportamento
-- por omissão do sistema). Com linhas, vê só as áreas listadas. Admins e
-- superadmins veem sempre tudo -- o controlo é feito no backend.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documentos_permissoes (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    area text NOT NULL,
    UNIQUE (empresa_id, user_id, area)
);
CREATE INDEX IF NOT EXISTS documentos_permissoes_user_idx ON public.documentos_permissoes (empresa_id, user_id);

-- ============================================================
-- RLS (mesma função current_empresa_id() de backend/src/db/schema.sql)
-- ============================================================
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('ativos', 'documentos', 'documento_chunks', 'documentos_permissoes')
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

-- Acrescento (se já correu a versão anterior desta migração):
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS storage_path text;
