-- Migration: Campanhas de WhatsApp (envio em massa com templates oficiais
-- da Meta, público-alvo, variáveis personalizadas, agendamento e métricas).
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- ============================================================
-- CAMPANHAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campanhas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    channel_id uuid NOT NULL REFERENCES public.wa_channels(id) ON DELETE CASCADE,
    nome text NOT NULL,
    descricao text,
    template_name text NOT NULL,
    template_language text NOT NULL,
    template_preview text,
    publico_tipo text NOT NULL DEFAULT 'todos' CHECK (publico_tipo IN ('todos', 'tags', 'manual')),
    publico_tags text[],
    variaveis jsonb DEFAULT '{}'::jsonb, -- ex: { "1": "nome", "2": "empresa" } — mapeia {{n}} para um campo do contacto ou texto fixo
    estado text NOT NULL DEFAULT 'Rascunho' CHECK (estado IN ('Rascunho', 'Agendada', 'Em_Execucao', 'Pausada', 'Concluida', 'Cancelada', 'Com_Erro')),
    agendada_para timestamptz,
    velocidade_por_minuto integer NOT NULL DEFAULT 20,
    criado_por uuid,
    criado_em timestamptz DEFAULT now(),
    iniciada_em timestamptz,
    concluida_em timestamptz
);

CREATE INDEX IF NOT EXISTS campanhas_empresa_idx ON public.campanhas (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS campanhas_estado_idx ON public.campanhas (estado) WHERE estado IN ('Agendada', 'Em_Execucao');

ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage campanhas of their company" ON public.campanhas;
CREATE POLICY "Users can manage campanhas of their company"
    ON public.campanhas FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- ============================================================
-- DESTINATÁRIOS DA CAMPANHA (um por contacto, com estado individual)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campanha_destinatarios (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cliente_id integer,
    nome text,
    telefone text NOT NULL,
    variaveis_resolvidas jsonb DEFAULT '{}'::jsonb,
    estado text NOT NULL DEFAULT 'Pendente' CHECK (estado IN ('Pendente', 'Enviada', 'Entregue', 'Lida', 'Falhou', 'Respondida')),
    message_id text,
    erro text,
    enviado_em timestamptz,
    atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campanha_destinatarios_campanha_idx ON public.campanha_destinatarios (campanha_id, estado);
CREATE INDEX IF NOT EXISTS campanha_destinatarios_msgid_idx ON public.campanha_destinatarios (message_id);

ALTER TABLE public.campanha_destinatarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage campanha_destinatarios of their company" ON public.campanha_destinatarios;
CREATE POLICY "Users can manage campanha_destinatarios of their company"
    ON public.campanha_destinatarios FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- ============================================================
-- Ligação com o log de auditoria já existente (assign/unassign de conversas)
-- para também registar ações de campanha no mesmo sítio.
-- ============================================================
ALTER TABLE public.wa_audit_logs ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.campanhas(id) ON DELETE CASCADE;
