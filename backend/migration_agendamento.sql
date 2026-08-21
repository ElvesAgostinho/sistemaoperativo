-- Migration: módulo de Agendamento (salões de beleza, restaurantes,
-- escritórios) — serviços, profissionais, horário de funcionamento e
-- marcações, com disponibilidade calculada automaticamente.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- ============================================================
-- SERVIÇOS (o que pode ser marcado, com duração)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agendamento_servicos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    duracao_minutos integer NOT NULL DEFAULT 30,
    preco numeric,
    cor text DEFAULT '#C9992E',
    ativo boolean DEFAULT true,
    criado_em timestamptz DEFAULT now()
);

ALTER TABLE public.agendamento_servicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage agendamento_servicos of their company" ON public.agendamento_servicos;
CREATE POLICY "Users can manage agendamento_servicos of their company"
    ON public.agendamento_servicos FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- ============================================================
-- PROFISSIONAIS / RECURSOS (quem/o que atende — opcional)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agendamento_profissionais (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    ativo boolean DEFAULT true,
    criado_em timestamptz DEFAULT now()
);

ALTER TABLE public.agendamento_profissionais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage agendamento_profissionais of their company" ON public.agendamento_profissionais;
CREATE POLICY "Users can manage agendamento_profissionais of their company"
    ON public.agendamento_profissionais FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- ============================================================
-- HORÁRIO DE FUNCIONAMENTO (por dia da semana)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agendamento_horarios (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    dia_semana integer NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=Domingo ... 6=Sábado
    hora_inicio time NOT NULL DEFAULT '08:00',
    hora_fim time NOT NULL DEFAULT '18:00',
    ativo boolean DEFAULT true,
    UNIQUE (empresa_id, dia_semana)
);

ALTER TABLE public.agendamento_horarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage agendamento_horarios of their company" ON public.agendamento_horarios;
CREATE POLICY "Users can manage agendamento_horarios of their company"
    ON public.agendamento_horarios FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- Leitura pública do horário (necessário para a página de marcação do cliente,
-- que não tem sessão autenticada)
DROP POLICY IF EXISTS "Public can read agendamento_horarios" ON public.agendamento_horarios;
CREATE POLICY "Public can read agendamento_horarios"
    ON public.agendamento_horarios FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "Public can read agendamento_servicos" ON public.agendamento_servicos;
CREATE POLICY "Public can read agendamento_servicos"
    ON public.agendamento_servicos FOR SELECT
    TO anon
    USING (ativo = true);

DROP POLICY IF EXISTS "Public can read agendamento_profissionais" ON public.agendamento_profissionais;
CREATE POLICY "Public can read agendamento_profissionais"
    ON public.agendamento_profissionais FOR SELECT
    TO anon
    USING (ativo = true);

-- ============================================================
-- MARCAÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agendamentos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    servico_id bigint NOT NULL REFERENCES public.agendamento_servicos(id) ON DELETE CASCADE,
    profissional_id bigint REFERENCES public.agendamento_profissionais(id) ON DELETE SET NULL,
    cliente_nome text NOT NULL,
    cliente_telefone text NOT NULL,
    data date NOT NULL,
    hora_inicio time NOT NULL,
    hora_fim time NOT NULL,
    estado text NOT NULL DEFAULT 'Agendado' CHECK (estado IN ('Agendado', 'Confirmado', 'Cancelado', 'Concluido', 'Nao_Compareceu')),
    origem text DEFAULT 'manual' CHECK (origem IN ('manual', 'cliente', 'whatsapp')),
    notas text,
    criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agendamentos_empresa_data_idx ON public.agendamentos (empresa_id, data);

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage agendamentos of their company" ON public.agendamentos;
CREATE POLICY "Users can manage agendamentos of their company"
    ON public.agendamentos FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- O cliente (sem login) só pode CRIAR a sua marcação, nunca ler/alterar as dos outros
DROP POLICY IF EXISTS "Public can create agendamentos" ON public.agendamentos;
CREATE POLICY "Public can create agendamentos"
    ON public.agendamentos FOR INSERT
    TO anon
    WITH CHECK (true);

-- Leitura pública restrita apenas para o cálculo de disponibilidade (o backend usa
-- isto só para saber que horários já estão ocupados nesse dia, nunca devolve nomes de
-- clientes ao público — ver AgendamentoService.getDisponibilidade)
DROP POLICY IF EXISTS "Public can read agendamentos slots" ON public.agendamentos;
CREATE POLICY "Public can read agendamentos slots"
    ON public.agendamentos FOR SELECT
    TO anon
    USING (estado NOT IN ('Cancelado'));
