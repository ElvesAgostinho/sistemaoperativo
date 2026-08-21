import OpenAI from 'openai';
import { supabase } from '../lib/supabaseClient';
import { WhatsAppChannelManager } from './WhatsAppChannelManager';

function getOpenAI(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return new OpenAI({ apiKey });
}

interface IncomingGroupMessage {
    channelId: string;
    groupJid: string;
    senderJid: string;
    senderName: string;
    content: string;
    messageId?: string;
}

export class WhatsAppGroupService {

    // ============================================================
    // Mensagem recebida num grupo — só é guardada/processada se o
    // grupo estiver registado e com monitorizar=true (opt-in explícito
    // do dono, para não guardar conversas de grupos irrelevantes).
    // ============================================================
    public static async handleIncomingMessage(msg: IncomingGroupMessage): Promise<void> {
        if (!msg.content?.trim()) return;

        const { data: grupo } = await supabase.from('wa_grupos')
            .select('*').eq('channel_id', msg.channelId).eq('group_jid', msg.groupJid).maybeSingle();
        if (!grupo || !grupo.monitorizar) return;

        await supabase.from('wa_grupo_mensagens').insert({
            grupo_id: grupo.id,
            empresa_id: grupo.empresa_id,
            remetente_jid: msg.senderJid,
            remetente_nome: msg.senderName || msg.senderJid,
            conteudo: msg.content,
            direction: 'inbound',
            message_id: msg.messageId || null,
        });

        if (grupo.resposta_automatica_ativa) {
            await WhatsAppGroupService.tentarResponderAutomaticamente(grupo, msg);
        }
    }

    // ============================================================
    // Decide se deve responder e, se sim, envia a resposta — com
    // limites anti-spam: cooldown por remetente e teto de respostas/hora
    // por grupo.
    // ============================================================
    private static async tentarResponderAutomaticamente(grupo: any, msg: IncomingGroupMessage): Promise<void> {
        try {
            const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { count: respostasNaUltimaHora } = await supabase.from('wa_grupo_mensagens')
                .select('*', { count: 'exact', head: true })
                .eq('grupo_id', grupo.id).eq('direction', 'outbound').gte('criado_em', umaHoraAtras);
            if ((respostasNaUltimaHora || 0) >= (grupo.respostas_max_hora || 20)) {
                console.log(`[WhatsAppGroupService] Teto de respostas/hora atingido para o grupo ${grupo.nome}.`);
                return;
            }

            const cooldownAtras = new Date(Date.now() - (grupo.cooldown_min || 10) * 60 * 1000).toISOString();
            const { data: respostaRecente } = await supabase.from('wa_grupo_mensagens')
                .select('id').eq('grupo_id', grupo.id).eq('direction', 'outbound')
                .eq('respondendo_a_jid', msg.senderJid).gte('criado_em', cooldownAtras).limit(1).maybeSingle();
            if (respostaRecente) {
                console.log(`[WhatsAppGroupService] Cooldown ativo para ${msg.senderName} no grupo ${grupo.nome}.`);
                return;
            }

            const classificacao = await WhatsAppGroupService.classificarMensagem(grupo.contexto_negocio || '', msg.content);
            if (!classificacao.deve_responder || !classificacao.resposta) return;

            const textoFinal = msg.senderName ? `${classificacao.resposta}` : classificacao.resposta;
            const enviado = await WhatsAppChannelManager.sendMessage(supabase, grupo.channel_id, grupo.group_jid, textoFinal);

            await supabase.from('wa_grupo_mensagens').insert({
                grupo_id: grupo.id,
                empresa_id: grupo.empresa_id,
                remetente_jid: null,
                remetente_nome: 'Assistente IA',
                conteudo: textoFinal,
                direction: 'outbound',
                respondendo_a_jid: msg.senderJid,
                message_id: typeof enviado === 'string' && !enviado.startsWith('ERROR:') ? enviado : null,
            });
        } catch (e) {
            console.error('[WhatsAppGroupService] Erro ao tentar responder automaticamente:', e);
        }
    }

    // ============================================================
    // Classificação leve via IA: só responde a mensagens que sejam
    // claramente uma pergunta/interesse de cliente dirigida ao negócio
    // (preço, disponibilidade, encomenda, entrega, pagamento). Ignora
    // conversa geral entre membros do grupo para não spammar.
    // ============================================================
    public static async classificarMensagem(contextoNegocio: string, mensagem: string): Promise<{ deve_responder: boolean; resposta: string | null; motivo?: string }> {
        const openai = getOpenAI();
        if (!openai) return { deve_responder: false, resposta: null, motivo: 'OPENAI_API_KEY não configurada' };

        const systemPrompt = `
Você é o assistente de vendas de um negócio que usa um grupo de WhatsApp para vender produtos/serviços.
Informação do negócio (catálogo, preços, condições) fornecida pelo dono:
"""
${contextoNegocio || '(o dono ainda não configurou informação sobre o negócio)'}
"""

A sua única tarefa é decidir se uma mensagem recebida no grupo é uma pergunta/interesse genuíno de um
cliente dirigido ao negócio (ex: preço, disponibilidade, tamanhos, cores, como encomendar, formas de
pagamento, entrega/envio, horários). Só nesse caso deve responder.

NÃO responda a: conversa geral entre membros, cumprimentos sem pergunta, spam, mensagens de outros
membros a vender coisas diferentes, discussões não relacionadas, ou qualquer coisa que não seja uma
pergunta clara ao negócio. Na dúvida, NÃO responda (deve_responder: false).

Quando responder: seja breve (1-3 frases), simpático, direto, em português. Use a informação do negócio
fornecida acima. Se a pergunta não estiver coberta por essa informação, convide a pessoa a enviar mensagem
privada para mais detalhes, mas não invente preços ou dados que não lhe foram dados.

Responda SEMPRE em JSON: { "deve_responder": boolean, "resposta": string ou null, "motivo": string curta }`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: mensagem },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3,
            });
            const parsed = JSON.parse(response.choices[0].message.content || '{}');
            return {
                deve_responder: !!parsed.deve_responder,
                resposta: parsed.resposta || null,
                motivo: parsed.motivo,
            };
        } catch (e) {
            console.error('[WhatsAppGroupService] Erro na classificação IA:', e);
            return { deve_responder: false, resposta: null, motivo: 'erro na IA' };
        }
    }

    // ============================================================
    // Resumo executivo do grupo num período — pensado para o dono do
    // negócio ver de relance quem perguntou o quê, sem ler tudo.
    // ============================================================
    public static async gerarResumo(empresaId: string, grupoId: string, horasAtras: number = 24, client: any = supabase) {
        const desde = new Date(Date.now() - horasAtras * 60 * 60 * 1000);
        const { data: mensagens } = await client.from('wa_grupo_mensagens')
            .select('remetente_nome, conteudo, direction, criado_em')
            .eq('grupo_id', grupoId).eq('empresa_id', empresaId)
            .gte('criado_em', desde.toISOString())
            .order('criado_em', { ascending: true });

        const totalMensagens = (mensagens || []).filter((m: any) => m.direction === 'inbound').length;

        if (totalMensagens === 0) {
            const resumo = {
                grupo_id: grupoId, empresa_id: empresaId,
                periodo_inicio: desde.toISOString(), periodo_fim: new Date().toISOString(),
                resumo: 'Sem mensagens novas neste período.', leads: [], reclamacoes: [], total_mensagens: 0,
            };
            const { data: saved } = await client.from('wa_grupo_resumos').insert(resumo).select('*').single();
            return saved || resumo;
        }

        const openai = getOpenAI();
        if (!openai) throw new Error('OPENAI_API_KEY não configurada no servidor.');

        const transcript = (mensagens || [])
            .map((m: any) => `${m.direction === 'outbound' ? '[Assistente]' : m.remetente_nome || 'Desconhecido'}: ${m.conteudo}`)
            .join('\n');

        const systemPrompt = `
Você é um analista de vendas que resume a atividade de um grupo de WhatsApp usado por um negócio para
vender produtos/serviços. Vai receber a transcrição das mensagens do período. Produza um resumo executivo
útil para o dono do negócio, focado em oportunidades de venda e problemas a resolver.

Responda em JSON:
{
  "resumo": "resumo executivo em 3-6 frases, em português, direto ao ponto",
  "leads": [ { "nome": "quem perguntou", "pergunta": "o que perguntou/pediu", "tipo": "preco|disponibilidade|encomenda|entrega|outro" } ],
  "reclamacoes": [ { "nome": "quem reclamou", "assunto": "do que se queixou" } ]
}
Só inclua em "leads" pessoas com intenção de compra real (perguntas de preço, disponibilidade, encomenda,
entrega, pagamento). Não inclua conversa geral. Se não houver nenhum lead ou reclamação, devolva arrays vazios.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Transcrição do grupo (últimas ${horasAtras}h):\n\n${transcript}` },
            ],
            response_format: { type: 'json_object' },
        });

        const parsed = JSON.parse(response.choices[0].message.content || '{}');
        const resumoRow = {
            grupo_id: grupoId, empresa_id: empresaId,
            periodo_inicio: desde.toISOString(), periodo_fim: new Date().toISOString(),
            resumo: parsed.resumo || 'Sem resumo disponível.',
            leads: parsed.leads || [], reclamacoes: parsed.reclamacoes || [],
            total_mensagens: totalMensagens,
        };

        const { data: saved, error } = await client.from('wa_grupo_resumos').insert(resumoRow).select('*').single();
        if (error) throw error;
        return saved;
    }
}
