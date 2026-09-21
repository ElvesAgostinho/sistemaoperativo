-- Migration: Documentos — FASE C (fluxos de aprovação, notificações, checklists)
--   motor de workflow por etapas (aprovadores, prazos/SLA, escalonamento,
--   delegação), caixa "As minhas aprovações", notificações internas + email,
--   e checklists de processo (ex.: dossier de fornecedor / de colaborador).
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase (depois de
-- migration_documentos_fase_b.sql).

-- ============================================================
-- FLUXOS (modelos de aprovação configuráveis por empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_fluxos (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    descricao text,
    -- Se preenchido, o fluxo é sugerido por omissão para documentos deste tipo.
    tipo_id integer REFERENCES public.documento_tipos(id) ON DELETE SET NULL,
    -- [{ "nome": "Direção Financeira", "aprovadores": ["<uuid>", ...], "modo": "qualquer|todos",
    --    "prazo_horas": 48, "escalar_para": "<uuid>|null" }]
    etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
    ativar_ao_aprovar boolean NOT NULL DEFAULT true,   -- APPROVED -> ACTIVE automaticamente
    ativo boolean NOT NULL DEFAULT true,
    criado_por uuid,
    criado_em timestamptz DEFAULT now(),
    UNIQUE (empresa_id, nome)
);
CREATE INDEX IF NOT EXISTS documento_fluxos_empresa_idx ON public.documento_fluxos (empresa_id);

-- ============================================================
-- PROCESSOS (uma execução de um fluxo sobre um documento)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_processos (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
    fluxo_id integer REFERENCES public.documento_fluxos(id) ON DELETE SET NULL,
    fluxo_nome text NOT NULL,
    etapas jsonb NOT NULL,                      -- cópia das etapas no momento do arranque (o fluxo pode mudar depois)
    etapa_atual integer NOT NULL DEFAULT 0,     -- índice em etapas
    estado text NOT NULL DEFAULT 'em_curso' CHECK (estado IN ('em_curso', 'aprovado', 'rejeitado', 'cancelado')),
    ciclo_anterior text,                        -- para repor se for cancelado
    iniciado_por uuid,
    iniciado_em timestamptz DEFAULT now(),
    concluido_em timestamptz,
    comentario text,
    versao_documento integer                    -- versão do documento que foi submetida
);
CREATE INDEX IF NOT EXISTS documento_processos_doc_idx ON public.documento_processos (documento_id, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS documento_processos_empresa_idx ON public.documento_processos (empresa_id, estado);

-- ============================================================
-- TAREFAS (uma por aprovador por etapa — é isto que aparece em "As minhas aprovações")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_tarefas (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    processo_id integer NOT NULL REFERENCES public.documento_processos(id) ON DELETE CASCADE,
    documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
    etapa integer NOT NULL,
    etapa_nome text NOT NULL,
    aprovador_id uuid NOT NULL,
    delegado_de uuid,                           -- quem delegou (se a tarefa veio por delegação)
    escalada_de uuid,                           -- aprovador original (se a tarefa veio por escalonamento)
    estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aprovada', 'rejeitada', 'delegada', 'cancelada', 'escalada')),
    prazo timestamptz,
    avisado_prazo boolean NOT NULL DEFAULT false, -- já foi notificado do atraso (evita repetir a cada verificação)
    decidido_em timestamptz,
    comentario text,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documento_tarefas_aprovador_idx ON public.documento_tarefas (empresa_id, aprovador_id, estado);
CREATE INDEX IF NOT EXISTS documento_tarefas_processo_idx ON public.documento_tarefas (processo_id, etapa);
CREATE INDEX IF NOT EXISTS documento_tarefas_prazo_idx ON public.documento_tarefas (prazo) WHERE estado = 'pendente';

-- ============================================================
-- NOTIFICAÇÕES INTERNAS (o email é enviado à parte, quando há SMTP)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_notificacoes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    tipo text NOT NULL,                         -- tarefa_nova, tarefa_prazo, tarefa_escalada, processo_aprovado, processo_rejeitado, processo_cancelado, delegacao, validade, checklist
    titulo text NOT NULL,
    mensagem text,
    documento_id uuid,
    tarefa_id integer,
    lida boolean NOT NULL DEFAULT false,
    email_enviado boolean NOT NULL DEFAULT false,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documento_notificacoes_user_idx ON public.documento_notificacoes (empresa_id, user_id, lida, criado_em DESC);

-- ============================================================
-- CHECKLISTS DE PROCESSO (que documentos uma entidade tem de ter)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documento_checklists (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,                         -- "Dossier de fornecedor", "Admissão de colaborador"
    entidade_tipo text NOT NULL CHECK (entidade_tipo IN ('cliente', 'colaborador', 'ativo', 'negocio')),
    -- [{ "tipo_id": 12, "obrigatorio": true, "nota": "válido e não caducado" }]
    itens jsonb NOT NULL DEFAULT '[]'::jsonb,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz DEFAULT now(),
    UNIQUE (empresa_id, nome)
);
CREATE INDEX IF NOT EXISTS documento_checklists_empresa_idx ON public.documento_checklists (empresa_id, entidade_tipo);

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
        AND table_name IN ('documento_fluxos', 'documento_processos', 'documento_tarefas', 'documento_notificacoes', 'documento_checklists')
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
