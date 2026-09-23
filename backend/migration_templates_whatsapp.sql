-- Migration: Templates de WhatsApp (modelos de mensagem)
--
-- A tabela wa_templates já existia (só guardava os templates aprovados que
-- vinham da Meta). Passa a guardar também os que a empresa cria aqui, com o
-- estado real e o motivo de recusa quando a Meta rejeita.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

ALTER TABLE public.wa_templates ADD COLUMN IF NOT EXISTS meta_id text;                 -- id do template na Meta
ALTER TABLE public.wa_templates ADD COLUMN IF NOT EXISTS motivo_rejeicao text;         -- porque a Meta recusou
ALTER TABLE public.wa_templates ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'meta'
    CHECK (origem IN ('meta', 'local'));                                               -- 'local' = criado aqui e ainda não submetido
ALTER TABLE public.wa_templates ADD COLUMN IF NOT EXISTS criado_por uuid;
ALTER TABLE public.wa_templates ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();
ALTER TABLE public.wa_templates ADD COLUMN IF NOT EXISTS atualizado_em timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS wa_templates_empresa_idx ON public.wa_templates (empresa_id);
-- o mesmo nome+idioma não se repete dentro do mesmo canal
CREATE UNIQUE INDEX IF NOT EXISTS wa_templates_nome_uq ON public.wa_templates (channel_id, name, language);
