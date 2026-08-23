-- Limite de utilizadores por empresa (upsell de "lugares" por plano).
-- NULL = sem limite (mantém o comportamento atual para empresas já existentes).
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS limite_usuarios integer;
COMMENT ON COLUMN public.empresas.limite_usuarios IS 'Número máximo de utilizadores ativos (role diferente de pending) permitidos nesta empresa. NULL = sem limite.';
