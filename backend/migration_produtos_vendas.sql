-- ============================================================
-- Produtos e Vendas (dentro do Financeiro)
--
-- Para as microempresas que vendem produtos: cadastrar o que vendem (com
-- foto), registar as compras (com a fatura do fornecedor) e as vendas. O
-- stock sobe com cada compra e desce com cada venda, sozinho, e as duas
-- entram nas Transações do Financeiro — a compra como saída, a venda como
-- entrada.
--
-- Cada venda tem um comprovativo em PDF. NÃO é uma fatura nem a substitui:
-- é o registo interno da venda, que o dono guarda e pode, se quiser, dar ao
-- cliente.
--
-- Correr no SQL Editor do Supabase. Pode correr-se mais do que uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- PRODUTOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.produtos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    codigo text,
    descricao text,
    foto_url text,
    -- Custo da ÚLTIMA compra, por unidade. Cada compra guarda o seu.
    preco_custo numeric NOT NULL DEFAULT 0,
    preco_venda numeric NOT NULL DEFAULT 0,
    -- Pode ficar negativo: vender sem stock avisa, mas não impede.
    stock numeric NOT NULL DEFAULT 0,
    stock_minimo numeric,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS produtos_empresa_idx ON public.produtos (empresa_id, nome);

-- ------------------------------------------------------------
-- COMPRAS (entradas de stock), com a fatura do fornecedor
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.produtos_compras (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    produto_id bigint NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    quantidade numeric NOT NULL CHECK (quantidade > 0),
    custo_unitario numeric NOT NULL CHECK (custo_unitario >= 0),
    total numeric NOT NULL,
    fornecedor text,
    data date NOT NULL DEFAULT CURRENT_DATE,
    -- Caminho no bucket privado "documentos" (nunca um link permanente).
    fatura_path text,
    fatura_nome text,
    transacao_id bigint REFERENCES public.financeiro_transacoes(id) ON DELETE SET NULL,
    criado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS produtos_compras_produto_idx ON public.produtos_compras (produto_id, data DESC);

-- ------------------------------------------------------------
-- VENDAS e as suas linhas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendas (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    -- Número do comprovativo, seguido, por empresa (1, 2, 3...).
    numero integer NOT NULL,
    data date NOT NULL DEFAULT CURRENT_DATE,
    cliente_nome text,
    cliente_telefone text,
    forma_pagamento text,
    total numeric NOT NULL,
    estado text NOT NULL DEFAULT 'Concluida' CHECK (estado IN ('Concluida', 'Anulada')),
    -- Caminho do comprovativo em PDF no bucket privado "documentos".
    pdf_path text,
    transacao_id bigint REFERENCES public.financeiro_transacoes(id) ON DELETE SET NULL,
    criado_em timestamptz DEFAULT now(),
    UNIQUE (empresa_id, numero)
);
CREATE INDEX IF NOT EXISTS vendas_empresa_idx ON public.vendas (empresa_id, numero DESC);

CREATE TABLE IF NOT EXISTS public.vendas_itens (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venda_id bigint NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    produto_id bigint REFERENCES public.produtos(id) ON DELETE SET NULL,
    -- Copiados no momento da venda: o comprovativo não muda se o produto
    -- mudar de nome ou de preço depois.
    produto_nome text NOT NULL,
    quantidade numeric NOT NULL CHECK (quantidade > 0),
    preco_unitario numeric NOT NULL CHECK (preco_unitario >= 0),
    custo_unitario numeric NOT NULL DEFAULT 0,
    total numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS vendas_itens_venda_idx ON public.vendas_itens (venda_id);
CREATE INDEX IF NOT EXISTS vendas_itens_produto_idx ON public.vendas_itens (produto_id);

-- ------------------------------------------------------------
-- Subir/descer o stock numa só instrução.
--
-- Ler o stock, somar e gravar em dois passos perdia unidades quando duas
-- vendas do mesmo produto chegavam ao mesmo tempo. SECURITY INVOKER: corre
-- com as permissões de quem chama, por isso o isolamento entre empresas (RLS)
-- continua a valer.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajustar_stock_produto(p_produto_id bigint, p_delta numeric)
RETURNS numeric
LANGUAGE sql
SECURITY INVOKER
AS $$
    UPDATE public.produtos SET stock = stock + p_delta WHERE id = p_produto_id RETURNING stock;
$$;

-- ------------------------------------------------------------
-- Isolamento entre empresas (o mesmo modelo das Transações)
-- ------------------------------------------------------------
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Empresa gere os seus produtos" ON public.produtos;
CREATE POLICY "Empresa gere os seus produtos" ON public.produtos FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Empresa gere as suas compras de produtos" ON public.produtos_compras;
CREATE POLICY "Empresa gere as suas compras de produtos" ON public.produtos_compras FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Empresa gere as suas vendas" ON public.vendas;
CREATE POLICY "Empresa gere as suas vendas" ON public.vendas FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Empresa gere as linhas das suas vendas" ON public.vendas_itens;
CREATE POLICY "Empresa gere as linhas das suas vendas" ON public.vendas_itens FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));
