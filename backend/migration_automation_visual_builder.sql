-- Migration: builder visual de automação (estilo ManyChat)
-- Adiciona armazenamento em grafo (nodes/edges) à tabela `automations`,
-- unificando o antigo Autopilot (steps lineares) com o motor órfão de
-- respostas por palavra-chave do WhatsApp (`wa_workflows`).
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.
-- Depois de aplicado, corra o script backend/scripts/migrateAutomationsToGraph.ts
-- para converter os dados existentes para o novo formato.

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edges jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.automations.steps IS 'DEPRECATED — substituído por nodes/edges (builder visual). Mantido apenas como fallback/rollback do script de migração.';
COMMENT ON TABLE public.wa_workflows IS 'DEPRECATED — lógica migrada para public.automations (nodes/edges, trigger com triggerKind=whatsapp_message). Seguro remover depois de validar a migração.';

-- Follow-up opcional, a rodar manualmente só depois de confirmar que o novo
-- builder e o script de migração funcionam corretamente em produção:
-- DROP TABLE public.wa_workflows;
-- ALTER TABLE public.automations DROP COLUMN steps;
