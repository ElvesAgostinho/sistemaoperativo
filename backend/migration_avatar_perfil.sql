-- Migration: permite ao utilizador colocar uma foto de perfil.
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS avatar_url text;
