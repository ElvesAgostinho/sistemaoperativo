-- PostgreSQL Schema for BusinessOS (Migrated from SQLite)
-- This script creates the core business tables and applies RLS by empresa_id

CREATE OR REPLACE FUNCTION current_empresa_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT empresa_id FROM public.perfis WHERE id = auth.uid() LIMIT 1;
$$;

-- COLABORADORES
CREATE TABLE IF NOT EXISTS public.colaboradores (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    nome TEXT NOT NULL,
    bi TEXT NOT NULL,
    nif TEXT,
    data_nascimento TEXT,
    cargo TEXT,
    salario_base NUMERIC NOT NULL,
    iban TEXT,
    banco TEXT,
    email TEXT,
    telefone TEXT,
    niss TEXT,
    departamento TEXT,
    numero_dependentes INTEGER DEFAULT 0,
    sub_alimentacao_contrato NUMERIC DEFAULT 0,
    sub_transporte_contrato NUMERIC DEFAULT 0,
    estado_civil TEXT,
    genero TEXT,
    nacionalidade TEXT,
    endereco TEXT,
    contato_emergencia TEXT,
    estado TEXT DEFAULT 'Ativo',
    departamento_id INTEGER,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM: CLIENTES
CREATE TABLE IF NOT EXISTS public.clientes (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    empresa TEXT,
    afiliado_id INTEGER,
    bot_paused BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM: NEGÓCIOS
CREATE TABLE IF NOT EXISTS public.negocios (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    cliente_id INTEGER REFERENCES public.clientes(id),
    titulo TEXT NOT NULL,
    valor_estimado NUMERIC DEFAULT 0,
    fase TEXT DEFAULT 'Nova Lead',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM: PROFORMAS
CREATE TABLE IF NOT EXISTS public.proformas (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    negocio_id INTEGER NOT NULL REFERENCES public.negocios(id),
    detalhes_json TEXT NOT NULL,
    data_validade DATE,
    pdf_path TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RH: AUSÊNCIAS
CREATE TABLE IF NOT EXISTS public.ausencias (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    colaborador_id INTEGER NOT NULL REFERENCES public.colaboradores(id),
    tipo TEXT NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    justificada BOOLEAN DEFAULT FALSE,
    estado_aprovacao TEXT DEFAULT 'Pendente',
    comprovativo_path TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RH: RECIBOS
CREATE TABLE IF NOT EXISTS public.recibos_vencimento (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    processamento_id INTEGER,
    colaborador_id INTEGER REFERENCES public.colaboradores(id),
    salario_base NUMERIC NOT NULL,
    faltas_dias INTEGER DEFAULT 0,
    desconto_faltas NUMERIC DEFAULT 0,
    subsidio_alimentacao NUMERIC DEFAULT 0,
    subsidio_transporte NUMERIC DEFAULT 0,
    outros_abonos NUMERIC DEFAULT 0,
    outros_descontos NUMERIC DEFAULT 0,
    inss_trabalhador NUMERIC NOT NULL,
    inss_entidade NUMERIC NOT NULL,
    irt NUMERIC NOT NULL,
    total_liquido NUMERIC NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Outras Tabelas
CREATE TABLE IF NOT EXISTS public.departamentos (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    nome TEXT NOT NULL,
    descricao TEXT,
    orcamento_mensal NUMERIC DEFAULT 0,
    gestor_id INTEGER REFERENCES public.colaboradores(id),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.documentos_colaboradores (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    colaborador_id INTEGER NOT NULL REFERENCES public.colaboradores(id),
    categoria TEXT NOT NULL,
    titulo TEXT NOT NULL,
    file_path TEXT NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.processamentos_mensais (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    mes INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    estado TEXT DEFAULT 'Rascunho',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and create policies
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('colaboradores', 'clientes', 'negocios', 'proformas', 'ausencias', 'recibos_vencimento', 'departamentos', 'documentos_colaboradores', 'processamentos_mensais')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        
        -- Drop if exists to be idempotent
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON public.%I', t);
        
        EXECUTE format('CREATE POLICY "tenant_isolation" ON public.%I
            FOR ALL
            USING (empresa_id = current_empresa_id())
            WITH CHECK (empresa_id = current_empresa_id())', t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Set missing RLS on existing tables mentioned in advisory
ALTER TABLE public.ai_router_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
