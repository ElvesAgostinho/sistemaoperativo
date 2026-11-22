import { supabase } from '../lib/supabaseClient';
import { WhatsAppLidService } from './WhatsAppLidService';

/**
 * Mensagens que a Evolution recebeu e o sistema não.
 *
 * Provado a 22/11/2026 no número de um cliente do sistema: 14 mensagens de 3
 * dias estavam na Evolution e não no sistema — nem na conversa, nem a
 * automação lhes respondeu. Acontece quando o WhatsApp não
 * consegue entregar a mensagem legível na hora (fica "a aguardar esta
 * mensagem"): a Evolution só a recebe depois, numa sincronização do
 * histórico, e essas não passam pelo webhook.
 *
 * De 2 em 2 minutos, para cada número ligado: as conversas mexidas há pouco
 * são comparadas com o que o sistema tem, e o que falta entra pelo MESMO
 * caminho do webhook. Uma mensagem com até 10 minutos é tratada como se
 * tivesse acabado de chegar (os fluxos respondem). Um lead de há menos de 6
 * horas a quem ninguém respondeu também é atendido. O resto só entra na
 * conversa — responder agora a uma mensagem de ontem seria fora de tempo.
 *
 * E as conversas "…@lid" (contactos que vieram sem número) juntam-se à do
 * número verdadeiro, quando ele se descobre.
 */

const PRIMEIRA_JANELA_S = 3 * 86400;   // a primeira passagem, depois de publicar, recupera os últimos 3 dias
const JANELA_S = 30 * 60;              // depois, as conversas mexidas na última meia hora
const IDADE_MAXIMA_S = 3 * 86400;      // nunca vai buscar mais atrás do que isto
const RESPONDER_ATE_S = 10 * 60;       // até aqui, os fluxos ainda respondem
const LEAD_SEM_RESPOSTA_S = 6 * 3600;  // um lead que ninguém atendeu ainda é atendido até 6 h depois

type Tratar = (msg: any, instancia: string, opcoes: { soGuardar?: boolean; aguardar?: boolean }) => Promise<boolean>;

export class RecuperarMensagensService {
    private static aCorrer = false;
    private static primeiraPassagem = true;

    /** Quem trata cada mensagem — o mesmo do webhook. Trocável nos testes. */
    public static tratar: Tratar = (msg, instancia, opcoes) => {
        // Lazy: o webhook vive nas rotas, que por sua vez usam os serviços.
        const { tratarMensagemEvolution } = require('../api/whatsappRoutes');
        return tratarMensagemEvolution(msg, instancia, opcoes);
    };

    private static async evolution(caminho: string, corpo: any): Promise<any> {
        const base = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
        const r = await fetch(`${base}${caminho}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: process.env.AUTHENTICATION_API_KEY || '' },
            body: JSON.stringify(corpo || {}),
        });
        return r.json().catch(() => null);
    }

    public static async recuperar(): Promise<{ recuperadas: number; unificadas: number }> {
        if (this.aCorrer) return { recuperadas: 0, unificadas: 0 };
        this.aCorrer = true;
        let recuperadas = 0, unificadas = 0;
        try {
            const { data: canais } = await supabase.from('wa_channels')
                .select('id, empresa_id, credentials, status').eq('provider', 'evolution').eq('status', 'connected');
            const janela = this.primeiraPassagem ? PRIMEIRA_JANELA_S : JANELA_S;
            for (const canal of (canais || [])) {
                try {
                    recuperadas += await this.recuperarCanal(canal, janela);
                    unificadas += await this.unificarConversasLid(canal);
                } catch (e: any) {
                    console.error(`[Recuperar] Canal ${canal.id}:`, e?.message || e);
                }
            }
            this.primeiraPassagem = false;
            if (recuperadas || unificadas) {
                console.log(`[Recuperar] ${recuperadas} mensagem(ns) que não tinham chegado ao sistema; ${unificadas} conversa(s) "@lid" juntas à do número.`);
            }
        } finally {
            this.aCorrer = false;
        }
        return { recuperadas, unificadas };
    }

    public static async recuperarCanal(canal: any, janelaS: number): Promise<number> {
        const instancia = canal?.credentials?.instanceName;
        if (!instancia) return 0;
        const agora = Date.now() / 1000;

        const chats = await this.evolution(`/chat/findChats/${instancia}`, {});
        const recentes = (Array.isArray(chats) ? chats : []).filter((ch: any) => {
            const jid = String(ch?.remoteJid || '');
            if (!jid || /@(g\.us|broadcast|newsletter)$/.test(jid)) return false;
            const mexido = Math.max(Date.parse(ch.updatedAt || '') / 1000 || 0, Number(ch.lastMessage?.messageTimestamp) || 0);
            return mexido >= agora - janelaS;
        }).slice(0, 300);

        let recuperadas = 0;
        for (const ch of recentes) {
            const d = await this.evolution(`/chat/findMessages/${instancia}`, { where: { key: { remoteJid: ch.remoteJid } }, limit: 40, page: 1 });
            const todos: any[] = d?.messages?.records || [];
            // A última vez que alguém respondeu a este contacto — o sistema, ou
            // a pessoa pelo telemóvel (que fica gravado na Evolution na mesma).
            const ultimaResposta = Math.max(0, ...todos.filter((m: any) => m?.key?.fromMe).map((m: any) => Number(m.messageTimestamp) || 0));
            const registos: any[] = todos
                // Só o que ENTROU: o que o sistema enviou está gravado com outro
                // identificador, e trazê-lo outra vez seria duplicar a conversa.
                .filter((m: any) => m?.key?.id && !m.key.fromMe && Number(m.messageTimestamp) >= agora - IDADE_MAXIMA_S);

            // A mesma mensagem pode estar duas vezes (a da hora e a cópia da
            // sincronização). Fica a que traz o número.
            const porId = new Map<string, any>();
            for (const m of registos) {
                const ant = porId.get(m.key.id);
                if (!ant || (!ant.key.remoteJidAlt && m.key.remoteJidAlt)) porId.set(m.key.id, m);
            }
            if (!porId.size) continue;

            const { data: jaTem } = await supabase.from('wa_messages').select('message_id').in('message_id', [...porId.keys()]);
            const gravadas = new Set((jaTem || []).map((x: any) => x.message_id));
            const emFalta = [...porId.values()]
                .filter(m => !gravadas.has(m.key.id))
                .sort((a, b) => Number(a.messageTimestamp) - Number(b.messageTimestamp));

            // Um lead que escreveu há umas horas e a quem NINGUÉM respondeu
            // (nem o sistema, nem a pessoa pelo telemóvel) é atendido agora: uma
            // resposta tardia é melhor do que nenhuma. Só a última mensagem dele,
            // para o fluxo arrancar uma vez — as anteriores entram na conversa.
            const ultimaEmFalta = emFalta[emFalta.length - 1];
            const leadSemResposta = !!ultimaEmFalta
                && agora - Number(ultimaEmFalta.messageTimestamp) <= LEAD_SEM_RESPOSTA_S
                && ultimaResposta < Number(ultimaEmFalta.messageTimestamp);

            for (const m of emFalta) {
                const idade = agora - Number(m.messageTimestamp);
                const responder = idade <= RESPONDER_ATE_S || (leadSemResposta && m === ultimaEmFalta);
                try {
                    if (await this.tratar(m, instancia, { soGuardar: !responder, aguardar: true })) recuperadas++;
                } catch (e: any) {
                    console.error(`[Recuperar] Mensagem ${m.key.id}:`, e?.message || e);
                }
            }
        }
        return recuperadas;
    }

    /**
     * Conversas "…@lid" (o contacto veio sem número) juntam-se à do número
     * verdadeiro quando ele se descobre — eram uma segunda conversa da mesma
     * pessoa, escondida da caixa de conversas.
     */
    public static async unificarConversasLid(canal: any): Promise<number> {
        const instancia = canal?.credentials?.instanceName;
        if (!instancia) return 0;
        const { data: convs } = await supabase.from('wa_conversations')
            .select('id, phone_number, contact_name').eq('channel_id', canal.id).like('phone_number', '%@lid');
        let unificadas = 0;
        for (const c of (convs || [])) {
            const telefone = await WhatsAppLidService.resolver(instancia, c.phone_number);
            if (!telefone) continue;
            const { data: destino } = await supabase.from('wa_conversations')
                .select('id').eq('channel_id', canal.id).eq('phone_number', telefone).maybeSingle();
            if (destino?.id) {
                const { error } = await supabase.from('wa_messages').update({ conversation_id: destino.id }).eq('conversation_id', c.id);
                if (error) { console.error('[Recuperar] Não foi possível mover as mensagens:', error.message); continue; }
                const { error: e2 } = await supabase.from('wa_conversations').delete().eq('id', c.id);
                if (e2) {
                    // Algo ainda aponta para ela (auditoria, por exemplo): fica,
                    // mas vazia e arquivada — já não aparece em duplicado.
                    await supabase.from('wa_conversations').update({ status: 'archived' }).eq('id', c.id);
                }
            } else {
                const nome = String(c.contact_name || '');
                await supabase.from('wa_conversations').update({
                    phone_number: telefone,
                    contact_name: !nome || nome.includes('@lid') || /^[+\d\s()-]+$/.test(nome) ? telefone : nome,
                }).eq('id', c.id);
            }
            unificadas++;
        }
        return unificadas;
    }
}
