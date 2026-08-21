-- Migration: garantir que o bucket "whatsapp-media" é público para leitura
-- em TODAS as pastas (mensagens do WhatsApp E fotos de perfil), não só na
-- pasta que já estava a ser usada. Sem isto, o upload da foto de perfil
-- "funciona" (o ficheiro fica gravado) mas o link devolvido não carrega
-- no browser, porque a leitura pública não cobre a pasta avatars/.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

UPDATE storage.buckets SET public = true WHERE id = 'whatsapp-media';

DROP POLICY IF EXISTS "Public read whatsapp-media" ON storage.objects;
CREATE POLICY "Public read whatsapp-media"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'whatsapp-media');
