-- ============================================================
-- Permissões por funcionário, geridas pelo dono da empresa
--
-- Até agora o que cada pessoa podia ver estava escrito à mão no código do
-- ecrã (ROLE_PERMISSIONS no App.tsx), preso a cinco papéis fixos. O dono não
-- tinha como dizer "este funcionário atende o WhatsApp mas não vê o
-- Financeiro", nem como tirar a alguém o direito de ver a auditoria.
--
-- Pior: nada disto era verificado no servidor. Quem soubesse o endereço podia
-- chamar a API do RH mesmo sendo agente — o ecrã escondia o botão, mas a porta
-- estava aberta.
--
-- Agora cada perfil pode ter a sua lista. Vazio (NULL) quer dizer "usa o que o
-- papel dá por omissão", para as contas que já existem continuarem como estão.
--
-- Correr no SQL Editor do Supabase. Pode ser corrida mais do que uma vez.
-- ============================================================

-- Os módulos que a pessoa abre e as acções que pode fazer lá dentro.
-- Formato: {"modulos": ["wa","crm"], "accoes": ["wa.responder","wa.auditoria"]}
ALTER TABLE public.perfis
    ADD COLUMN IF NOT EXISTS permissoes jsonb;

COMMENT ON COLUMN public.perfis.permissoes IS
    'Permissões próprias deste utilizador. NULL = herda do papel (role). Gerido pelo dono da empresa em Definições > Gestão de Equipa.';

-- Quem mexeu nas permissões de quem, e quando. Uma mudança de permissões é
-- exactamente o tipo de coisa que tem de deixar rasto.
CREATE INDEX IF NOT EXISTS perfis_empresa_idx ON public.perfis (empresa_id);

-- ============================================================
-- Auditoria: a tabela existe, mas só alguma vez foi escrita ao delegar uma
-- conversa. Estas colunas abrem-na ao resto do sistema (fluxos, etiquetas,
-- permissões, disparos) sem a prender ao WhatsApp.
-- ============================================================

ALTER TABLE public.wa_audit_logs
    ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE;

-- O que foi mexido, quando não é uma conversa: um fluxo, um utilizador, uma
-- etiqueta. Guardado como texto porque cada um tem o seu tipo de chave.
ALTER TABLE public.wa_audit_logs
    ADD COLUMN IF NOT EXISTS alvo_tipo text;
ALTER TABLE public.wa_audit_logs
    ADD COLUMN IF NOT EXISTS alvo_id text;

-- O resto do que aconteceu, para se poder explicar depois sem adivinhar.
ALTER TABLE public.wa_audit_logs
    ADD COLUMN IF NOT EXISTS extra jsonb;

-- A conversa deixa de ser obrigatória: há acções que não são de nenhuma.
ALTER TABLE public.wa_audit_logs
    ALTER COLUMN conversation_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS wa_audit_logs_empresa_data_idx
    ON public.wa_audit_logs (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wa_audit_logs_conversa_idx
    ON public.wa_audit_logs (conversation_id, created_at DESC);

-- Preenche a empresa nos registos antigos que a tenham em branco.
UPDATE public.wa_audit_logs a
SET empresa_id = c.empresa_id
FROM public.wa_conversations c
WHERE a.conversation_id = c.id AND a.empresa_id IS NULL;

ALTER TABLE public.wa_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_audit_logs_da_empresa" ON public.wa_audit_logs;
CREATE POLICY "wa_audit_logs_da_empresa" ON public.wa_audit_logs
    FOR ALL USING (
        empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND role = 'superadmin')
    );
