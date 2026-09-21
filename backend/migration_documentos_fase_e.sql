-- Migration: Documentos — FASE E (trabalho por pessoa)
--   responsáveis por área/tipo (atribuição automática), tarefas sobre
--   documentos, comentários com menções, ausências com delegação automática.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase (depois de
-- migration_documentos_fase_d.sql).

-- ============================================================
-- RESPONSÁVEIS POR ÁREA / TIPO ("RH é do Carlos; Contratos são da Ana")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_responsaveis (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    area text,                                  -- regra por área (null = qualquer)
    tipo_id integer REFERENCES public.documento_tipos(id) ON DELETE CASCADE,   -- regra por tipo (null = qualquer); tipo ganha à área
    user_id uuid NOT NULL,
    criado_em timestamptz DEFAULT now(),
    CHECK (area IS NOT NULL OR tipo_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS documento_responsaveis_empresa_idx ON public.documento_responsaveis (empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS documento_responsaveis_area_uq ON public.documento_responsaveis (empresa_id, area) WHERE tipo_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS documento_responsaveis_tipo_uq ON public.documento_responsaveis (empresa_id, tipo_id) WHERE tipo_id IS NOT NULL;

-- ============================================================
-- TAREFAS SOBRE DOCUMENTOS ("renovar o alvará até dia 30")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_tarefas_gerais (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    documento_id uuid REFERENCES public.documentos(id) ON DELETE CASCADE,       -- pode não ter documento (ex.: "obter certidão X")
    titulo text NOT NULL,
    descricao text,
    responsavel_id uuid NOT NULL,
    criado_por uuid,                            -- null = criada pelo sistema
    origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'validade', 'retencao', 'revisao')),
    prazo date,
    prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta')),
    estado text NOT NULL DEFAULT 'aberta' CHECK (estado IN ('aberta', 'em_curso', 'concluida', 'cancelada')),
    lembrete_enviado boolean NOT NULL DEFAULT false,
    concluida_em timestamptz,
    nota_conclusao text,
    criado_em timestamptz DEFAULT now(),
    atualizado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documento_tarefas_gerais_resp_idx ON public.documento_tarefas_gerais (empresa_id, responsavel_id, estado);
CREATE INDEX IF NOT EXISTS documento_tarefas_gerais_doc_idx ON public.documento_tarefas_gerais (documento_id);
-- uma só tarefa automática de validade por documento/validade
CREATE UNIQUE INDEX IF NOT EXISTS documento_tarefas_gerais_validade_uq ON public.documento_tarefas_gerais (documento_id, origem, prazo) WHERE origem = 'validade';

-- ============================================================
-- COMENTÁRIOS (com menções @nome)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_comentarios (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    user_nome text,
    texto text NOT NULL,
    mencoes uuid[] NOT NULL DEFAULT '{}',
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documento_comentarios_doc_idx ON public.documento_comentarios (documento_id, criado_em);

-- ============================================================
-- AUSÊNCIAS: "de 1 a 15 tudo o que for para mim vai para X"
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_ausencias (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    substituto_id uuid NOT NULL,
    inicio date NOT NULL,
    fim date NOT NULL,
    motivo text,
    criado_em timestamptz DEFAULT now(),
    CHECK (fim >= inicio)
);
CREATE INDEX IF NOT EXISTS documento_ausencias_user_idx ON public.documento_ausencias (empresa_id, user_id, inicio, fim);

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
        AND table_name IN ('documento_responsaveis', 'documento_tarefas_gerais', 'documento_comentarios', 'documento_ausencias')
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
