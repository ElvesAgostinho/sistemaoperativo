-- Unifica o recrutamento num só par de tabelas (vagas/candidaturas), usado tanto
-- pelo ecrã interno de RH como pelo portal público de carreiras. Antes desta
-- migração existiam dois pares de tabelas desligados um do outro
-- (vagas/candidaturas vs recrutamento_vagas/recrutamento_candidaturas) — ver
-- plano "Triagem de CVs (IA) -> ATS profissional" para o contexto completo.
-- Nenhum dos dois pares tinha alguma vez sido criado com uma migração
-- rastreada — por isso este ficheiro cria a base de vagas/candidaturas do
-- zero se ainda não existir, antes de as estender.

-- ─── CRIAR AS TABELAS BASE, SE AINDA NÃO EXISTIREM ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.vagas (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    titulo text NOT NULL,
    criterios text,
    estado text NOT NULL DEFAULT 'Aberta',
    criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.candidaturas (
    id SERIAL PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    vaga_id integer REFERENCES public.vagas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    email text,
    telefone text,
    cv_path text,
    cv_texto text,
    ai_score integer,
    ai_parecer text,
    estado text DEFAULT 'Pendente',
    criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.vagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidaturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.vagas;
CREATE POLICY "tenant_isolation" ON public.vagas
    FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'))
    WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "tenant_isolation" ON public.candidaturas;
CREATE POLICY "tenant_isolation" ON public.candidaturas
    FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'))
    WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin'));

-- ─── VAGAS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.vagas ADD COLUMN IF NOT EXISTS departamento text;
ALTER TABLE public.vagas ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'Tempo Inteiro';
ALTER TABLE public.vagas ADD COLUMN IF NOT EXISTS localizacao text;
ALTER TABLE public.vagas ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.vagas ADD COLUMN IF NOT EXISTS salario_min numeric;
ALTER TABLE public.vagas ADD COLUMN IF NOT EXISTS salario_max numeric;
ALTER TABLE public.vagas ADD COLUMN IF NOT EXISTS numero_vagas integer DEFAULT 1;
ALTER TABLE public.vagas ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
COMMENT ON COLUMN public.vagas.estado IS 'Aberta | Pausada | Fechada';

-- ─── CANDIDATURAS ─────────────────────────────────────────────────────────────
ALTER TABLE public.candidaturas ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.candidaturas ADD COLUMN IF NOT EXISTS cv_url text;
ALTER TABLE public.candidaturas ADD COLUMN IF NOT EXISTS etapa text DEFAULT 'Novo';
ALTER TABLE public.candidaturas ADD COLUMN IF NOT EXISTS origem text DEFAULT 'Upload Manual';
ALTER TABLE public.candidaturas ADD COLUMN IF NOT EXISTS reuniao_id uuid REFERENCES public.reunioes(id);
ALTER TABLE public.candidaturas ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE public.candidaturas ADD COLUMN IF NOT EXISTS motivo_rejeicao text;
ALTER TABLE public.candidaturas ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
COMMENT ON COLUMN public.candidaturas.etapa IS 'Novo | Triagem | Entrevista | Oferta | Contratado | Rejeitado';
COMMENT ON COLUMN public.candidaturas.estado IS 'Legado — mantido só para não partir integrações antigas. A UI usa "etapa".';

-- ─── MIGRAR DADOS DAS TABELAS ANTIGAS DO PORTAL PÚBLICO (se existirem) ─────────
-- Nota: os IDs originais de recrutamento_vagas/recrutamento_candidaturas NÃO são
-- preservados de propósito (podem ser de um tipo diferente de vagas/candidaturas,
-- já que nenhum dos dois pares tem uma migração rastreada no repositório). Cada
-- vaga/candidatura pública existente entra como uma linha nova. Isto corre num
-- bloco à parte: se falhar, não desfaz os ADD COLUMN acima.
DO $$
DECLARE
    mapa_vagas jsonb := '{}'::jsonb;
    rv RECORD;
    rc RECORD;
    novo_id integer;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recrutamento_vagas') THEN
        FOR rv IN SELECT * FROM public.recrutamento_vagas LOOP
            INSERT INTO public.vagas (empresa_id, titulo, departamento, tipo, localizacao, descricao, estado, criado_em)
            VALUES (rv.empresa_id, rv.titulo, rv.departamento, rv.tipo, rv.localizacao, rv.descricao,
                    CASE WHEN rv.status = 'aberta' THEN 'Aberta' ELSE 'Fechada' END, rv.created_at)
            RETURNING id INTO novo_id;
            mapa_vagas := mapa_vagas || jsonb_build_object(rv.id::text, novo_id);
        END LOOP;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recrutamento_candidaturas') THEN
        FOR rc IN SELECT * FROM public.recrutamento_candidaturas LOOP
            INSERT INTO public.candidaturas (empresa_id, vaga_id, nome, email, telefone, linkedin_url, cv_url, ai_score, ai_parecer, etapa, origem)
            VALUES (rc.empresa_id, (mapa_vagas ->> rc.vaga_id::text)::integer, rc.nome, rc.email, rc.telefone,
                    rc.linkedin_url, rc.cv_url, rc.ai_score, rc.ai_analysis, 'Novo', 'Portal Público');
        END LOOP;
    END IF;
END $$;
