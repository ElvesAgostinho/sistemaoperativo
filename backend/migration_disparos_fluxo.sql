-- ============================================================
-- Disparar um fluxo para muita gente de uma vez
--
-- Um fluxo só arrancava quando chegava uma mensagem. Quem nunca respondia nunca
-- mais era contactado, e não havia forma de fazer seguimento a um grupo —
-- "todos os que ficaram em 'interessado' e não voltaram a falar".
--
-- Segue o mesmo desenho das campanhas: o disparo guarda-se uma vez, cada pessoa
-- é uma linha, e um processador em segundo plano corre o fluxo aos poucos.
-- Disparar para 500 contactos de rajada é a forma mais rápida de um número
-- pessoal ser banido pelo WhatsApp.
--
-- Correr no SQL Editor do Supabase. Pode ser corrida mais do que uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fluxo_disparos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    automation_id bigint NOT NULL,
    nome text NOT NULL,
    -- Quem recebe: todos os contactos, os de certas etiquetas, ou uma escolha à mão.
    publico_tipo text NOT NULL DEFAULT 'tags'
        CHECK (publico_tipo IN ('todos', 'tags', 'manual')),
    publico_tags text[],
    estado text NOT NULL DEFAULT 'Rascunho'
        CHECK (estado IN ('Rascunho', 'Em_Execucao', 'Pausado', 'Concluido', 'Cancelado')),
    velocidade_por_minuto integer NOT NULL DEFAULT 6,
    criado_por uuid,
    criado_em timestamptz DEFAULT now(),
    iniciado_em timestamptz,
    concluido_em timestamptz
);

CREATE TABLE IF NOT EXISTS public.fluxo_disparo_destinatarios (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    disparo_id uuid NOT NULL REFERENCES public.fluxo_disparos(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cliente_id bigint,
    conversation_id uuid,
    nome text,
    telefone text NOT NULL,
    estado text NOT NULL DEFAULT 'Pendente'
        CHECK (estado IN ('Pendente', 'Enviado', 'Falhou', 'Ignorado')),
    erro text,
    enviado_em timestamptz,
    criado_em timestamptz DEFAULT now()
);

-- O mesmo número não entra duas vezes no mesmo disparo: é o que evita que uma
-- pessoa receba a mesma coisa repetida.
CREATE UNIQUE INDEX IF NOT EXISTS fluxo_disparo_unico_por_telefone
    ON public.fluxo_disparo_destinatarios (disparo_id, telefone);

CREATE INDEX IF NOT EXISTS fluxo_disparo_pendentes_idx
    ON public.fluxo_disparo_destinatarios (disparo_id, estado);
CREATE INDEX IF NOT EXISTS fluxo_disparos_empresa_idx
    ON public.fluxo_disparos (empresa_id, criado_em DESC);

-- ---------- Isolamento por empresa ----------
ALTER TABLE public.fluxo_disparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_disparo_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fluxo_disparos_da_empresa" ON public.fluxo_disparos;
CREATE POLICY "fluxo_disparos_da_empresa" ON public.fluxo_disparos
    FOR ALL USING (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    );

DROP POLICY IF EXISTS "fluxo_disparo_dest_da_empresa" ON public.fluxo_disparo_destinatarios;
CREATE POLICY "fluxo_disparo_dest_da_empresa" ON public.fluxo_disparo_destinatarios
    FOR ALL USING (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    );
