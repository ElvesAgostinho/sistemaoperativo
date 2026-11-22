import { supabase } from '../lib/supabaseClient';

/**
 * Números da Evolution que ficam "ligados" mas não recebem nada.
 *
 * Visto em produção a 22/11/2026: um número com muito movimento passou o dia
 * a aparecer como ligado ("open") e não recebeu UMA mensagem na hora — das
 * 08:34 às 17:45. Só quando alguém o religou é que a Evolution as trouxe todas
 * de uma vez. Leads sem resposta o dia inteiro, e ninguém sabia.
 *
 * De 5 em 5 minutos: um número com muito movimento que está há mais de 3
 * horas calado, durante o dia, é reiniciado — o mesmo que foi feito à mão
 * às 17:45. No máximo uma vez a cada 3 horas por número. O que tiver ficado
 * pelo caminho entra pelo recuperador de mensagens.
 *
 * À noite não se reinicia nada, e o silêncio da noite não conta: às 08:00,
 * "sem mensagens desde ontem à noite" é uma hora de silêncio, não onze —
 * senão todos os números seriam reiniciados todas as manhãs.
 */

const SILENCIO_MAX_MS = 3 * 60 * 60 * 1000;       // 3 horas de dia sem receber nada
const ENTRE_REINICIOS_MS = 3 * 60 * 60 * 1000;    // no máximo 1 reinício a cada 3 h
const CONVERSAS_ATIVAS_MIN = 20;                  // "costuma receber": 20+ conversas com mensagens nos últimos 7 dias
const HORA_INICIO = 7, HORA_FIM = 22;             // de dia, hora de Angola (UTC+1)

export class VigiaCanaisService {
    private static aCorrer = false;
    private static ultimoReinicio = new Map<string, number>();

    /** As 07:00 de hoje em Angola, em milissegundos. */
    public static inicioDoDiaEmAngola(agora = new Date()): number {
        const angola = new Date(agora.getTime() + 3600000);   // UTC+1
        const inicio = Date.UTC(angola.getUTCFullYear(), angola.getUTCMonth(), angola.getUTCDate(), HORA_INICIO, 0, 0);
        return inicio - 3600000;
    }

    /** Hora de Angola (UTC+1, sem horário de verão). */
    public static horaDeAngola(agora = new Date()): number {
        return (agora.getUTCHours() + 1) % 24;
    }

    private static async evolution(metodo: 'GET' | 'POST', caminho: string): Promise<any> {
        const base = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
        const limite = new AbortController();
        const relogio = setTimeout(() => limite.abort(), 20000);
        try {
            const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { apikey: process.env.AUTHENTICATION_API_KEY || '' }, signal: limite.signal });
            return await r.json().catch(() => null);
        } finally {
            clearTimeout(relogio);
        }
    }

    public static async vigiar(agora = new Date()): Promise<string[]> {
        if (this.aCorrer) return [];
        this.aCorrer = true;
        const reiniciados: string[] = [];
        try {
            const hora = this.horaDeAngola(agora);
            if (hora < HORA_INICIO || hora >= HORA_FIM) return [];

            const { data: canais } = await supabase.from('wa_channels')
                .select('id, empresa_id, credentials, status').eq('provider', 'evolution').eq('status', 'connected');

            for (const canal of (canais || [])) {
                try {
                    if (await this.vigiarCanal(canal, agora)) reiniciados.push(canal.id);
                } catch (e: any) {
                    console.error(`[Vigia] Canal ${canal.id}:`, e?.message || e);
                }
            }
        } finally {
            this.aCorrer = false;
        }
        return reiniciados;
    }

    /** Devolve true se reiniciou o número. */
    public static async vigiarCanal(canal: any, agora = new Date()): Promise<boolean> {
        const instancia = canal?.credentials?.instanceName;
        if (!instancia) return false;
        const t = agora.getTime();

        const ultimo = this.ultimoReinicio.get(canal.id) || 0;
        if (t - ultimo < ENTRE_REINICIOS_MS) return false;

        // Costuma receber? Conversas com mensagens do cliente nos últimos 7 dias.
        const seteDias = new Date(t - 7 * 86400000).toISOString();
        const { data: ativas } = await supabase.from('wa_conversations')
            .select('id').eq('channel_id', canal.id).gte('last_client_message_at', seteDias).limit(CONVERSAS_ATIVAS_MIN);
        if (!ativas || ativas.length < CONVERSAS_ATIVAS_MIN) return false;

        // Há quanto tempo não entra nada?
        const { data: ultimaConversa } = await supabase.from('wa_conversations')
            .select('last_client_message_at').eq('channel_id', canal.id).not('last_client_message_at', 'is', null)
            .order('last_client_message_at', { ascending: false }).limit(1).maybeSingle();
        const ultimaEntrada = ultimaConversa?.last_client_message_at ? new Date(ultimaConversa.last_client_message_at).getTime() : 0;
        // O silêncio só se conta a partir das 07:00 de hoje (hora de Angola).
        const inicioDoDia = this.inicioDoDiaEmAngola(agora);
        if (t - Math.max(ultimaEntrada, inicioDoDia) < SILENCIO_MAX_MS) return false;

        // Se a Evolution diz que está desligado, reiniciar não resolve — é
        // preciso ler o código QR, e isso é com quem tem o telemóvel.
        const estado = await this.evolution('GET', `/instance/connectionState/${instancia}`);
        if (estado?.instance?.state !== 'open') return false;

        const r = await this.evolution('POST', `/instance/restart/${instancia}`);
        this.ultimoReinicio.set(canal.id, t);
        const horas = Math.round((t - ultimaEntrada) / 360000) / 10;
        console.warn(`[Vigia] ${instancia}: ${horas} h sem receber mensagens com o número "ligado" — reiniciado (${r?.instance?.state || r?.status || 'pedido enviado'}).`);
        return true;
    }

    /** Só para os testes. */
    public static esquecer(): void { this.ultimoReinicio.clear(); this.aCorrer = false; }
}
