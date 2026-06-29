-- ============================================================
-- SCRIPT DE CORREÇÃO - BUSINESSOS
-- Execute este script no SQL Editor do seu Supabase
-- Dashboard: https://supabase.com/dashboard/project/lmxuixmmrglrqxjrhpgn/sql
-- ============================================================

-- ─── 1. Garantir que a tabela perfis existe com as colunas corretas ───────────
CREATE TABLE IF NOT EXISTS public.perfis (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome text,
    email text,
    role text NOT NULL DEFAULT 'pending',
    ativo boolean NOT NULL DEFAULT true,
    empresa_id uuid REFERENCES public.empresas(id),
    ultimo_acesso timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);

-- ─── 2. Garantir que a tabela empresas existe ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empresas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    codigo_convite text UNIQUE,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);

-- ─── 3. Garantir que a tabela configuracoes existe ───────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id),
    chave text NOT NULL,
    valor text,
    atualizado_em timestamp with time zone DEFAULT now(),
    UNIQUE(empresa_id, chave)
);

-- ─── 4. TRIGGER: Criar perfil automaticamente quando um utilizador se regista ─
-- Este trigger garante que cada novo utilizador tem um registo em 'perfis'
-- com role='pending' por defeito (NUNCA superadmin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role text;
BEGIN
    -- Ler o role dos metadados do utilizador (definido no registo)
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'pending');
    
    -- SEGURANÇA: NUNCA permitir que um utilizador se auto-atribua superadmin via registo
    IF v_role = 'superadmin' THEN
        v_role := 'pending';
    END IF;
    
    INSERT INTO public.perfis (id, nome, email, role, ativo)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
        NEW.email,
        v_role,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        nome = COALESCE(EXCLUDED.nome, public.perfis.nome),
        email = COALESCE(EXCLUDED.email, public.perfis.email),
        atualizado_em = now();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recriar o trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 5. RLS (Row Level Security) ─────────────────────────────────────────────
-- Habilitar RLS
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes para recriar
DROP POLICY IF EXISTS "Users can view own profile" ON public.perfis;
DROP POLICY IF EXISTS "Users can update own profile" ON public.perfis;
DROP POLICY IF EXISTS "Service role bypass" ON public.perfis;
DROP POLICY IF EXISTS "Superadmins can view all profiles" ON public.perfis;
DROP POLICY IF EXISTS "Superadmins can update all profiles" ON public.perfis;
DROP POLICY IF EXISTS "Allow read own empresa" ON public.empresas;
DROP POLICY IF EXISTS "Superadmins can manage empresas" ON public.empresas;
DROP POLICY IF EXISTS "Allow read own configuracoes" ON public.configuracoes;

-- Perfis: cada utilizador pode ver e atualizar o seu próprio perfil
CREATE POLICY "Users can view own profile"
    ON public.perfis FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.perfis FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Perfis: superadmin pode ver e gerir todos os perfis
CREATE POLICY "Superadmins can view all profiles"
    ON public.perfis FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis p 
            WHERE p.id = auth.uid() AND p.role = 'superadmin'
        )
    );

CREATE POLICY "Superadmins can update all profiles"
    ON public.perfis FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis p 
            WHERE p.id = auth.uid() AND p.role = 'superadmin'
        )
    );

-- Empresas: utilizador pode ver a sua empresa
CREATE POLICY "Allow read own empresa"
    ON public.empresas FOR SELECT
    USING (
        id IN (
            SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'
        )
    );

-- Empresas: superadmin pode gerir todas
CREATE POLICY "Superadmins can manage empresas"
    ON public.empresas FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'
        )
    );

-- Configurações: permitir leitura para autenticados da mesma empresa
CREATE POLICY "Allow read own configuracoes"
    ON public.configuracoes FOR SELECT
    USING (
        empresa_id IN (
            SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'
        )
    );

-- ─── Tabelas de Reuniões e Tarefas ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reunioes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo text NOT NULL,
    data_hora timestamp with time zone NOT NULL,
    link_jitsi text,
    emails_convidados text,
    estado text DEFAULT 'Agendada',
    transcricao_raw text,
    resumo_ia text,
    pontos_altos jsonb,
    pontos_baixos jsonb,
    recomendacoes jsonb,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reunioes_tarefas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
    reuniao_id uuid REFERENCES public.reunioes(id) ON DELETE CASCADE,
    descricao text NOT NULL,
    responsavel text DEFAULT 'Não definido',
    prazo text DEFAULT 'Sem prazo',
    criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.reunioes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reunioes_tarefas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view reunioes of their company" ON public.reunioes;
CREATE POLICY "Users can view reunioes of their company"
    ON public.reunioes FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Users can manage reunioes of their company" ON public.reunioes;
CREATE POLICY "Users can manage reunioes of their company"
    ON public.reunioes FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Users can view tarefas of their company" ON public.reunioes_tarefas;
CREATE POLICY "Users can view tarefas of their company"
    ON public.reunioes_tarefas FOR SELECT
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "Users can manage tarefas of their company" ON public.reunioes_tarefas;
CREATE POLICY "Users can manage tarefas of their company"
    ON public.reunioes_tarefas FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));


-- ─── 6. CORREÇÃO MANUAL: Definir o utilizador Elves como superadmin ──────────
-- (Substitua pelo email correto se necessário)
UPDATE public.perfis 
SET role = 'superadmin', ativo = true
WHERE email ILIKE '%elves%' OR email ILIKE '%geral@topia%' OR email ILIKE '%agostinho%';

-- Verificar o resultado
SELECT id, nome, email, role, ativo, empresa_id FROM public.perfis;
SELECT id, nome, status, codigo_convite FROM public.empresas;
