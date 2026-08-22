-- Migração: Jitsi público -> Daily.co (salas privadas, gravação em nuvem real,
-- e log de participantes verificado pelo servidor via webhooks da Daily).
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS daily_room_name text;
ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS gravacao_url text;
ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS gravacao_estado text DEFAULT 'pendente'; -- pendente | a_gravar | pronta | falhou
ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS daily_recording_id text;

COMMENT ON COLUMN public.reunioes.link_jitsi IS 'URL da sala de videochamada — historicamente Jitsi, agora Daily.co (nome da coluna mantido para não obrigar a alterar todos os pontos de leitura).';

CREATE TABLE IF NOT EXISTS public.reunioes_participantes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
    reuniao_id uuid REFERENCES public.reunioes(id) ON DELETE CASCADE,
    nome text NOT NULL,
    tipo text NOT NULL DEFAULT 'convidado', -- 'host' | 'convidado'
    daily_session_id text,
    entrou_em timestamp with time zone,
    saiu_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.reunioes_participantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view participantes of their company" ON public.reunioes_participantes;
CREATE POLICY "Users can view participantes of their company"
    ON public.reunioes_participantes FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- Sem política de INSERT/UPDATE: só o webhook da Daily (dailyRoutes.ts, cliente
-- service-role) escreve nesta tabela — mesmo padrão de reunioes_transcricoes.
