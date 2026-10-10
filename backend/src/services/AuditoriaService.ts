import { supabase } from '../lib/supabaseClient';

/**
 * O registo de quem fez o quê.
 *
 * O ecrã "Ver auditoria" existia e funcionava, mas estava sempre vazio — e
 * estava vazio porque em todo o sistema havia **uma** acção que escrevia aqui:
 * delegar uma conversa a um agente. Tudo o resto (pausar o bot, trocar o
 * fluxo, pôr uma etiqueta, corrigir a ficha do cliente, disparar um fluxo a
 * 300 pessoas) acontecia sem deixar rasto nenhum. Na produção: 97 conversas,
 * zero registos.
 *
 * Um registo de auditoria serve para responder a uma pergunta concreta — "quem
 * mandou esta mensagem ao cliente?", "quem desligou o bot?", "quem apagou a
 * etiqueta?". Por isso o que fica guardado é sempre: quem, o quê, a quem, e o
 * suficiente para se perceber sem ter de adivinhar.
 *
 * Nunca deita o pedido abaixo. Uma falha a registar não pode impedir o
 * trabalho de acontecer — mas fica no log do servidor, porque um registo de
 * auditoria que falha em silêncio é pior do que não ter nenhum.
 */

export type AccaoAuditada =
    | 'conversa_delegada' | 'conversa_devolvida'
    | 'bot_pausado' | 'bot_retomado'
    | 'fluxo_escolhido' | 'fluxo_removido' | 'fluxo_disparado'
    | 'disparo_criado' | 'disparo_iniciado' | 'disparo_pausado' | 'disparo_cancelado' | 'disparo_apagado'
    | 'campanha_email_criada'
    | 'etiqueta_adicionada' | 'etiqueta_removida'
    | 'contacto_editado' | 'historico_importado'
    | 'mensagem_enviada'
    | 'permissoes_alteradas' | 'papel_alterado' | 'utilizador_desativado' | 'utilizador_ativado'
    | 'campanha_iniciada' | 'campanha_pausada' | 'campanha_cancelada';

export interface RegistoAuditoria {
    empresaId: string | null | undefined;
    quemId: string | null | undefined;
    accao: AccaoAuditada;
    /** Frase curta, já escrita para uma pessoa ler. */
    detalhes: string;
    conversationId?: string | null;
    /** Quando a acção é sobre alguém (delegar a, mudar as permissões de). */
    alvoUtilizador?: string | null;
    alvoTipo?: 'conversa' | 'fluxo' | 'utilizador' | 'etiqueta' | 'cliente' | 'campanha' | 'disparo' | null;
    alvoId?: string | number | null;
    extra?: Record<string, any> | null;
}

export class AuditoriaService {

    /**
     * Grava um registo. A empresa vai sempre escrita à mão: havia um gatilho na
     * base de dados que a preenchia a partir da conversa, mas só funcionava
     * para acções que tivessem conversa — e deixava as outras em branco, onde
     * a leitura (que filtra por empresa) nunca mais lhes tocava.
     */
    public static async registar(r: RegistoAuditoria): Promise<void> {
        try {
            if (!r.empresaId) {
                console.warn(`[Auditoria] "${r.accao}" sem empresa — não registado.`);
                return;
            }

            const { error } = await supabase.from('wa_audit_logs').insert({
                empresa_id: r.empresaId,
                conversation_id: r.conversationId || null,
                action: r.accao,
                performed_by: r.quemId || null,
                target_user: r.alvoUtilizador || null,
                alvo_tipo: r.alvoTipo || (r.conversationId ? 'conversa' : null),
                alvo_id: r.alvoId !== undefined && r.alvoId !== null ? String(r.alvoId) : null,
                details: r.detalhes,
                extra: r.extra || null,
            });

            if (error) throw error;
        } catch (e: any) {
            // Em voz alta: um registo perdido em silêncio é pior do que não ter.
            console.error(`[Auditoria] Falhou a registar "${r.accao}":`, e?.message || e);
        }
    }

    /** O que aconteceu numa conversa, do mais recente para trás. */
    public static async daConversa(empresaId: string, conversationId: string, limite = 200): Promise<any[]> {
        const { data, error } = await supabase.from('wa_audit_logs')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(limite);
        if (error) throw new Error(error.message);
        return AuditoriaService.comNomes(data || []);
    }

    /** O que aconteceu na empresa toda. */
    public static async daEmpresa(empresaId: string, limite = 300): Promise<any[]> {
        const { data, error } = await supabase.from('wa_audit_logs')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })
            .limit(limite);
        if (error) throw new Error(error.message);
        return AuditoriaService.comNomes(data || []);
    }

    /**
     * Troca os identificadores pelos nomes das pessoas. Sem isto a auditoria
     * eram linhas de uuid, que não respondem a "quem foi".
     */
    private static async comNomes(linhas: any[]): Promise<any[]> {
        if (linhas.length === 0) return [];

        const ids = [...new Set(
            linhas.flatMap(l => [l.performed_by, l.target_user]).filter(Boolean)
        )];
        if (ids.length === 0) return linhas.map(l => ({ ...l, performed_by_name: 'Sistema', target_user_name: null }));

        let nomes: Record<string, string> = {};
        try {
            const { data } = await supabase.from('perfis').select('id, nome').in('id', ids);
            nomes = (data || []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p.nome }), {});
        } catch { /* sem nomes é melhor do que sem auditoria */ }

        return linhas.map(l => ({
            ...l,
            // Sem autor é porque foi o próprio sistema (um fluxo, um disparo
            // agendado), não um buraco no registo.
            performed_by_name: l.performed_by ? (nomes[l.performed_by] || 'Utilizador removido') : 'Sistema',
            target_user_name: l.target_user ? (nomes[l.target_user] || 'Utilizador removido') : null,
        }));
    }
}
