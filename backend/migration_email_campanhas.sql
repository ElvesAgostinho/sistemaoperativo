-- ============================================================
-- Email: anexos nas mensagens e campanhas em massa
--
-- As campanhas de email seguem o mesmo desenho das de WhatsApp: a campanha
-- guarda o conteúdo uma vez, cada destinatário é uma linha com a sua própria
-- mensagem já resolvida, e um processador em segundo plano envia aos poucos.
-- Assim uma campanha de 2000 pessoas não bloqueia o servidor nem faz o servidor
-- de correio fechar a porta por excesso de ritmo.
-- ============================================================

-- ---------- 1. Anexos nos emails normais ----------
ALTER TABLE emails ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS cc TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS bcc TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS campanha_id UUID;

COMMENT ON COLUMN emails.anexos IS 'Lista de {nome, url, tipo, tamanho} guardados no Storage.';

-- ---------- 2. Campanhas de email ----------
CREATE TABLE IF NOT EXISTS email_campanhas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    assunto TEXT NOT NULL,
    corpo_html TEXT NOT NULL,
    anexos JSONB DEFAULT '[]'::jsonb,
    -- Quem recebe: todos os contactos, os que têm certas etiquetas, uma escolha
    -- à mão, ou uma lista de endereços colada pelo utilizador.
    publico_tipo TEXT NOT NULL DEFAULT 'todos',
    publico_tags TEXT[],
    estado TEXT NOT NULL DEFAULT 'Rascunho',
    agendada_para TIMESTAMPTZ,
    velocidade_por_minuto INT NOT NULL DEFAULT 30,
    criado_por UUID,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    iniciada_em TIMESTAMPTZ,
    concluida_em TIMESTAMPTZ,
    CONSTRAINT email_campanhas_estado_valido
        CHECK (estado IN ('Rascunho', 'Agendada', 'Em_Execucao', 'Pausada', 'Concluida', 'Cancelada')),
    CONSTRAINT email_campanhas_publico_valido
        CHECK (publico_tipo IN ('todos', 'tags', 'manual', 'lista'))
);

CREATE TABLE IF NOT EXISTS email_campanha_destinatarios (
    id BIGSERIAL PRIMARY KEY,
    campanha_id UUID NOT NULL REFERENCES email_campanhas(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_id BIGINT,
    nome TEXT,
    email TEXT NOT NULL,
    assunto_resolvido TEXT,
    corpo_resolvido TEXT,
    estado TEXT NOT NULL DEFAULT 'Pendente',
    erro TEXT,
    enviado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT email_dest_estado_valido CHECK (estado IN ('Pendente', 'Enviado', 'Falhou'))
);

-- O mesmo endereço não pode entrar duas vezes na mesma campanha: é o que evita
-- que um contacto receba a mesma mensagem em duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS email_dest_unico_por_campanha
    ON email_campanha_destinatarios (campanha_id, lower(email));

CREATE INDEX IF NOT EXISTS email_dest_pendentes
    ON email_campanha_destinatarios (campanha_id, estado);
CREATE INDEX IF NOT EXISTS email_campanhas_empresa
    ON email_campanhas (empresa_id, criado_em DESC);

-- ---------- 3. Isolamento por empresa ----------
ALTER TABLE email_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campanha_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_campanhas_da_empresa" ON email_campanhas;
CREATE POLICY "email_campanhas_da_empresa" ON email_campanhas
    FOR ALL USING (
        empresa_id IN (SELECT empresa_id FROM perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'superadmin')
    );

DROP POLICY IF EXISTS "email_dest_da_empresa" ON email_campanha_destinatarios;
CREATE POLICY "email_dest_da_empresa" ON email_campanha_destinatarios
    FOR ALL USING (
        empresa_id IN (SELECT empresa_id FROM perfis WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role = 'superadmin')
    );
