-- Migration: Contabilidade (Plano de Contas, Diários, Exercícios Fiscais,
-- Lançamentos em partida dobrada).
--
-- O backend (accountingController.ts) e o frontend (FinanceiroApp.tsx, aba
-- "Contabilidade") já existiam a referenciar estas 5 tabelas, mas a migração
-- nunca tinha sido escrita/aplicada — o módulo inteiro respondia com
-- "Could not find the table 'public.X' in the schema cache" em produção.
--
-- Rode este ficheiro manualmente no SQL Editor do Supabase.

-- ============================================================
-- PLANO DE CONTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.planos_contas (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    conta text NOT NULL,
    descricao text NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('Activo', 'Passivo', 'Capital', 'Proveito', 'Custo')),
    natureza text NOT NULL DEFAULT 'Devedora' CHECK (natureza IN ('Devedora', 'Credora')),
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planos_contas_empresa_idx ON public.planos_contas (empresa_id);

-- ============================================================
-- DIÁRIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.diarios (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    codigo text NOT NULL,
    descricao text NOT NULL,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diarios_empresa_idx ON public.diarios (empresa_id);

-- ============================================================
-- EXERCÍCIOS FISCAIS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exercicios (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    ano integer NOT NULL,
    estado text NOT NULL DEFAULT 'Aberto',
    criado_em timestamptz DEFAULT now(),
    UNIQUE (empresa_id, ano)
);
CREATE INDEX IF NOT EXISTS exercicios_empresa_idx ON public.exercicios (empresa_id);

-- ============================================================
-- LANÇAMENTOS (cabeçalho de cada movimento contabilístico)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lancamentos (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    diario_id integer NOT NULL REFERENCES public.diarios(id) ON DELETE RESTRICT,
    exercicio_id integer NOT NULL REFERENCES public.exercicios(id) ON DELETE RESTRICT,
    data_lancamento date NOT NULL,
    descricao text,
    documento_referencia text,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lancamentos_empresa_idx ON public.lancamentos (empresa_id);
CREATE INDEX IF NOT EXISTS lancamentos_exercicio_idx ON public.lancamentos (exercicio_id);
CREATE INDEX IF NOT EXISTS lancamentos_diario_idx ON public.lancamentos (diario_id);

-- ============================================================
-- LINHAS DE LANÇAMENTO (partida dobrada: débito/crédito por conta)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linhas_lancamento (
    id SERIAL PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    lancamento_id integer NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
    conta_id integer NOT NULL REFERENCES public.planos_contas(id) ON DELETE RESTRICT,
    debito numeric(14,2) NOT NULL DEFAULT 0,
    credito numeric(14,2) NOT NULL DEFAULT 0,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS linhas_lancamento_empresa_idx ON public.linhas_lancamento (empresa_id);
CREATE INDEX IF NOT EXISTS linhas_lancamento_lancamento_idx ON public.linhas_lancamento (lancamento_id);
CREATE INDEX IF NOT EXISTS linhas_lancamento_conta_idx ON public.linhas_lancamento (conta_id);

-- ============================================================
-- RLS: mesma função current_empresa_id() já definida em backend/src/db/schema.sql
-- ============================================================
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('planos_contas', 'diarios', 'exercicios', 'lancamentos', 'linhas_lancamento')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON public.%I', t);
        EXECUTE format('CREATE POLICY "tenant_isolation" ON public.%I
            FOR ALL
            USING (empresa_id = current_empresa_id())
            WITH CHECK (empresa_id = current_empresa_id())', t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
