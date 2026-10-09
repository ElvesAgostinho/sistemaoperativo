import { supabase } from '../lib/supabaseClient';

/**
 * As pausas longas dos fluxos.
 *
 * O bloco "Aguardar (pausa)" era um temporizador em memória: bastava uma
 * publicação de código a meio da espera para o resto do fluxo nunca acontecer —
 * e ninguém dava por isso, porque não havia erro nenhum, simplesmente não saía
 * mais nada. Era por isso que não se podiam escolher horas nem dias.
 *
 * Agora a espera fica guardada com a hora a que deve continuar, e este serviço
 * retoma o fluxo no bloco seguinte, sobreviva ou não o servidor pelo meio.
 */
export class EsperaFluxoService {

    private static aCorrer = false;

    /** Guarda uma espera. Devolve false se não for possível (migração por correr). */
    public static async guardar(dados: {
        empresaId: any;
        conversationId: string;
        automationId: number | null;
        nodeId: string;
        contexto: Record<string, any>;
        segundos: number;
    }): Promise<boolean> {
        try {
            const retomarEm = new Date(Date.now() + dados.segundos * 1000).toISOString();

            // Uma conversa não pode ficar com duas esperas a correr ao mesmo
            // tempo: a mais recente é a que vale, senão o cliente recebia o
            // fluxo duas vezes a partir de pontos diferentes.
            await supabase.from('fluxo_esperas')
                .update({ estado: 'Cancelado', erro: 'Substituída por uma espera mais recente' })
                .eq('conversation_id', dados.conversationId).eq('estado', 'A_espera');

            const { error } = await supabase.from('fluxo_esperas').insert({
                empresa_id: dados.empresaId,
                conversation_id: dados.conversationId,
                automation_id: dados.automationId,
                node_id: dados.nodeId,
                contexto: dados.contexto || {},
                retomar_em: retomarEm,
                estado: 'A_espera'
            });
            if (error) throw error;
            return true;
        } catch (e: any) {
            console.error('[Espera] Não foi possível guardar a pausa:', e?.message || e);
            return false;
        }
    }

    /**
     * O cliente respondeu enquanto o fluxo estava em pausa? Então a pausa deixa
     * de fazer sentido — seguir com ela era responder a uma conversa que já
     * seguiu noutra direção.
     */
    public static async cancelarDaConversa(conversationId: string, motivo: string): Promise<void> {
        try {
            await supabase.from('fluxo_esperas')
                .update({ estado: 'Cancelado', erro: motivo })
                .eq('conversation_id', conversationId).eq('estado', 'A_espera');
        } catch { /* a conversa continua na mesma */ }
    }

    public static async processarFila(): Promise<void> {
        if (EsperaFluxoService.aCorrer) return;
        EsperaFluxoService.aCorrer = true;
        try {
            const { data: prontas, error } = await supabase.from('fluxo_esperas')
                .select('*').eq('estado', 'A_espera').lte('retomar_em', new Date().toISOString()).limit(25);
            if (error) return;   // tabela ainda não existe — nada a fazer

            for (const espera of (prontas || [])) {
                await EsperaFluxoService.retomar(espera);
            }
        } catch (e) {
            console.error('[Espera] Erro no processamento da fila:', e);
        } finally {
            EsperaFluxoService.aCorrer = false;
        }
    }

    private static async retomar(espera: any): Promise<void> {
        // Marca antes de correr: se o servidor reiniciar a meio, a conversa fica
        // por continuar — nunca continua duas vezes.
        const { data: reservada } = await supabase.from('fluxo_esperas')
            .update({ estado: 'Retomado', retomado_em: new Date().toISOString() })
            .eq('id', espera.id).eq('estado', 'A_espera').select('id');
        if (!reservada || reservada.length === 0) return;

        try {
            const { data: automation } = await supabase.from('automations')
                .select('*').eq('id', espera.automation_id).maybeSingle();
            if (!automation) throw new Error('o fluxo já não existe');

            const { AutomationEngine } = require('./AutomationEngine');
            const { nodes, edges } = AutomationEngine.parseGraph(automation);

            if (!nodes.some((n: any) => n.id === espera.node_id)) {
                throw new Error('o bloco onde o fluxo estava já não existe no desenho');
            }

            await AutomationEngine.executeGraph(
                nodes, edges, espera.node_id, espera.contexto || {}, espera.empresa_id, [automation.id],
                { mensagemDisponivel: false, conversationId: espera.conversation_id, automationId: automation.id }
            );
            console.log(`[Espera] Fluxo "${automation.nome}" retomado na conversa ${espera.conversation_id}.`);
        } catch (e: any) {
            await supabase.from('fluxo_esperas')
                .update({ estado: 'Falhou', erro: String(e?.message || e).slice(0, 400) })
                .eq('id', espera.id);
            console.error(`[Espera] Não foi possível retomar ${espera.id}:`, e?.message || e);
        }
    }
}
