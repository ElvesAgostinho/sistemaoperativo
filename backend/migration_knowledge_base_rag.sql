-- Migration: RAG real para a Base de Conhecimento (embeddings + pgvector)
--
-- Corrige a "conexão" entre Base de Conhecimento, WhatsApp e Autopilot: até
-- agora a busca da IA apontava para uma pasta diferente da usada pelo upload
-- (nenhum documento era encontrado) e era só correspondência de substring.
-- Esta migration guarda os documentos fatiados (chunks) com embedding,
-- permitindo busca semântica real via a função match_knowledge_chunks.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome_ficheiro text NOT NULL,
    chunk_index int NOT NULL,
    conteudo text NOT NULL,
    embedding vector(1536),
    criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
    ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS knowledge_chunks_empresa_ficheiro_idx
    ON public.knowledge_chunks (empresa_id, nome_ficheiro);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view knowledge chunks of their company" ON public.knowledge_chunks;
CREATE POLICY "Users can view knowledge chunks of their company"
    ON public.knowledge_chunks FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Users can manage knowledge chunks of their company" ON public.knowledge_chunks;
CREATE POLICY "Users can manage knowledge chunks of their company"
    ON public.knowledge_chunks FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- Função de busca por similaridade (cosine), usada pelo backend via supabase.rpc(...)
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    query_embedding vector(1536),
    match_empresa_id uuid,
    match_count int DEFAULT 5
) RETURNS TABLE (nome_ficheiro text, conteudo text, similarity float)
LANGUAGE sql STABLE AS $$
    SELECT nome_ficheiro, conteudo, 1 - (embedding <=> query_embedding) AS similarity
    FROM public.knowledge_chunks
    WHERE empresa_id = match_empresa_id
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;
