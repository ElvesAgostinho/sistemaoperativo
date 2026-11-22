import { supabase } from '../lib/supabaseClient';

/**
 * Quem tem o WhatsApp desligado.
 *
 * Um número desligado não recebe nada: nem a conversa, nem a automação. Uma
 * empresa ficou assim um mês sem ninguém dar por isso — o estado só se via
 * dentro de "Gestão de Canais", que ninguém abre no dia a dia.
 *
 * - Para cada empresa: o ecrã das conversas mostra uma faixa vermelha (ver a
 *   rota /evolution/instance/state, que devolve a última mensagem recebida).
 * - Para o dono da plataforma (superadmin): um email quando o número de um
 *   cliente se desliga, um resumo por dia enquanto houver desligados, e a lista
 *   no painel de super administrador (estadoDeTodos).
 *
 * Um número que NUNCA chegou a ligar aparece na lista e no resumo, mas não dá
 * o aviso de "desligou-se" — não se desligou, nunca esteve ligado.
 */

export type EstadoWhatsApp = 'ligado' | 'desligado' | 'nunca_ligado';

export interface LinhaEstado {
    empresaId: string;
    empresa: string;
    canalId: string;
    instancia: string;
    numero: string | null;
    estado: EstadoWhatsApp;
    desligadoDesde: string | null;      // quando o sistema o viu desligar-se
    ultimaMensagemRecebida: string | null;
}

const HORA_RESUMO = 8;   // hora de Angola a partir da qual sai o resumo do dia
const CHAVE_RESUMO = 'whatsapp_desligados_resumo_em';

const soDigitos = (jid?: string | null) => String(jid || '').split('@')[0].replace(/\D/g, '') || null;
const quando = (iso?: string | null) => {
    if (!iso) return 'nunca';
    const d = new Date(new Date(iso).getTime() + 3600000);   // hora de Angola
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} às ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export class AvisoWhatsAppDesligadoService {
    private static aCorrer = false;
    private static resumoEnviadoEm: string | null = null;

    /** As instâncias na Evolution, de uma vez: nome → estado e número. */
    private static async instancias(): Promise<Map<string, { estado: string; numero: string | null }> | null> {
        try {
            const base = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
            const limite = new AbortController();
            const relogio = setTimeout(() => limite.abort(), 20000);
            const r = await fetch(`${base}/instance/fetchInstances`, { headers: { apikey: process.env.AUTHENTICATION_API_KEY || '' }, signal: limite.signal });
            clearTimeout(relogio);
            const lista = await r.json();
            if (!Array.isArray(lista)) return null;
            const mapa = new Map<string, { estado: string; numero: string | null }>();
            for (const i of lista) {
                const nome = i?.name || i?.instance?.instanceName;
                if (nome) mapa.set(nome, { estado: i?.connectionStatus || i?.instance?.status || 'close', numero: soDigitos(i?.ownerJid) });
            }
            return mapa;
        } catch {
            return null;   // sem resposta da Evolution: não se conclui nada
        }
    }

    /** O estado do WhatsApp de todas as empresas (para o painel de super administrador). */
    public static async estadoDeTodos(): Promise<LinhaEstado[]> {
        const instancias = await this.instancias();
        const { data: canais } = await supabase.from('wa_channels')
            .select('id, empresa_id, status, credentials, empresas(nome)').eq('provider', 'evolution');
        const linhas: LinhaEstado[] = [];
        for (const c of (canais || []) as any[]) {
            const instancia = c.credentials?.instanceName || '';
            const evo = instancias?.get(instancia);
            const numero = evo?.numero || null;
            const ligado = evo ? evo.estado === 'open' : c.status === 'connected';
            const { data: ultima } = await supabase.from('wa_conversations')
                .select('last_client_message_at').eq('channel_id', c.id).not('last_client_message_at', 'is', null)
                .order('last_client_message_at', { ascending: false }).limit(1).maybeSingle();
            linhas.push({
                empresaId: c.empresa_id,
                empresa: c.empresas?.nome || c.empresa_id,
                canalId: c.id,
                instancia,
                numero,
                estado: ligado ? 'ligado' : (numero ? 'desligado' : 'nunca_ligado'),
                desligadoDesde: ligado ? null : (c.credentials?.desligado_desde || null),
                ultimaMensagemRecebida: ultima?.last_client_message_at || null,
            });
        }
        // Primeiro os que precisam de atenção.
        const peso: Record<EstadoWhatsApp, number> = { desligado: 0, nunca_ligado: 1, ligado: 2 };
        return linhas.sort((a, b) => peso[a.estado] - peso[b.estado] || a.empresa.localeCompare(b.empresa));
    }

    /** De 5 em 5 minutos. */
    public static async vigiar(agora = new Date()): Promise<{ desligouSe: string[]; resumoEnviado: boolean }> {
        if (this.aCorrer) return { desligouSe: [], resumoEnviado: false };
        this.aCorrer = true;
        const desligouSe: string[] = [];
        let resumoEnviado = false;
        try {
            const instancias = await this.instancias();
            if (!instancias) return { desligouSe, resumoEnviado };

            const { data: canais } = await supabase.from('wa_channels')
                .select('id, empresa_id, status, credentials, empresas(nome)').eq('provider', 'evolution');
            for (const c of (canais || []) as any[]) {
                const instancia = c.credentials?.instanceName;
                const evo = instancia ? instancias.get(instancia) : undefined;
                if (!evo) continue;
                const ligado = evo.estado === 'open';
                const credenciais = { ...(c.credentials || {}) };

                if (ligado) {
                    // Voltou: limpa as marcas e o estado.
                    if (credenciais.desligado_desde || credenciais.desligado_antes || c.status !== 'connected') {
                        delete credenciais.desligado_desde;
                        delete credenciais.desligado_antes;
                        await supabase.from('wa_channels').update({ status: 'connected', credentials: credenciais }).eq('id', c.id);
                    }
                    continue;
                }

                // Desligado — e já se sabia, ou nunca esteve ligado (não tem número).
                if (!evo.numero || credenciais.desligado_desde || credenciais.desligado_antes) {
                    if (c.status !== 'disconnected') await supabase.from('wa_channels').update({ status: 'disconnected' }).eq('id', c.id);
                    continue;
                }

                // É agora que se desligou? Estava ligado, ou recebeu mensagens há
                // pouco. Um número parado há semanas (o caso que levou a isto) não
                // "acabou de se desligar" — entra no resumo do dia, sem alarme.
                const { data: ultima } = await supabase.from('wa_conversations')
                    .select('last_client_message_at').eq('channel_id', c.id).not('last_client_message_at', 'is', null)
                    .order('last_client_message_at', { ascending: false }).limit(1).maybeSingle();
                const recebeuHaPouco = !!ultima?.last_client_message_at
                    && agora.getTime() - new Date(ultima.last_client_message_at).getTime() < 48 * 3600000;
                if (c.status === 'connected' || recebeuHaPouco) {
                    credenciais.desligado_desde = agora.toISOString();
                    desligouSe.push(c.empresas?.nome || c.empresa_id);
                } else {
                    credenciais.desligado_antes = true;
                }
                await supabase.from('wa_channels').update({ status: 'disconnected', credentials: credenciais }).eq('id', c.id);
            }

            if (desligouSe.length) {
                await this.avisarSuperadmins(
                    desligouSe.length === 1 ? `O WhatsApp de ${desligouSe[0]} desligou-se` : `${desligouSe.length} clientes com o WhatsApp desligado`,
                    `Acabou de se desligar: ${desligouSe.join(', ')}.\n\nEnquanto estiver desligado, as mensagens dos clientes não chegam ao sistema e a automação não responde. Para voltar a ligar, a empresa tem de ler o código QR em WhatsApp → Gestão de Canais.`,
                );
            }

            resumoEnviado = await this.resumoDoDia(agora);
        } finally {
            this.aCorrer = false;
        }
        return { desligouSe, resumoEnviado };
    }

    /** Uma vez por dia, a partir das 08:00 de Angola, se houver algum desligado. */
    private static async resumoDoDia(agora: Date): Promise<boolean> {
        const angola = new Date(agora.getTime() + 3600000);
        if (angola.getUTCHours() < HORA_RESUMO) return false;
        const hoje = angola.toISOString().slice(0, 10);

        // Duas marcas: a da base de dados (sobrevive a uma publicação) e a de
        // memória (se a gravação falhar, o resumo não sai de 5 em 5 minutos).
        if (this.resumoEnviadoEm === hoje) return false;
        const { data: marca } = await supabase.from('configuracoes_sistema')
            .select('valor').is('empresa_id', null).eq('chave', CHAVE_RESUMO).maybeSingle();
        if (marca?.valor === hoje) { this.resumoEnviadoEm = hoje; return false; }
        this.resumoEnviadoEm = hoje;

        const todos = await this.estadoDeTodos();
        const parados = todos.filter(l => l.estado !== 'ligado');

        // A marca do dia fica gravada mesmo sem desligados: assim não se volta a
        // ver o estado de toda a gente de 5 em 5 minutos.
        if (marca) await supabase.from('configuracoes_sistema').update({ valor: hoje }).is('empresa_id', null).eq('chave', CHAVE_RESUMO);
        else await supabase.from('configuracoes_sistema').insert({ empresa_id: null, chave: CHAVE_RESUMO, valor: hoje });

        if (!parados.length) return false;
        const linhas = parados.map(l => l.estado === 'nunca_ligado'
            ? `• ${l.empresa}: nunca chegou a ligar o WhatsApp.`
            : `• ${l.empresa}${l.numero ? ` (${l.numero})` : ''}: desligado${l.desligadoDesde ? ` desde ${quando(l.desligadoDesde)}` : ''} — última mensagem recebida: ${quando(l.ultimaMensagemRecebida)}.`);
        await this.avisarSuperadmins(
            `Resumo do dia: ${parados.length} cliente(s) sem WhatsApp ligado`,
            `Estes clientes não estão a receber mensagens — nem a automação responde:\n\n${linhas.join('\n')}\n\nPara voltar a ligar, cada empresa tem de ler o código QR em WhatsApp → Gestão de Canais. A lista completa está no painel de super administrador, em "WhatsApp dos clientes".`,
        );
        return true;
    }

    private static async avisarSuperadmins(assunto: string, corpo: string): Promise<void> {
        const { data: donos } = await supabase.from('perfis').select('email, empresa_id').eq('role', 'superadmin').eq('ativo', true);
        const { EmailService } = require('./EmailService');
        for (const d of (donos || []) as any[]) {
            if (!d.email) continue;
            try {
                await EmailService.enviarEmailPersonalizado(d.email, assunto, corpo, d.empresa_id, undefined, { registarNaCaixa: false });
            } catch (e: any) {
                console.error('[Aviso WhatsApp] Email não enviado:', e?.message || e);
            }
        }
    }

    /** Só para os testes. */
    public static libertar(): void { this.aCorrer = false; this.resumoEnviadoEm = null; }
}
