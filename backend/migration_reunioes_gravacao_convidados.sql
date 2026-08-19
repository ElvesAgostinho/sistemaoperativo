-- Migration: gravação/transcrição de reuniões para todos os participantes
-- (internos + convidados externos), não só quem criou a reunião.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.reunioes_transcricoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
    reuniao_id uuid REFERENCES public.reunioes(id) ON DELETE CASCADE,
    participante_nome text NOT NULL,
    participante_tipo text NOT NULL DEFAULT 'convidado', -- 'host' | 'convidado'
    fragmento text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.reunioes_transcricoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view transcricoes of their company" ON public.reunioes_transcricoes;
CREATE POLICY "Users can view transcricoes of their company"
    ON public.reunioes_transcricoes FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));
