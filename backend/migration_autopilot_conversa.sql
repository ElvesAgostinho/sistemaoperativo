-- Migration: Autopilot — estado da conversa e eventos idempotentes
--
-- Resolve dois problemas de fundo do motor de automações:
--  1. cada mensagem do cliente re-executava o fluxo desde o início (a saudação
--     repetia-se a cada resposta). Agora o fluxo pára nos nós que esperam
--     resposta e retoma no ponto certo quando a mensagem seguinte chega.
--  2. o mesmo evento entregue duas vezes pelo Evolution/Meta era processado
--     duas vezes (mensagem duplicada no CRM e resposta em duplicado).
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- ============================================================
-- ESTADO DO FLUXO POR CONVERSA
-- ============================================================
ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS fluxo_automation_id bigint;
ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS fluxo_node_id text;          -- nó onde o fluxo ficou à espera da resposta
ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS fluxo_contexto jsonb;        -- variáveis já recolhidas ({{nome}}, respostas anteriores...)
ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS fluxo_tentativas integer NOT NULL DEFAULT 0;  -- respostas inválidas seguidas no mesmo nó
ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS fluxo_ate timestamptz;       -- depois disto o estado caduca e a conversa recomeça
CREATE INDEX IF NOT EXISTS wa_conversations_fluxo_idx ON public.wa_conversations (fluxo_node_id) WHERE fluxo_node_id IS NOT NULL;

-- ============================================================
-- EVENTOS JÁ PROCESSADOS (idempotência dos webhooks)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wa_eventos_processados (
    chave text PRIMARY KEY,                 -- canal + id da mensagem
    criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_eventos_processados_criado_idx ON public.wa_eventos_processados (criado_em);

-- Só o backend (service role) escreve aqui; sem política, o cliente anónimo não lê nem escreve.
ALTER TABLE public.wa_eventos_processados ENABLE ROW LEVEL SECURITY;
