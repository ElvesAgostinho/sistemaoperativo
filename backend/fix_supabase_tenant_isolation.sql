-- ============================================================
-- SCRIPT DE CORREÇÃO — ISOLAMENTO MULTI-EMPRESA (WhatsApp)
-- Execute este script no SQL Editor do seu Supabase
-- Dashboard: https://supabase.com/dashboard/project/lmxuixmmrglrqxjrhpgn/sql
--
-- PROBLEMA CORRIGIDO: as tabelas wa_channels, wa_conversations,
-- wa_messages, wa_templates e wa_audit_logs foram criadas sem
-- coluna empresa_id e sem Row Level Security (RLS). Isto faz com
-- que qualquer utilizador autenticado de QUALQUER empresa consiga
-- ler as conversas e mensagens de WhatsApp de TODAS as empresas.
--
-- ⚠️ AÇÃO MANUAL OBRIGATÓRIA (fora deste script):
-- A Evolution API key encontrada hardcoded em
-- backend/src/services/WhatsAppChannelManager.ts ficou exposta no
-- histórico do git. Depois de aplicar a correção de código, gere
-- uma nova API key no seu servidor Evolution API e atualize a
-- variável de ambiente AUTHENTICATION_API_KEY no backend.
-- ============================================================

-- ─── 1. Adicionar coluna empresa_id às tabelas de WhatsApp ───────────────────
ALTER TABLE public.wa_channels      ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.wa_messages      ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.wa_templates     ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
ALTER TABLE public.wa_audit_logs    ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);

-- ─── 2. Backfill: preencher empresa_id nos dados já existentes ───────────────

-- 2a. wa_channels (Evolution): o instanceName segue o padrão SISTEMA_EMP_<empresa_id>,
--     criado em backend/src/api/whatsappRoutes.ts (rota /evolution/instance).
UPDATE public.wa_channels
SET empresa_id = substring(credentials->>'instanceName' FROM 'SISTEMA_EMP_(.+)')::uuid
WHERE provider = 'evolution'
  AND empresa_id IS NULL
  AND credentials->>'instanceName' LIKE 'SISTEMA_EMP_%';

-- 2b. wa_conversations / wa_messages / wa_templates / wa_audit_logs:
--     herdam a empresa a partir do canal / conversa a que pertencem.
UPDATE public.wa_conversations c
SET empresa_id = ch.empresa_id
FROM public.wa_channels ch
WHERE c.channel_id = ch.id AND c.empresa_id IS NULL;

UPDATE public.wa_messages m
SET empresa_id = c.empresa_id
FROM public.wa_conversations c
WHERE m.conversation_id = c.id AND m.empresa_id IS NULL;

UPDATE public.wa_templates t
SET empresa_id = ch.empresa_id
FROM public.wa_channels ch
WHERE t.channel_id = ch.id AND t.empresa_id IS NULL;

UPDATE public.wa_audit_logs a
SET empresa_id = c.empresa_id
FROM public.wa_conversations c
WHERE a.conversation_id = c.id AND a.empresa_id IS NULL;

-- 2c. Canais Meta (Oficial) não seguem um padrão automático — se existirem
--     linhas de wa_channels com provider='meta' e empresa_id ainda NULL,
--     esta query mostra-as para atribuição manual:
--     SELECT id, name, provider, credentials FROM public.wa_channels WHERE provider = 'meta' AND empresa_id IS NULL;
--     Depois atribua manualmente, por empresa:
--     UPDATE public.wa_channels SET empresa_id = '<uuid-da-empresa>' WHERE id = '<uuid-do-canal>';

-- ─── 3. Triggers: garantir que novas linhas herdam sempre empresa_id ─────────
-- Rede de segurança para o caso de algum código no futuro esquecer de
-- preencher empresa_id manualmente ao inserir.

CREATE OR REPLACE FUNCTION public.wa_conversations_set_empresa_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.empresa_id IS NULL THEN
        SELECT empresa_id INTO NEW.empresa_id FROM public.wa_channels WHERE id = NEW.channel_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_wa_conversations_empresa_id ON public.wa_conversations;
CREATE TRIGGER trg_wa_conversations_empresa_id
    BEFORE INSERT ON public.wa_conversations
    FOR EACH ROW EXECUTE FUNCTION public.wa_conversations_set_empresa_id();

CREATE OR REPLACE FUNCTION public.wa_messages_set_empresa_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.empresa_id IS NULL THEN
        SELECT empresa_id INTO NEW.empresa_id FROM public.wa_conversations WHERE id = NEW.conversation_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_wa_messages_empresa_id ON public.wa_messages;
CREATE TRIGGER trg_wa_messages_empresa_id
    BEFORE INSERT ON public.wa_messages
    FOR EACH ROW EXECUTE FUNCTION public.wa_messages_set_empresa_id();

CREATE OR REPLACE FUNCTION public.wa_templates_set_empresa_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.empresa_id IS NULL THEN
        SELECT empresa_id INTO NEW.empresa_id FROM public.wa_channels WHERE id = NEW.channel_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_wa_templates_empresa_id ON public.wa_templates;
CREATE TRIGGER trg_wa_templates_empresa_id
    BEFORE INSERT ON public.wa_templates
    FOR EACH ROW EXECUTE FUNCTION public.wa_templates_set_empresa_id();

CREATE OR REPLACE FUNCTION public.wa_audit_logs_set_empresa_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.empresa_id IS NULL THEN
        SELECT empresa_id INTO NEW.empresa_id FROM public.wa_conversations WHERE id = NEW.conversation_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_wa_audit_logs_empresa_id ON public.wa_audit_logs;
CREATE TRIGGER trg_wa_audit_logs_empresa_id
    BEFORE INSERT ON public.wa_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.wa_audit_logs_set_empresa_id();

-- ─── 4. Índices (performance dos filtros por empresa_id) ─────────────────────
CREATE INDEX IF NOT EXISTS idx_wa_channels_empresa_id      ON public.wa_channels(empresa_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_empresa_id ON public.wa_conversations(empresa_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_empresa_id      ON public.wa_messages(empresa_id);
CREATE INDEX IF NOT EXISTS idx_wa_templates_empresa_id     ON public.wa_templates(empresa_id);
CREATE INDEX IF NOT EXISTS idx_wa_audit_logs_empresa_id    ON public.wa_audit_logs(empresa_id);

-- ─── 5. Row Level Security: isolar cada empresa aos seus próprios dados ──────
-- Reutiliza a função current_empresa_id() já definida em backend/src/db/schema.sql
ALTER TABLE public.wa_channels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_audit_logs    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.wa_channels;
CREATE POLICY "tenant_isolation" ON public.wa_channels
    FOR ALL USING (empresa_id = public.current_empresa_id()) WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "tenant_isolation" ON public.wa_conversations;
CREATE POLICY "tenant_isolation" ON public.wa_conversations
    FOR ALL USING (empresa_id = public.current_empresa_id()) WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "tenant_isolation" ON public.wa_messages;
CREATE POLICY "tenant_isolation" ON public.wa_messages
    FOR ALL USING (empresa_id = public.current_empresa_id()) WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "tenant_isolation" ON public.wa_templates;
CREATE POLICY "tenant_isolation" ON public.wa_templates
    FOR ALL USING (empresa_id = public.current_empresa_id()) WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "tenant_isolation" ON public.wa_audit_logs;
CREATE POLICY "tenant_isolation" ON public.wa_audit_logs
    FOR ALL USING (empresa_id = public.current_empresa_id()) WITH CHECK (empresa_id = public.current_empresa_id());

-- Nota: os webhooks públicos (/api/whatsapp/webhook/evolution e /webhook/meta) usam
-- o cliente service_role no backend, que continua a bypassar esta RLS — é
-- necessário porque não há sessão de utilizador nesses pedidos. O isolamento
-- nesse caso é garantido no código (backend/src/api/whatsappRoutes.ts), que
-- resolve o canal correto pelo instanceName / phoneNumberId.

-- ─── 6. Corrigir check_invite_code para devolver também a empresa do convite ─
-- A versão anterior desta função (criada fora do controlo de versão) devolvia
-- apenas um boolean, o que impedia o backend de associar o novo funcionário
-- à empresa certa (bug: funcionário ficava com empresa_id NULL, invisível
-- para sempre na lista de aprovação do admin).
DROP FUNCTION IF EXISTS public.check_invite_code(text);
CREATE FUNCTION public.check_invite_code(codigo text)
RETURNS TABLE(valido boolean, empresa_id uuid) AS $$
BEGIN
    RETURN QUERY
    SELECT true, e.id FROM public.empresas e WHERE e.codigo_convite = codigo
    UNION ALL
    SELECT false, NULL::uuid WHERE NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.codigo_convite = codigo)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verificação final
SELECT id, name, provider, empresa_id FROM public.wa_channels;
SELECT count(*) AS conversas_sem_empresa FROM public.wa_conversations WHERE empresa_id IS NULL;
SELECT count(*) AS mensagens_sem_empresa FROM public.wa_messages WHERE empresa_id IS NULL;
