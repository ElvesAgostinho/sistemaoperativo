-- Migration: Agendamento genérico (serve qualquer negócio) + marcações feitas pelos fluxos
--
-- 1. O módulo deixa de falar só "salão": cada empresa escolhe como chama as
--    coisas (Serviço/Quarto/Consulta/Mesa…) e quais os campos extra que quer
--    guardar (nº de pessoas, matrícula, tipo de quarto…).
-- 2. As marcações passam a poder nascer de um fluxo do Autopilot, com os dados
--    que o cliente escreveu no WhatsApp.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- ============================================================
-- COMO A EMPRESA CHAMA AS COISAS + CAMPOS EXTRA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agendamento_config (
    empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
    modelo text NOT NULL DEFAULT 'generico',       -- salao | clinica | hotel | restaurante | oficina | aluguer | generico
    rotulo_item text NOT NULL DEFAULT 'Serviço',   -- o que se marca (Serviço, Quarto, Consulta, Mesa…)
    rotulo_item_plural text NOT NULL DEFAULT 'Serviços',
    rotulo_recurso text NOT NULL DEFAULT 'Profissional',  -- quem/o que atende (Profissional, Sala, Viatura…)
    rotulo_recurso_plural text NOT NULL DEFAULT 'Profissionais',
    rotulo_agendamento text NOT NULL DEFAULT 'Marcação',
    rotulo_agendamento_plural text NOT NULL DEFAULT 'Marcações',
    -- [{ "chave":"pessoas", "rotulo":"Nº de pessoas", "tipo":"numero", "obrigatorio":true, "opcoes":[] }]
    campos jsonb NOT NULL DEFAULT '[]'::jsonb,
    atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE public.agendamento_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON public.agendamento_config;
CREATE POLICY "tenant_isolation" ON public.agendamento_config FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'))
    WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- A página pública de marcação precisa de ler os rótulos e os campos.
DROP POLICY IF EXISTS "Public can read agendamento_config" ON public.agendamento_config;
CREATE POLICY "Public can read agendamento_config" ON public.agendamento_config FOR SELECT TO anon USING (true);

-- ============================================================
-- DADOS EXTRA E ORIGEM DE CADA MARCAÇÃO
-- ============================================================
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS dados jsonb NOT NULL DEFAULT '{}'::jsonb;   -- campos extra preenchidos
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS cliente_id bigint;                          -- ligação ao CRM, quando existir
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS automation_id bigint;                       -- fluxo que a criou
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS criado_por uuid;

-- A origem passa a aceitar também 'fluxo' (marcação feita por um fluxo do Autopilot).
DO $$
BEGIN
    ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_origem_check;
    ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_origem_check
        CHECK (origem IN ('manual', 'cliente', 'whatsapp', 'fluxo'));
END $$;

CREATE INDEX IF NOT EXISTS agendamentos_telefone_idx ON public.agendamentos (empresa_id, cliente_telefone);
