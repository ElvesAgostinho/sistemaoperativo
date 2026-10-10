import { supabase } from '../lib/supabaseClient';
import { AutomationEngine } from './AutomationEngine';

export interface ContactoAlvo {
    id: number | null;
    nome: string | null;
    telefone: string;
    tags?: string[] | null;
    custom_fields?: Record<string, any> | null;
}

/**
 * Correr um fluxo para muita gente de uma vez.
 *
 * Um fluxo só arrancava quando chegava uma mensagem — quem nunca respondia
 * nunca mais era contactado, e não havia forma de fazer seguimento a um grupo.
 *
 * Segue o desenho das campanhas: o disparo guarda-se uma vez, cada pessoa é uma
 * linha, e um processador em segundo plano corre o fluxo aos poucos. Isto não é
 * cosmética: um número pessoal a disparar centenas de mensagens seguidas é o
 * padrão que o WhatsApp deteta e bane.
 */
export class FluxoDisparoService {

    /** Acima disto o WhatsApp começa a olhar de lado para um número pessoal. */
    private static readonly MAX_POR_MINUTO = 12;
    private static aCorrer = false;

    public static async resolverPublico(
        empresaId: string,
        publicoTipo: 'todos' | 'tags' | 'manual',
        opcoes: { tags?: string[]; manualIds?: number[] },
        client: any = supabase
    ): Promise<ContactoAlvo[]> {
        // "Escolhi pessoas" com a lista vazia quer dizer NINGUEM, nao toda a
        // gente. Antes, um publico 'manual' sem ids — ou 'tags' sem etiquetas —
        // deixava a consulta sem filtro nenhum e apanhava a base de contactos
        // inteira. Num disparo em massa isso e a diferenca entre nao enviar
        // nada e enviar para os 101 contactos da empresa de rajada, que e a
        // forma mais rapida de o numero ser banido pelo WhatsApp.
        if (publicoTipo !== 'todos') {
            const temAlvo = (publicoTipo === 'tags' && opcoes.tags?.length)
                || (publicoTipo === 'manual' && opcoes.manualIds?.length);
            if (!temAlvo) return [];
        }

        let query = client.from('clientes')
            .select('id, nome, telefone, tags, custom_fields, bot_paused').eq('empresa_id', empresaId);

        if (publicoTipo === 'tags' && opcoes.tags?.length) query = query.overlaps('tags', opcoes.tags);
        else if (publicoTipo === 'manual' && opcoes.manualIds?.length) query = query.in('id', opcoes.manualIds);

        const { data, error } = await query;
        if (error) throw error;

        // Sem número não há para onde enviar, e o mesmo número não entra duas vezes.
        const vistos = new Set<string>();
        return (data || [])
            .map((c: any) => ({ ...c, telefone: String(c.telefone || '').replace(/\D/g, '') }))
            .filter((c: any) => c.telefone.length >= 8)
            .filter((c: any) => { if (vistos.has(c.telefone)) return false; vistos.add(c.telefone); return true; });
    }

    public static async criar(
        empresaId: string,
        dados: {
            automation_id: number; nome?: string;
            publico_tipo: 'todos' | 'tags' | 'manual';
            publico_tags?: string[]; manual_ids?: number[];
            velocidade_por_minuto?: number;
        },
        criadoPor: string,
        client: any = supabase
    ) {
        const { data: fluxo } = await client.from('automations')
            .select('id, nome, ativo, nodes, edges').eq('id', dados.automation_id).eq('empresa_id', empresaId).maybeSingle();
        if (!fluxo) throw new Error('Fluxo não encontrado.');

        // Um fluxo sem gatilho ligado a nada não envia nada: mais vale dizê-lo
        // agora do que deixar 300 linhas a falhar uma a uma.
        const nodes = typeof fluxo.nodes === 'string' ? JSON.parse(fluxo.nodes || '[]') : (fluxo.nodes || []);
        const edges = typeof fluxo.edges === 'string' ? JSON.parse(fluxo.edges || '[]') : (fluxo.edges || []);
        const entrada = AutomationEngine.entradaDoFluxo(nodes, edges);
        if (!entrada.nodeId) throw new Error(entrada.erro || 'Não se percebe por onde esse fluxo começa.');

        const contactos = await FluxoDisparoService.resolverPublico(
            empresaId, dados.publico_tipo, { tags: dados.publico_tags, manualIds: dados.manual_ids }, client
        );
        if (contactos.length === 0) throw new Error('Nenhum contacto com telefone neste público-alvo.');

        const velocidade = Math.max(1, Math.min(dados.velocidade_por_minuto || 6, FluxoDisparoService.MAX_POR_MINUTO));

        const { data: disparo, error } = await client.from('fluxo_disparos').insert({
            empresa_id: empresaId,
            automation_id: fluxo.id,
            nome: dados.nome?.trim() || fluxo.nome,
            publico_tipo: dados.publico_tipo,
            publico_tags: dados.publico_tags || null,
            velocidade_por_minuto: velocidade,
            estado: 'Rascunho',
            criado_por: criadoPor
        }).select('id').single();
        if (error) throw error;

        const linhas = contactos.map(c => ({
            disparo_id: disparo.id,
            empresa_id: empresaId,
            cliente_id: c.id,
            nome: c.nome,
            telefone: c.telefone,
            estado: 'Pendente'
        }));
        const { error: errDest } = await client.from('fluxo_disparo_destinatarios').insert(linhas);
        if (errDest) throw errDest;

        return { id: disparo.id, total: linhas.length, fluxo: fluxo.nome };
    }

    public static async iniciar(empresaId: string, id: string, client: any = supabase) {
        const { data: d } = await client.from('fluxo_disparos')
            .select('estado').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
        if (!d) throw new Error('Disparo não encontrado.');
        if (!['Rascunho', 'Pausado'].includes(d.estado)) throw new Error(`Um disparo ${d.estado} não pode ser iniciado.`);
        await client.from('fluxo_disparos')
            .update({ estado: 'Em_Execucao', iniciado_em: new Date().toISOString() })
            .eq('id', id).eq('empresa_id', empresaId);
    }

    public static async pausar(empresaId: string, id: string, client: any = supabase) {
        await client.from('fluxo_disparos').update({ estado: 'Pausado' })
            .eq('id', id).eq('empresa_id', empresaId).eq('estado', 'Em_Execucao');
    }

    public static async cancelar(empresaId: string, id: string, client: any = supabase) {
        await client.from('fluxo_disparos').update({ estado: 'Cancelado' }).eq('id', id).eq('empresa_id', empresaId);
        await client.from('fluxo_disparo_destinatarios')
            .update({ estado: 'Ignorado', erro: 'Disparo cancelado' })
            .eq('disparo_id', id).eq('empresa_id', empresaId).eq('estado', 'Pendente');
    }

    public static async metricas(empresaId: string, id: string, client: any = supabase) {
        const conta = async (estado?: string) => {
            let q = client.from('fluxo_disparo_destinatarios')
                .select('id', { count: 'exact', head: true }).eq('disparo_id', id).eq('empresa_id', empresaId);
            if (estado) q = q.eq('estado', estado);
            const { count } = await q;
            return count || 0;
        };
        const [total, enviados, falhados, pendentes, ignorados] = await Promise.all([
            conta(), conta('Enviado'), conta('Falhou'), conta('Pendente'), conta('Ignorado')
        ]);
        return { total, enviados, falhados, pendentes, ignorados };
    }

    // ============================================================
    // Processamento em segundo plano
    // ============================================================
    public static async processarFila() {
        if (FluxoDisparoService.aCorrer) return;
        FluxoDisparoService.aCorrer = true;
        try {
            const { data: ativos } = await supabase.from('fluxo_disparos').select('*').eq('estado', 'Em_Execucao');
            for (const disparo of (ativos || [])) {
                await FluxoDisparoService.processarLote(disparo);
            }
        } catch (e) {
            console.error('[FluxoDisparo] Erro no processamento da fila:', e);
        } finally {
            FluxoDisparoService.aCorrer = false;
        }
    }

    private static async processarLote(disparo: any) {
        try {
            // O poller corre a cada 20 segundos.
            const tamanhoLote = Math.max(1, Math.ceil((disparo.velocidade_por_minuto || 6) / 3));

            const { data: pendentes } = await supabase.from('fluxo_disparo_destinatarios')
                .select('*').eq('disparo_id', disparo.id).eq('estado', 'Pendente').limit(tamanhoLote);

            if (!pendentes || pendentes.length === 0) {
                const { count } = await supabase.from('fluxo_disparo_destinatarios')
                    .select('id', { count: 'exact', head: true }).eq('disparo_id', disparo.id).eq('estado', 'Pendente');
                if (!count) {
                    await supabase.from('fluxo_disparos')
                        .update({ estado: 'Concluido', concluido_em: new Date().toISOString() }).eq('id', disparo.id);
                    console.log(`[FluxoDisparo] "${disparo.nome}" concluído.`);
                }
                return;
            }

            const { data: fluxo } = await supabase.from('automations')
                .select('*').eq('id', disparo.automation_id).maybeSingle();
            if (!fluxo) {
                await supabase.from('fluxo_disparos').update({ estado: 'Cancelado' }).eq('id', disparo.id);
                console.error(`[FluxoDisparo] O fluxo do disparo "${disparo.nome}" já não existe — disparo cancelado.`);
                return;
            }

            for (let i = 0; i < pendentes.length; i++) {
                await FluxoDisparoService.correrPara(disparo, fluxo, pendentes[i]);
                // Intervalo irregular entre pessoas: um número a enviar em
                // intervalos certinhos é o padrão que o WhatsApp deteta.
                if (i < pendentes.length - 1) {
                    await new Promise(r => setTimeout(r, 3000 + Math.floor(Math.random() * 5000)));
                }
            }
        } catch (e) {
            console.error(`[FluxoDisparo] Erro no lote do disparo ${disparo.id}:`, e);
        }
    }

    private static async correrPara(disparo: any, fluxo: any, destinatario: any) {
        // Marca antes de correr: se o servidor reiniciar a meio, o pior que
        // acontece é esta pessoa não receber — nunca receber duas vezes.
        const { data: reservado } = await supabase.from('fluxo_disparo_destinatarios')
            .update({ estado: 'Enviado', enviado_em: new Date().toISOString() })
            .eq('id', destinatario.id).eq('estado', 'Pendente').select('id');
        if (!reservado || reservado.length === 0) return;

        try {
            const { data: cliente } = await supabase.from('clientes')
                .select('id, tags, custom_fields, bot_paused')
                .eq('empresa_id', disparo.empresa_id).eq('telefone', destinatario.telefone).maybeSingle();

            // Quem tem o bot pausado foi pausado por alguém, de propósito.
            if (cliente?.bot_paused) {
                await supabase.from('fluxo_disparo_destinatarios')
                    .update({ estado: 'Ignorado', erro: 'O bot está pausado para este cliente', enviado_em: null })
                    .eq('id', destinatario.id);
                return;
            }

            const conversationId = await FluxoDisparoService.conversaDe(disparo.empresa_id, destinatario);
            if (!conversationId) throw new Error('não há conversa de WhatsApp com este número, e não foi possível criar uma');

            const r = await AutomationEngine.correrFluxoNaConversa(
                fluxo, conversationId,
                { phone_number: destinatario.telefone, contact_name: destinatario.nome || '', content: '', channel_id: '' },
                disparo.empresa_id,
                { clienteId: cliente?.id, tags: cliente?.tags || [], customFields: cliente?.custom_fields || {} },
                { mensagemDisponivel: false }
            );
            if (!r.ok) throw new Error(r.erro || 'o fluxo não chegou a correr');

            // Quem foi atendido por este fluxo continua com ele.
            await supabase.from('wa_conversations').update({
                automation_escolhida_id: fluxo.id,
                automation_escolhida_em: new Date().toISOString()
            }).eq('id', conversationId);

            await supabase.from('fluxo_disparo_destinatarios')
                .update({ conversation_id: conversationId }).eq('id', destinatario.id);
        } catch (e: any) {
            await supabase.from('fluxo_disparo_destinatarios')
                .update({ estado: 'Falhou', erro: String(e?.message || e).slice(0, 400), enviado_em: null })
                .eq('id', destinatario.id);
            console.error(`[FluxoDisparo] Falhou para ${destinatario.telefone}:`, e?.message || e);
        }
    }

    /**
     * A conversa deste número. Se ainda não houver nenhuma — um contacto que
     * veio do CRM e nunca escreveu — cria-se, senão o fluxo não teria onde
     * assentar nem ficaria registo do que foi enviado.
     */
    private static async conversaDe(empresaId: string, destinatario: any): Promise<string | null> {
        const { data: existente } = await supabase.from('wa_conversations')
            .select('id').eq('empresa_id', empresaId).eq('phone_number', destinatario.telefone).maybeSingle();
        if (existente) return existente.id;

        const { data: canal } = await supabase.from('wa_channels')
            .select('id, status').eq('empresa_id', empresaId);
        const lista: any[] = Array.isArray(canal) ? canal : (canal ? [canal] : []);
        const escolhido = lista.find(c => c.status === 'connected') || lista[0];
        if (!escolhido) return null;

        const { data: nova } = await supabase.from('wa_conversations').insert({
            empresa_id: empresaId,
            channel_id: escolhido.id,
            phone_number: destinatario.telefone,
            contact_name: destinatario.nome || destinatario.telefone,
            status: 'open',
            last_message_at: new Date().toISOString()
        }).select('id').single();
        return nova?.id || null;
    }
}
