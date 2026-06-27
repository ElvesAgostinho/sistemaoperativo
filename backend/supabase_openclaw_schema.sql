-- Se você já tem a tabela wa_channels, adicionaremos apenas o provider 'openclaw'
-- e garantiremos que o channel suporte o endpoint da VPS.

-- Tabela para gerenciar o estado da sessão do OpenClaw caso queira um controle mais fino
CREATE TABLE IF NOT EXISTS public.openclaw_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL, -- Atrelando ao tenant (empresa)
    vps_url text NOT NULL, -- A URL da VPS do OpenClaw (VPS 2)
    session_name text NOT NULL, -- O nome da sessão (ex: SISTEMA_EMP_123)
    status text DEFAULT 'disconnected', -- 'connected', 'disconnected', 'qrcode'
    qr_code_base64 text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Trigger para updated_at (caso ainda não exista no seu banco)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger se existir e recria
DROP TRIGGER IF EXISTS update_openclaw_sessions_modtime ON public.openclaw_sessions;
CREATE TRIGGER update_openclaw_sessions_modtime
    BEFORE UPDATE ON public.openclaw_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
