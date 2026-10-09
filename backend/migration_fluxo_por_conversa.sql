-- ============================================================
-- Escolher o fluxo conversa a conversa
--
-- Até agora qual o fluxo que respondia era decidido pelo sistema, igual para
-- toda a gente: entre os fluxos ativos ganhava o do gatilho mais específico.
-- Quem atende não tinha como dizer "este cliente é para ser atendido por aquele
-- fluxo" — e o mesmo não serve para todos.
--
-- Estas colunas guardam essa escolha por conversa. Não confundir com as
-- `fluxo_*`, que são o estado passageiro de um fluxo a meio (onde ficou à espera
-- da resposta); isto é a escolha de quem atende, e fica até ser mudada.
--
-- Correr no SQL Editor do Supabase. Pode ser corrida mais do que uma vez.
-- ============================================================

ALTER TABLE public.wa_conversations
    ADD COLUMN IF NOT EXISTS automation_escolhida_id bigint;
ALTER TABLE public.wa_conversations
    ADD COLUMN IF NOT EXISTS automation_escolhida_em timestamptz;
ALTER TABLE public.wa_conversations
    ADD COLUMN IF NOT EXISTS automation_escolhida_por uuid;

COMMENT ON COLUMN public.wa_conversations.automation_escolhida_id IS
    'Fluxo que quem atende escolheu para esta conversa. A nulo, o sistema escolhe como sempre.';

CREATE INDEX IF NOT EXISTS wa_conversations_automation_escolhida_idx
    ON public.wa_conversations (automation_escolhida_id)
    WHERE automation_escolhida_id IS NOT NULL;
