-- ============================================================
-- Etiquetas a sério (catálogo por empresa)
--
-- Até agora as etiquetas eram texto livre escrito à mão em cada sítio: no nó do
-- Autopilot, nas campanhas, no CRM. Escrever "cliente" numa altura e "Cliente"
-- noutra criava duas etiquetas diferentes sem ninguém dar por isso, e a lista
-- que aparecia era só "tudo o que já foi escrito nalgum cliente".
--
-- Passa a haver uma lista verdadeira, por empresa, com cor e com nome único
-- (sem distinguir maiúsculas). As etiquetas que já existem nos contactos são
-- recolhidas para cá, para não se perder nada.
--
-- Correr no SQL Editor do Supabase. Pode ser corrida mais do que uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.etiquetas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome text NOT NULL,
    cor text NOT NULL DEFAULT '#0E5A6B',
    descricao text,
    criado_em timestamptz DEFAULT now(),
    criado_por uuid
);

-- "VIP" e "vip" são a mesma etiqueta. Sem isto voltávamos ao problema de origem.
CREATE UNIQUE INDEX IF NOT EXISTS etiquetas_nome_unico_por_empresa
    ON public.etiquetas (empresa_id, lower(nome));

CREATE INDEX IF NOT EXISTS etiquetas_empresa_idx ON public.etiquetas (empresa_id, nome);

-- ---------- Recolher o que já existe nos contactos ----------
INSERT INTO public.etiquetas (empresa_id, nome)
SELECT DISTINCT c.empresa_id, trim(t) AS nome
FROM public.clientes c, unnest(c.tags) AS t
WHERE c.empresa_id IS NOT NULL
  AND trim(t) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM public.etiquetas e
      WHERE e.empresa_id = c.empresa_id AND lower(e.nome) = lower(trim(t))
  )
ON CONFLICT DO NOTHING;

-- ---------- Isolamento por empresa ----------
ALTER TABLE public.etiquetas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "etiquetas_da_empresa" ON public.etiquetas;
CREATE POLICY "etiquetas_da_empresa" ON public.etiquetas
    FOR ALL USING (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    );
