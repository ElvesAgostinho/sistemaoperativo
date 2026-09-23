-- ============================================================
-- Email: anexos nas mensagens e campanhas em massa
--
-- As campanhas de email seguem o mesmo desenho das de WhatsApp: a campanha
-- guarda o conteúdo uma vez, cada destinatário é uma linha com a sua própria
-- mensagem já resolvida, e um processador em segundo plano envia aos poucos.
-- Assim uma campanha de 2000 pessoas não bloqueia o servidor nem faz o servidor
-- de correio fechar a porta por excesso de ritmo.
--
-- Correr no SQL Editor do Supabase. Pode ser corrida mais do que uma vez.
-- ============================================================

-- ---------- 1. Anexos, cópias e origem nos emails normais ----------
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS anexos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS cc text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS bcc text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS campanha_id uuid;

COMMENT ON COLUMN public.emails.anexos IS 'Lista de {nome, url, tipo, tamanho} guardados no Storage.';

-- ---------- 2. Campanhas ----------
CREATE TABLE IF NOT EXISTS public.email_campanhas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    descricao text,
    assunto text NOT NULL,
    corpo_html text NOT NULL,
    anexos jsonb DEFAULT '[]'::jsonb,
    -- Quem recebe: todos os contactos, os que têm certas etiquetas, uma escolha
    -- à mão, ou uma lista de endereços colada pelo utilizador.
    publico_tipo text NOT NULL DEFAULT 'todos'
        CHECK (publico_tipo IN ('todos', 'tags', 'manual', 'lista')),
    publico_tags text[],
    estado text NOT NULL DEFAULT 'Rascunho'
        CHECK (estado IN ('Rascunho', 'Agendada', 'Em_Execucao', 'Pausada', 'Concluida', 'Cancelada')),
    agendada_para timestamptz,
    velocidade_por_minuto integer NOT NULL DEFAULT 30,
    criado_por uuid,
    criado_em timestamptz DEFAULT now(),
    iniciada_em timestamptz,
    concluida_em timestamptz
);

-- ---------- 3. Destinatários (um por pessoa, com estado individual) ----------
CREATE TABLE IF NOT EXISTS public.email_campanha_destinatarios (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campanha_id uuid NOT NULL REFERENCES public.email_campanhas(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cliente_id integer,
    nome text,
    email text NOT NULL,
    assunto_resolvido text,
    corpo_resolvido text,
    estado text NOT NULL DEFAULT 'Pendente'
        CHECK (estado IN ('Pendente', 'Enviado', 'Falhou')),
    erro text,
    enviado_em timestamptz,
    criado_em timestamptz DEFAULT now()
);

-- O mesmo endereço não entra duas vezes na mesma campanha: é isto que impede
-- uma pessoa de receber a mesma mensagem repetida.
CREATE UNIQUE INDEX IF NOT EXISTS email_dest_unico_por_campanha
    ON public.email_campanha_destinatarios (campanha_id, lower(email));

CREATE INDEX IF NOT EXISTS email_dest_pendentes_idx
    ON public.email_campanha_destinatarios (campanha_id, estado);
CREATE INDEX IF NOT EXISTS email_campanhas_empresa_idx
    ON public.email_campanhas (empresa_id, criado_em DESC);

-- ---------- 4. Isolamento por empresa ----------
ALTER TABLE public.email_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campanha_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_campanhas_da_empresa" ON public.email_campanhas;
CREATE POLICY "email_campanhas_da_empresa" ON public.email_campanhas
    FOR ALL USING (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    );

DROP POLICY IF EXISTS "email_dest_da_empresa" ON public.email_campanha_destinatarios;
CREATE POLICY "email_dest_da_empresa" ON public.email_campanha_destinatarios
    FOR ALL USING (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    );
