-- Migração: continua a usar o Jitsi público (meet.jit.si, sem custo, sem
-- servidor próprio) para a videochamada em si, e acrescenta gravação de áudio
-- por participante (cada um grava o próprio microfone no navegador, o backend
-- transcreve com Whisper e junta tudo numa ata). Rode este ficheiro
-- manualmente no SQL Editor do Supabase.

ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS jitsi_room_name text;
COMMENT ON COLUMN public.reunioes.link_jitsi IS 'URL da sala de videochamada no Jitsi público (meet.jit.si).';

-- Cada linha é UM ficheiro de áudio enviado por UM participante (o seu próprio
-- microfone, captado no navegador via MediaRecorder). Uma reunião com 3 pessoas
-- gera até 3 linhas aqui. `transcrito` evita voltar a chamar o Whisper sobre o
-- mesmo ficheiro se o botão "Terminar Reunião" for clicado mais que uma vez.
CREATE TABLE IF NOT EXISTS public.reunioes_gravacoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
    reuniao_id uuid REFERENCES public.reunioes(id) ON DELETE CASCADE,
    participante_nome text NOT NULL,
    participante_tipo text NOT NULL DEFAULT 'convidado', -- 'host' | 'convidado'
    ficheiro_path text NOT NULL,
    transcrito boolean DEFAULT false,
    criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.reunioes_gravacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view gravacoes of their company" ON public.reunioes_gravacoes;
CREATE POLICY "Users can view gravacoes of their company"
    ON public.reunioes_gravacoes FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- Sem política de INSERT/UPDATE: só o endpoint de upload (service-role,
-- reunioesPublicController.ts) escreve aqui, mesmo padrão de reunioes_transcricoes.
