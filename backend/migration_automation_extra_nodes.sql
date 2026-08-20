-- Migration: suporte a Tags, Campos Personalizados no cliente para o builder
-- de automação (nós ADD_TAG/REMOVE_TAG/SET_CUSTOM_FIELD).
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
