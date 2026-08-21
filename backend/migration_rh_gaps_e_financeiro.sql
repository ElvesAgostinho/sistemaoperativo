-- Migration: completa funcionalidades de RH que ficaram como "stub" numa
-- migração anterior para Supabase (Adiantamentos, Avaliações de Desempenho)
-- e cria a base de dados do novo módulo Financeiro (transações de
-- entrada/saída com anexo de fatura/recibo).
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- ============================================================
-- RH: ADIANTAMENTOS (Vales)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.adiantamentos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    colaborador_id integer NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    valor_total numeric NOT NULL,
    parcelas_mensais integer NOT NULL,
    valor_por_parcela numeric NOT NULL,
    parcelas_pagas integer DEFAULT 0,
    estado text DEFAULT 'Em Curso',
    criado_em timestamptz DEFAULT now()
);

ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage adiantamentos of their company" ON public.adiantamentos;
CREATE POLICY "Users can manage adiantamentos of their company"
    ON public.adiantamentos FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- ============================================================
-- RH: AVALIAÇÕES DE DESEMPENHO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.avaliacoes_desempenho (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    colaborador_id integer NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    avaliador_id integer REFERENCES public.colaboradores(id) ON DELETE SET NULL,
    pontuacao integer NOT NULL CHECK (pontuacao BETWEEN 1 AND 5),
    comentarios text,
    data_avaliacao date DEFAULT CURRENT_DATE,
    criado_em timestamptz DEFAULT now()
);

ALTER TABLE public.avaliacoes_desempenho ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage avaliacoes of their company" ON public.avaliacoes_desempenho;
CREATE POLICY "Users can manage avaliacoes of their company"
    ON public.avaliacoes_desempenho FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- ============================================================
-- FINANCEIRO: TRANSAÇÕES (entradas/saídas simples, com anexo)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financeiro_transacoes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    categoria text NOT NULL,
    descricao text,
    valor numeric NOT NULL,
    data date NOT NULL,
    estado text NOT NULL DEFAULT 'Pago' CHECK (estado IN ('Pago', 'Pendente')),
    data_vencimento date,
    forma_pagamento text,
    anexo_path text,
    anexo_nome text,
    origem text DEFAULT 'manual',
    referencia_tipo text,
    referencia_id text,
    criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financeiro_transacoes_empresa_data_idx ON public.financeiro_transacoes (empresa_id, data DESC);

ALTER TABLE public.financeiro_transacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage financeiro_transacoes of their company" ON public.financeiro_transacoes;
CREATE POLICY "Users can manage financeiro_transacoes of their company"
    ON public.financeiro_transacoes FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));
