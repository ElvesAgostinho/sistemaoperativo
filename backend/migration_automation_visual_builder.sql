-- Migration: builder visual de automação (estilo ManyChat)
--
-- A tabela `automations` nunca chegou a ser criada em produção (só existia
-- referenciada no código) — por isso o "ALTER TABLE" original falhava com
-- "relation public.automations does not exist". Este script cria a tabela
-- do zero, já no formato de grafo (nodes/edges) usado pelo novo builder,
-- e também cobre o caso de já existir manualmente noutro ambiente.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.automations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    trigger_type text,
    steps jsonb DEFAULT '[]'::jsonb,
    nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
    edges jsonb NOT NULL DEFAULT '[]'::jsonb,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamp with time zone DEFAULT now()
);

-- Caso a tabela já existisse (criada manualmente noutro ambiente), garante
-- que as colunas novas existem:
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edges jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.automations.steps IS 'DEPRECATED — substituído por nodes/edges (builder visual). Mantido apenas como fallback/rollback do script de migração.';

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view automations of their company" ON public.automations;
CREATE POLICY "Users can view automations of their company"
    ON public.automations FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Users can manage automations of their company" ON public.automations;
CREATE POLICY "Users can manage automations of their company"
    ON public.automations FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- wa_workflows pode não existir neste ambiente (era um recurso órfão, sem
-- tela nem rotas) — só comenta a tabela se ela de facto existir.
DO $$
BEGIN
    IF to_regclass('public.wa_workflows') IS NOT NULL THEN
        EXECUTE 'COMMENT ON TABLE public.wa_workflows IS ''DEPRECATED — lógica migrada para public.automations (nodes/edges, trigger com triggerKind=whatsapp_message). Seguro remover depois de validar a migração.''';
    END IF;
END $$;

-- Follow-up opcional, a rodar manualmente só depois de confirmar que o novo
-- builder e o script de migração funcionam corretamente em produção:
-- DROP TABLE public.wa_workflows;
-- ALTER TABLE public.automations DROP COLUMN steps;
