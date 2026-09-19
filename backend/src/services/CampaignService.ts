import { supabase } from '../lib/supabaseClient';
import { WhatsAppChannelManager } from './WhatsAppChannelManager';

interface VariavelConfig {
    tipo: 'campo' | 'fixo';
    campo?: string; // 'nome' | 'empresa' | 'telefone' | chave em custom_fields
    valor?: string; // usado quando tipo === 'fixo'
}

interface Contacto {
    id: number;
    nome: string | null;
    telefone: string;
    empresa: string | null;
    custom_fields: Record<string, any> | null;
}

export class CampaignService {

    // ============================================================
    // Resolve o público-alvo a partir dos contactos (clientes) da empresa —
    // sem tabela de "segmentos" guardados por agora: filtra ao vivo por tags
    // ou por uma lista manual de IDs, ou pega em todos.
    // ============================================================
    public static async resolverPublico(
        empresaId: string,
        publicoTipo: 'todos' | 'tags' | 'manual',
        publicoTags?: string[],
        manualIds?: number[],
        client: any = supabase
    ): Promise<Contacto[]> {
        let query = client.from('clientes').select('id, nome, telefone, empresa, custom_fields').eq('empresa_id', empresaId);

        if (publicoTipo === 'tags' && publicoTags?.length) {
            query = query.overlaps('tags', publicoTags);
        } else if (publicoTipo === 'manual' && manualIds?.length) {
            query = query.in('id', manualIds);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).filter((c: Contacto) => !!c.telefone);
    }

    private static resolverVariaveis(variaveis: Record<string, VariavelConfig>, contacto: Contacto): Record<string, string> {
        const resolvidas: Record<string, string> = {};
        for (const [posicao, cfg] of Object.entries(variaveis || {})) {
            if (cfg.tipo === 'fixo') {
                resolvidas[posicao] = cfg.valor || '';
            } else {
                const campo = cfg.campo || '';
                if (campo === 'nome') resolvidas[posicao] = contacto.nome || '';
                else if (campo === 'telefone') resolvidas[posicao] = contacto.telefone || '';
                else if (campo === 'empresa') resolvidas[posicao] = contacto.empresa || '';
                else resolvidas[posicao] = contacto.custom_fields?.[campo] || '';
            }
        }
        return resolvidas;
    }

    // ============================================================
    // API NÃO OFICIAL (Evolution/QR Code): não há templates aprovados —
    // escreve-se texto livre e as variáveis são resolvidas pelo nome
    // ({{nome}}, {{empresa}}, {{telefone}} ou qualquer campo personalizado),
    // em vez das posições numeradas {{1}}/{{2}} que a Meta obriga.
    // ============================================================
    public static resolverMensagemTexto(mensagem: string, contacto: Contacto): string {
        return (mensagem || '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, chave: string) => {
            const campo = String(chave).toLowerCase();
            if (campo === 'nome') return contacto.nome || '';
            if (campo === 'telefone') return contacto.telefone || '';
            if (campo === 'empresa') return contacto.empresa || '';
            const valor = contacto.custom_fields?.[chave];
            return valor === undefined || valor === null ? '' : String(valor);
        });
    }

    // Ritmo máximo seguro na API não oficial. O número é uma conta pessoal do
    // WhatsApp, não um canal empresarial — disparar em rajada é a forma mais
    // rápida de o ver banido. Mesmo que o utilizador peça mais, cortamos aqui.
    private static readonly MAX_VELOCIDADE_NAO_OFICIAL = 12;

    // ============================================================
    // Cria a campanha em Rascunho e já resolve + grava a lista de
    // destinatários (cada um com as variáveis já preenchidas), para o envio
    // em si (processarFila) não ter de recalcular nada.
    // ============================================================
    public static async criarCampanha(
        empresaId: string,
        channelId: string,
        dados: {
            nome: string; descricao?: string; tipo_api?: 'oficial' | 'nao_oficial';
            template_name?: string; template_language?: string; template_preview?: string; mensagem_texto?: string;
            media_url?: string; media_tipo?: string; media_nome?: string;
            publico_tipo: 'todos' | 'tags' | 'manual'; publico_tags?: string[]; manual_ids?: number[];
            variaveis?: Record<string, VariavelConfig>; agendada_para?: string; velocidade_por_minuto?: number;
        },
        criadoPor: string,
        client: any = supabase
    ) {
        const tipoApi = dados.tipo_api === 'nao_oficial' ? 'nao_oficial' : 'oficial';

        if (tipoApi === 'nao_oficial') {
            // Com multimédia anexada, o texto passa a ser opcional (vai como legenda).
            if (!dados.mensagem_texto?.trim() && !dados.media_url) {
                throw new Error('Escreva a mensagem a enviar ou anexe um ficheiro.');
            }
        } else if (!dados.template_name || !dados.template_language) {
            throw new Error('Escolha um modelo aprovado pela Meta.');
        }

        // O canal tem de ser mesmo do tipo escolhido — sem esta verificação, uma
        // campanha "não oficial" apontada a um canal Meta (ou o contrário) só
        // falharia contacto a contacto, já depois de criada.
        const { data: canal } = await client.from('wa_channels').select('provider').eq('id', channelId).eq('empresa_id', empresaId).maybeSingle();
        if (!canal) throw new Error('Canal de WhatsApp não encontrado.');
        const providerEsperado = tipoApi === 'nao_oficial' ? 'evolution' : 'meta';
        if (canal.provider !== providerEsperado) {
            throw new Error(tipoApi === 'nao_oficial'
                ? 'Este canal é da API oficial (Meta). Ligue um número por QR Code para campanhas não oficiais.'
                : 'Este canal não é da API oficial da Meta.');
        }

        const contactos = await CampaignService.resolverPublico(empresaId, dados.publico_tipo, dados.publico_tags, dados.manual_ids, client);
        if (contactos.length === 0) throw new Error('Nenhum contacto encontrado para este público-alvo.');

        const velocidadePedida = dados.velocidade_por_minuto || (tipoApi === 'nao_oficial' ? 8 : 20);
        const velocidade = tipoApi === 'nao_oficial'
            ? Math.min(velocidadePedida, CampaignService.MAX_VELOCIDADE_NAO_OFICIAL)
            : velocidadePedida;

        const { data: campanha, error } = await client.from('campanhas').insert({
            empresa_id: empresaId,
            channel_id: channelId,
            nome: dados.nome,
            descricao: dados.descricao || null,
            tipo_api: tipoApi,
            template_name: tipoApi === 'oficial' ? dados.template_name : null,
            template_language: tipoApi === 'oficial' ? dados.template_language : null,
            template_preview: tipoApi === 'oficial' ? (dados.template_preview || null) : null,
            mensagem_texto: tipoApi === 'nao_oficial' ? (dados.mensagem_texto?.trim() || null) : null,
            media_url: tipoApi === 'nao_oficial' ? (dados.media_url || null) : null,
            media_tipo: tipoApi === 'nao_oficial' ? (dados.media_tipo || null) : null,
            media_nome: tipoApi === 'nao_oficial' ? (dados.media_nome || null) : null,
            publico_tipo: dados.publico_tipo,
            publico_tags: dados.publico_tags || null,
            variaveis: tipoApi === 'oficial' ? (dados.variaveis || {}) : {},
            estado: dados.agendada_para ? 'Agendada' : 'Rascunho',
            agendada_para: dados.agendada_para || null,
            velocidade_por_minuto: velocidade,
            criado_por: criadoPor,
        }).select('id').single();
        if (error) throw error;

        const destinatarios = contactos.map((c: Contacto) => ({
            campanha_id: campanha.id,
            empresa_id: empresaId,
            cliente_id: c.id,
            nome: c.nome,
            telefone: c.telefone,
            // Tal como nas campanhas oficiais, a mensagem fica já resolvida por
            // contacto no momento da criação — o envio não recalcula nada.
            variaveis_resolvidas: tipoApi === 'nao_oficial'
                ? { texto: CampaignService.resolverMensagemTexto(dados.mensagem_texto || '', c) }
                : CampaignService.resolverVariaveis(dados.variaveis || {}, c),
            estado: 'Pendente',
        }));

        const { error: destError } = await client.from('campanha_destinatarios').insert(destinatarios);
        if (destError) throw destError;

        return { id: campanha.id, totalDestinatarios: destinatarios.length };
    }

    public static async iniciarCampanha(empresaId: string, campanhaId: string, client: any = supabase) {
        const { data: campanha } = await client.from('campanhas').select('*').eq('id', campanhaId).eq('empresa_id', empresaId).single();
        if (!campanha) throw new Error('Campanha não encontrada.');
        if (!['Rascunho', 'Pausada'].includes(campanha.estado)) throw new Error('Só é possível iniciar campanhas em Rascunho ou Pausadas.');

        const imediata = !campanha.agendada_para || new Date(campanha.agendada_para) <= new Date();
        const { error } = await client.from('campanhas').update({
            estado: imediata ? 'Em_Execucao' : 'Agendada',
            iniciada_em: imediata ? new Date().toISOString() : campanha.iniciada_em,
        }).eq('id', campanhaId).eq('empresa_id', empresaId);
        if (error) throw error;
    }

    public static async pausarCampanha(empresaId: string, campanhaId: string, client: any = supabase) {
        const { error } = await client.from('campanhas').update({ estado: 'Pausada' }).eq('id', campanhaId).eq('empresa_id', empresaId).in('estado', ['Agendada', 'Em_Execucao']);
        if (error) throw error;
    }

    public static async cancelarCampanha(empresaId: string, campanhaId: string, client: any = supabase) {
        const { error } = await client.from('campanhas').update({ estado: 'Cancelada' }).eq('id', campanhaId).eq('empresa_id', empresaId).not('estado', 'in', '(Concluida,Cancelada)');
        if (error) throw error;
    }

    public static async getMetrics(empresaId: string, campanhaId: string, client: any = supabase) {
        const { data } = await client.from('campanha_destinatarios').select('estado').eq('campanha_id', campanhaId).eq('empresa_id', empresaId);
        const rows = data || [];
        const contar = (estado: string) => rows.filter((r: any) => r.estado === estado).length;
        return {
            total: rows.length,
            pendente: contar('Pendente'),
            enviada: contar('Enviada'),
            entregue: contar('Entregue'),
            lida: contar('Lida'),
            falhou: contar('Falhou'),
            respondida: contar('Respondida'),
        };
    }

    // ============================================================
    // Poller — chamado periodicamente (ver index.ts). Processa um lote
    // pequeno de destinatários por campanha a cada chamada, respeitando a
    // velocidade configurada, em vez de disparar tudo de uma vez.
    // ============================================================
    // As campanhas não oficiais espaçam cada envio por vários segundos, por isso
    // um ciclo pode demorar mais do que o intervalo do poller (20s). Sem este
    // travão, dois ciclos sobrepostos podiam apanhar os mesmos destinatários
    // ainda "Pendente" e enviar a mesma mensagem duas vezes ao mesmo contacto.
    private static aCorrer = false;

    public static async processarFila() {
        if (CampaignService.aCorrer) return;
        CampaignService.aCorrer = true;
        try {
            const agora = new Date().toISOString();

            // 1. Promover campanhas agendadas cuja hora já chegou
            await supabase.from('campanhas').update({ estado: 'Em_Execucao', iniciada_em: agora })
                .eq('estado', 'Agendada').lte('agendada_para', agora);

            // 2. Processar um lote de cada campanha em execução
            const { data: campanhasAtivas } = await supabase.from('campanhas').select('*').eq('estado', 'Em_Execucao');

            for (const campanha of (campanhasAtivas || [])) {
                await CampaignService.processarLoteDaCampanha(campanha);
            }
        } catch (e) {
            console.error('[CampaignService] Erro no processamento da fila:', e);
        } finally {
            CampaignService.aCorrer = false;
        }
    }

    private static async processarLoteDaCampanha(campanha: any) {
        try {
            // O poller corre a cada 20s (ver index.ts) — um lote de ~1/3 da
            // velocidade/minuto mantém o ritmo aproximado sem rajadas.
            const tamanhoLote = Math.max(1, Math.min(Math.ceil((campanha.velocidade_por_minuto || 20) / 3), 30));

            const { data: pendentes } = await supabase.from('campanha_destinatarios')
                .select('*').eq('campanha_id', campanha.id).eq('estado', 'Pendente').limit(tamanhoLote);

            if (!pendentes || pendentes.length === 0) {
                // Nada pendente — se não há mais ninguém a processar, a campanha terminou.
                const { count: aindaPendentes } = await supabase.from('campanha_destinatarios')
                    .select('*', { count: 'exact', head: true }).eq('campanha_id', campanha.id).eq('estado', 'Pendente');
                if (!aindaPendentes) {
                    await supabase.from('campanhas').update({ estado: 'Concluida', concluida_em: new Date().toISOString() }).eq('id', campanha.id);
                }
                return;
            }

            const naoOficial = campanha.tipo_api === 'nao_oficial';
            for (let i = 0; i < pendentes.length; i++) {
                await CampaignService.enviarParaDestinatario(campanha, pendentes[i]);
                // Intervalo irregular entre envios na API não oficial: um número
                // pessoal a disparar mensagens em intervalos certinhos é o padrão
                // que o WhatsApp deteta e bane. Só entre mensagens, não depois da
                // última — para não segurar o ciclo à toa.
                if (naoOficial && i < pendentes.length - 1) {
                    await new Promise(r => setTimeout(r, 3000 + Math.floor(Math.random() * 5000)));
                }
            }
        } catch (e) {
            console.error(`[CampaignService] Erro a processar lote da campanha ${campanha.id}:`, e);
        }
    }

    private static async enviarParaDestinatario(campanha: any, dest: any) {
        try {
            const variaveis = dest.variaveis_resolvidas || {};

            let resultado: string | boolean;
            if (campanha.tipo_api === 'nao_oficial') {
                const texto = variaveis.texto || campanha.mensagem_texto || '';

                if (campanha.media_url) {
                    // Notas de voz não admitem legenda — o texto, se existir, vai
                    // numa mensagem própria antes do áudio. Nos restantes tipos o
                    // texto segue como legenda da própria multimédia.
                    if (campanha.media_tipo === 'audio' && texto) {
                        await WhatsAppChannelManager.sendMessage(supabase, campanha.channel_id, dest.telefone, texto);
                        await new Promise(r => setTimeout(r, 1500));
                    }
                    resultado = await WhatsAppChannelManager.sendMediaMessage(
                        supabase, campanha.channel_id, dest.telefone, campanha.media_url,
                        campanha.media_nome || 'ficheiro',
                        campanha.media_tipo === 'audio' ? '' : texto
                    );
                } else {
                    resultado = await WhatsAppChannelManager.sendMessage(supabase, campanha.channel_id, dest.telefone, texto);
                }
            } else {
                const bodyParams = Object.keys(variaveis).sort((a, b) => Number(a) - Number(b)).map(k => variaveis[k]);
                resultado = await WhatsAppChannelManager.sendTemplateMessage(
                    supabase, campanha.channel_id, dest.telefone, campanha.template_name, campanha.template_language, bodyParams
                );
            }
            const sucesso = resultado === true || (typeof resultado === 'string' && !resultado.startsWith('ERROR:'));
            const messageId = typeof resultado === 'string' && sucesso ? resultado : null;

            await supabase.from('campanha_destinatarios').update({
                estado: sucesso ? 'Enviada' : 'Falhou',
                message_id: messageId,
                erro: sucesso ? null : (typeof resultado === 'string' ? resultado.replace(/^ERROR: /, '') : 'Falha desconhecida'),
                enviado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
            }).eq('id', dest.id);

            if (sucesso) {
                const texto = variaveis.texto || campanha.mensagem_texto || '';
                const textoEnviado = campanha.tipo_api === 'nao_oficial'
                    ? (campanha.media_url ? `${texto} [MEDIA_URL:${campanha.media_url}]`.trim() : texto)
                    : campanha.template_name;
                await CampaignService.registarNaCaixaDeEntrada(campanha, dest, messageId, textoEnviado);
            }
        } catch (e: any) {
            await supabase.from('campanha_destinatarios').update({
                estado: 'Falhou', erro: e.message || 'Erro inesperado', atualizado_em: new Date().toISOString(),
            }).eq('id', dest.id);
        }
    }

    // Espelha o envio na caixa de entrada normal (wa_conversations/wa_messages)
    // para o histórico de campanha aparecer também na conversa do cliente.
    private static async registarNaCaixaDeEntrada(campanha: any, dest: any, messageId: string | null, textoEnviado: string) {
        try {
            const { data: conv } = await supabase.from('wa_conversations').select('id')
                .eq('channel_id', campanha.channel_id).eq('phone_number', dest.telefone).maybeSingle();

            let conversationId = conv?.id;
            if (!conversationId) {
                const { data: novaConv } = await supabase.from('wa_conversations').insert({
                    channel_id: campanha.channel_id, empresa_id: campanha.empresa_id,
                    phone_number: dest.telefone, contact_name: dest.nome || dest.telefone,
                    status: 'open', last_message_at: new Date().toISOString(),
                }).select('id').single();
                conversationId = novaConv?.id;
            } else {
                await supabase.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
            }
            if (!conversationId) return;

            await supabase.from('wa_messages').insert({
                conversation_id: conversationId, empresa_id: campanha.empresa_id,
                direction: 'outbound', content: `[CAMPANHA] ${campanha.nome}: ${textoEnviado}`,
                status: 'delivered', message_id: messageId,
            });
        } catch (e) {
            console.error('[CampaignService] Erro ao espelhar mensagem de campanha na caixa de entrada:', e);
        }
    }
}
