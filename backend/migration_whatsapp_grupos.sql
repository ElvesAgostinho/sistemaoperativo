-- Migration: Grupos de WhatsApp — resumo automático (IA) e resposta
-- automática a comentários de clientes em grupos de vendas.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- ============================================================
-- GRUPOS MONITORIZADOS (opt-in — só grupos que o dono registar
-- explicitamente é que passam a ter mensagens guardadas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wa_grupos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    channel_id uuid NOT NULL REFERENCES public.wa_channels(id) ON DELETE CASCADE,
    group_jid text NOT NULL,
    nome text NOT NULL,
    contexto_negocio text,
    monitorizar boolean DEFAULT true,
    resposta_automatica_ativa boolean DEFAULT false,
    cooldown_min integer DEFAULT 10,
    respostas_max_hora integer DEFAULT 20,
    criado_em timestamptz DEFAULT now(),
    UNIQUE (channel_id, group_jid)
);

ALTER TABLE public.wa_grupos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage wa_grupos of their company" ON public.wa_grupos;
CREATE POLICY "Users can manage wa_grupos of their company"
    ON public.wa_grupos FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- ============================================================
-- MENSAGENS DO GRUPO (só guardadas para grupos com monitorizar=true)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wa_grupo_mensagens (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grupo_id uuid NOT NULL REFERENCES public.wa_grupos(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    remetente_jid text,
    remetente_nome text,
    conteudo text NOT NULL,
    direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
    respondendo_a_jid text,
    message_id text,
    criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_grupo_mensagens_grupo_data_idx ON public.wa_grupo_mensagens (grupo_id, criado_em);

ALTER TABLE public.wa_grupo_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read wa_grupo_mensagens of their company" ON public.wa_grupo_mensagens;
CREATE POLICY "Users can read wa_grupo_mensagens of their company"
    ON public.wa_grupo_mensagens FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- ============================================================
-- RESUMOS GERADOS PELA IA (histórico)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wa_grupo_resumos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grupo_id uuid NOT NULL REFERENCES public.wa_grupos(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    periodo_inicio timestamptz NOT NULL,
    periodo_fim timestamptz NOT NULL,
    resumo text NOT NULL,
    leads jsonb DEFAULT '[]'::jsonb,
    reclamacoes jsonb DEFAULT '[]'::jsonb,
    total_mensagens integer DEFAULT 0,
    criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_grupo_resumos_grupo_idx ON public.wa_grupo_resumos (grupo_id, criado_em DESC);

ALTER TABLE public.wa_grupo_resumos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read wa_grupo_resumos of their company" ON public.wa_grupo_resumos;
CREATE POLICY "Users can read wa_grupo_resumos of their company"
    ON public.wa_grupo_resumos FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));
