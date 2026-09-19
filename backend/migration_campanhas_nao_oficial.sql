-- Migration: Campanhas pela API NÃO oficial (Evolution / ligação por QR Code).
--
-- A tabela `campanhas` foi desenhada só para a API oficial da Meta: exigia
-- sempre um template aprovado (template_name/template_language NOT NULL).
-- Na API não oficial não existem templates — envia-se texto livre, com as
-- variáveis resolvidas por contacto ({{nome}}, {{empresa}}, {{telefone}}).
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- Tipo de API usada pela campanha.
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS tipo_api text NOT NULL DEFAULT 'oficial';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'campanhas_tipo_api_check'
    ) THEN
        ALTER TABLE public.campanhas
            ADD CONSTRAINT campanhas_tipo_api_check CHECK (tipo_api IN ('oficial', 'nao_oficial'));
    END IF;
END;
$$;

-- Corpo da mensagem para campanhas não oficiais (texto livre com {{variaveis}}).
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS mensagem_texto text;

-- Campanhas não oficiais não têm template — estas colunas passam a opcionais.
ALTER TABLE public.campanhas ALTER COLUMN template_name DROP NOT NULL;
ALTER TABLE public.campanhas ALTER COLUMN template_language DROP NOT NULL;

-- Multimédia opcional da campanha (imagem, vídeo, áudio ou documento).
-- O ficheiro fica no Supabase Storage; aqui guarda-se só o link.
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS media_tipo text;
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS media_nome text;
