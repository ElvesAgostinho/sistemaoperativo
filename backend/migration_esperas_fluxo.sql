-- ============================================================
-- Esperas longas nos fluxos (horas e dias)
--
-- O bloco "Aguardar (pausa)" era um temporizador em memória, limitado a 15
-- minutos. Qualquer reinício do servidor — ou uma simples publicação de código —
-- apagava a espera e o resto do fluxo nunca acontecia. Era por isso que não
-- havia horas nem dias: não seria verdade.
--
-- Agora a espera fica guardada aqui, com a hora a que deve continuar. Um
-- processador em segundo plano retoma o fluxo exatamente no bloco seguinte,
-- sobreviva ou não o servidor pelo meio.
--
-- Correr no SQL Editor do Supabase. Pode ser corrida mais do que uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fluxo_esperas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL,
    automation_id bigint,
    -- O bloco por onde o fluxo deve continuar quando a espera acabar.
    node_id text NOT NULL,
    -- O que o fluxo já sabia: respostas dadas, nome do cliente, etc.
    contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
    retomar_em timestamptz NOT NULL,
    estado text NOT NULL DEFAULT 'A_espera'
        CHECK (estado IN ('A_espera', 'Retomado', 'Cancelado', 'Falhou')),
    erro text,
    criado_em timestamptz DEFAULT now(),
    retomado_em timestamptz
);

-- O processador procura por isto a cada ciclo.
CREATE INDEX IF NOT EXISTS fluxo_esperas_por_retomar_idx
    ON public.fluxo_esperas (retomar_em)
    WHERE estado = 'A_espera';

CREATE INDEX IF NOT EXISTS fluxo_esperas_conversa_idx
    ON public.fluxo_esperas (conversation_id, estado);

ALTER TABLE public.fluxo_esperas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fluxo_esperas_da_empresa" ON public.fluxo_esperas;
CREATE POLICY "fluxo_esperas_da_empresa" ON public.fluxo_esperas
    FOR ALL USING (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    );
