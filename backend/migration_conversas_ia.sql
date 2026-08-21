-- Migration: histórico de conversas do Assistente IA (Copilot IA / WhatsApp fallback)
--
-- As tabelas conversas_ia e mensagens_ia nunca chegaram a ser criadas em
-- produção (só existiam referenciadas no código, como aconteceu com
-- `automations` mais cedo nesta mesma leva de correções) — por isso todo
-- pedido ao Assistente IA falhava com "Could not find the table
-- 'public.conversas_ia' in the schema cache".
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.conversas_ia (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
    utilizador_id text NOT NULL,
    titulo text,
    criado_em timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mensagens_ia (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversa_id bigint REFERENCES public.conversas_ia(id) ON DELETE CASCADE,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text,
    name text,
    tool_call_id text,
    tool_calls jsonb,
    criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensagens_ia_conversa_idx ON public.mensagens_ia (conversa_id);

ALTER TABLE public.conversas_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view conversas_ia of their company" ON public.conversas_ia;
CREATE POLICY "Users can view conversas_ia of their company"
    ON public.conversas_ia FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Users can manage conversas_ia of their company" ON public.conversas_ia;
CREATE POLICY "Users can manage conversas_ia of their company"
    ON public.conversas_ia FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Users can view mensagens_ia of their company" ON public.mensagens_ia;
CREATE POLICY "Users can view mensagens_ia of their company"
    ON public.mensagens_ia FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Users can manage mensagens_ia of their company" ON public.mensagens_ia;
CREATE POLICY "Users can manage mensagens_ia of their company"
    ON public.mensagens_ia FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));
