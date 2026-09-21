-- Migration: Documentos — FASE B (modelo empresarial)
--   tipos de documento configuráveis com metadados dinâmicos, código
--   documental, ciclo de vida (máquina de estados), versionamento, pastas,
--   auditoria imutável, confidencialidade e permissões por documento.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase (depois de
-- migration_documentos.sql).

-- ============================================================
-- TIPOS DE DOCUMENTO (configuráveis por empresa, com campos próprios)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_tipos (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    prefixo text NOT NULL,                      -- para o código documental: CTR, FAT, LIC...
    area_padrao text NOT NULL DEFAULT 'Outros',
    confidencialidade_padrao text NOT NULL DEFAULT 'Normal' CHECK (confidencialidade_padrao IN ('Normal', 'Confidencial', 'Restrito')),
    tem_validade boolean NOT NULL DEFAULT false,
    -- [{ "chave": "fornecedor", "rotulo": "Fornecedor", "tipo": "texto|numero|moeda|data|boolean|selecao", "opcoes": [], "obrigatorio": false }]
    campos jsonb NOT NULL DEFAULT '[]'::jsonb,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz DEFAULT now(),
    UNIQUE (empresa_id, nome)
);
CREATE INDEX IF NOT EXISTS documento_tipos_empresa_idx ON public.documento_tipos (empresa_id);

-- ============================================================
-- PASTAS (hierarquia opcional; a pesquisa por metadados não depende delas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_pastas (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    parent_id integer REFERENCES public.documento_pastas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documento_pastas_empresa_idx ON public.documento_pastas (empresa_id, parent_id);

-- ============================================================
-- DOCUMENTOS: colunas novas
-- ============================================================
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS tipo_id integer REFERENCES public.documento_tipos(id) ON DELETE SET NULL;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS pasta_id integer REFERENCES public.documento_pastas(id) ON DELETE SET NULL;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS metadados jsonb NOT NULL DEFAULT '{}'::jsonb;   -- valores dos campos do tipo
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS confidencialidade text NOT NULL DEFAULT 'Normal';
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS ciclo text NOT NULL DEFAULT 'DRAFT';
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS versao_atual integer NOT NULL DEFAULT 1;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS responsavel_id uuid;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS arquivado_em timestamptz;
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS eliminado_em timestamptz;       -- soft delete

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentos_confidencialidade_check') THEN
        ALTER TABLE public.documentos ADD CONSTRAINT documentos_confidencialidade_check
            CHECK (confidencialidade IN ('Normal', 'Confidencial', 'Restrito'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentos_ciclo_check') THEN
        ALTER TABLE public.documentos ADD CONSTRAINT documentos_ciclo_check
            CHECK (ciclo IN ('DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
                             'PENDING_SIGNATURE', 'SIGNED', 'ACTIVE', 'EXPIRED', 'ARCHIVED', 'RETENTION_PENDING', 'DELETED'));
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS documentos_codigo_idx ON public.documentos (empresa_id, codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS documentos_ciclo_idx ON public.documentos (empresa_id, ciclo);
CREATE INDEX IF NOT EXISTS documentos_pasta_idx ON public.documentos (empresa_id, pasta_id);

-- ============================================================
-- CÓDIGO DOCUMENTAL — sequência por empresa e prefixo, atómica
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_sequencias (
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    prefixo text NOT NULL,
    ultimo integer NOT NULL DEFAULT 0,
    PRIMARY KEY (empresa_id, prefixo)
);

CREATE OR REPLACE FUNCTION public.proximo_codigo_documento(p_empresa_id uuid, p_prefixo text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    n integer;
BEGIN
    INSERT INTO public.documento_sequencias (empresa_id, prefixo, ultimo)
    VALUES (p_empresa_id, p_prefixo, 1)
    ON CONFLICT (empresa_id, prefixo) DO UPDATE SET ultimo = public.documento_sequencias.ultimo + 1
    RETURNING ultimo INTO n;
    RETURN p_prefixo || '-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 5, '0');
END;
$$;

-- ============================================================
-- VERSÕES (cada alteração relevante do ficheiro = nova versão; nada se apaga)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_versoes (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
    numero integer NOT NULL,
    storage_path text NOT NULL,
    nome_ficheiro text NOT NULL,
    mime_type text,
    tamanho integer,
    hash text,
    comentario text,
    restaurada_de integer,                      -- número da versão de origem, quando é um restauro
    criado_por uuid,
    criado_em timestamptz DEFAULT now(),
    UNIQUE (documento_id, numero)
);
CREATE INDEX IF NOT EXISTS documento_versoes_doc_idx ON public.documento_versoes (documento_id, numero DESC);

-- ============================================================
-- PERMISSÕES POR DOCUMENTO (além das áreas): ver / editar / gerir, com expiração
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_acessos (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    nivel text NOT NULL CHECK (nivel IN ('ver', 'editar', 'gerir')),
    expira_em timestamptz,
    concedido_por uuid,
    criado_em timestamptz DEFAULT now(),
    UNIQUE (documento_id, user_id)
);
CREATE INDEX IF NOT EXISTS documento_acessos_user_idx ON public.documento_acessos (empresa_id, user_id);

-- ============================================================
-- AUDITORIA — só se acrescenta; ninguém altera nem apaga (nem admins)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documentos_auditoria (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    user_id uuid,
    user_nome text,
    acao text NOT NULL,                         -- upload, ver, descarregar, editar, transicao, nova_versao, restaurar_versao, apagar, acesso_concedido, acesso_revogado, mover, ...
    documento_id uuid,                          -- sem FK: o registo tem de sobreviver à eliminação do documento
    documento_titulo text,
    detalhes jsonb DEFAULT '{}'::jsonb,
    ip text,
    resultado text NOT NULL DEFAULT 'ok',
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documentos_auditoria_empresa_idx ON public.documentos_auditoria (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS documentos_auditoria_doc_idx ON public.documentos_auditoria (documento_id, criado_em DESC);

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
        AND table_name IN ('documento_tipos', 'documento_pastas', 'documento_sequencias', 'documento_versoes', 'documento_acessos')
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

-- Auditoria: ler e acrescentar dentro da empresa; UPDATE/DELETE sem política = negados.
ALTER TABLE public.documentos_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public.documentos_auditoria;
DROP POLICY IF EXISTS "auditoria_ler" ON public.documentos_auditoria;
DROP POLICY IF EXISTS "auditoria_acrescentar" ON public.documentos_auditoria;
CREATE POLICY "auditoria_ler" ON public.documentos_auditoria FOR SELECT USING (empresa_id = current_empresa_id());
CREATE POLICY "auditoria_acrescentar" ON public.documentos_auditoria FOR INSERT WITH CHECK (empresa_id = current_empresa_id());
