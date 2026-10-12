/**
 * Vários blocos dentro de um só nó.
 *
 * Para mandar três mensagens e uma imagem eram precisos quatro nós ligados por
 * setas, e cada um era um passo do motor. Com blocos é um nó só: o cliente
 * recebe tudo de seguida e o fluxo não é re-disparado a cada passo — que era
 * exactamente a queixa ("não precisar sofrer com vários disparos").
 *
 * O que entra num nó de mensagem é CONTEÚDO: texto, imagem, vídeo, áudio,
 * ficheiro e pausa. O que ramifica o fluxo (Condição) ou mexe em dados
 * (Etiquetas, Notificar Equipa, API) fica de fora de propósito — misturá-lo
 * tornava o cartão impossível de ler, e essas coisas continuam a ser nós
 * próprios, ligados por setas, onde se vêem.
 *
 * Sobre os botões: um botão de LINK ou de CHAMADA não precisa de saída nenhuma
 * no desenho — o cliente sai do WhatsApp e não há para onde o fluxo ir. Já um
 * botão de RESPOSTA precisa de um ramo, e para isso existe o nó de Menu, que é
 * quem sabe esperar pela escolha. Esta separação é o que mantém cada nó com um
 * trabalho só.
 */
import { supabase } from '../lib/supabaseClient';

export type TipoBloco = 'texto' | 'imagem' | 'video' | 'audio' | 'documento' | 'pausa';

/** Botões que não esperam resposta: o cliente sai do WhatsApp ou copia algo. */
export interface BotaoAccao {
    tipo: 'link' | 'chamada' | 'copiar';
    rotulo: string;
    /** O endereço, o número ou o código, conforme o tipo. */
    valor: string;
}

export interface Bloco {
    tipo: TipoBloco;
    /** texto: o que se escreve. média: a legenda. */
    texto?: string;
    /** média: o ficheiro. */
    url?: string;
    nomeDoFicheiro?: string;
    /** pausa. */
    duracao?: number;
    unidade?: string;
    /** texto: até três botões de acção. */
    botoes?: BotaoAccao[];
}

export interface ResultadoBlocos {
    enviados: number;
    falhados: { indice: number; tipo: TipoBloco; erro: string }[];
}

/** O que cada bloco aceita, e o que o painel deve oferecer. */
export const BLOCOS_DISPONIVEIS: { tipo: TipoBloco; nome: string; descricao: string }[] = [
    { tipo: 'texto', nome: 'Texto', descricao: 'Uma mensagem escrita, com botões se quiser.' },
    { tipo: 'imagem', nome: 'Imagem', descricao: 'Uma foto, com legenda.' },
    { tipo: 'video', nome: 'Vídeo', descricao: 'Um vídeo, com legenda.' },
    { tipo: 'audio', nome: 'Áudio', descricao: 'Uma nota de voz.' },
    { tipo: 'documento', nome: 'Documento', descricao: 'Um PDF ou outro ficheiro.' },
    { tipo: 'pausa', nome: 'Pausa', descricao: 'Esperar entre mensagens, para não parecer um robô.' },
];

const POR_UNIDADE: Record<string, number> = { segundos: 1, minutos: 60, horas: 3600, dias: 86400 };

/**
 * Uma pausa DENTRO de um nó serve para dar ritmo entre mensagens — para a
 * conversa não parecer um robô a despejar tudo de uma vez. São segundos.
 *
 * Esperas longas ("volta daqui a 3 horas") são outra coisa e têm o seu nó
 * próprio, o "Aguardar", que as guarda e sobrevive a um reinício. Aqui o
 * processo fica mesmo preso à espera, por isso o tecto é baixo de propósito:
 * meter horas neste sítio prendia o servidor sem ninguém perceber porquê.
 */
export const PAUSA_MAX_SEGUNDOS = 30;

export class BlocosMensagemService {

    /** Esta configuração tem blocos, ou é do tempo em que só havia uma mensagem? */
    public static temBlocos(config: any): boolean {
        return Array.isArray(config?.blocos) && config.blocos.length > 0;
    }

    /**
     * Um nó antigo lido como blocos.
     *
     * Há fluxos gravados com `mensagem` e mais nada. Continuam a abrir e a
     * correr na mesma: são um bloco de texto, só que não o sabiam.
     */
    public static lerBlocos(config: any): Bloco[] {
        if (BlocosMensagemService.temBlocos(config)) {
            return (config.blocos as Bloco[]).filter(b => b && b.tipo);
        }
        const texto = config?.mensagem || config?.message;
        return texto ? [{ tipo: 'texto', texto: String(texto) }] : [];
    }

    public static segundosDaPausa(b: Bloco): number {
        const n = Number(b.duracao);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return Math.round(n * (POR_UNIDADE[String(b.unidade || 'segundos')] ?? 1));
    }

    /**
     * Envia os blocos por ordem.
     *
     * Um bloco que falhe não trava os seguintes: mais vale o cliente receber
     * três das quatro mensagens do que nenhuma. O que falhou fica dito.
     */
    public static async enviar(
        blocos: Bloco[],
        destino: { empresaId: string; channelId: string; telefone: string; conversationId?: string },
        parse: (t: string) => string,
    ): Promise<ResultadoBlocos> {
        const r: ResultadoBlocos = { enviados: 0, falhados: [] };

        for (let i = 0; i < blocos.length; i++) {
            const b = blocos[i];
            try {
                if (b.tipo === 'pausa') {
                    const seg = Math.min(BlocosMensagemService.segundosDaPausa(b), PAUSA_MAX_SEGUNDOS);
                    if (seg > 0) await new Promise(s => setTimeout(s, seg * 1000));
                    r.enviados++;
                    continue;
                }

                const ok = await BlocosMensagemService.enviarUm(b, destino, parse);
                if (ok) r.enviados++;
                else r.falhados.push({ indice: i, tipo: b.tipo, erro: 'o canal recusou' });
            } catch (e: any) {
                r.falhados.push({ indice: i, tipo: b.tipo, erro: String(e?.message || e).slice(0, 180) });
            }
        }

        return r;
    }

    private static async enviarUm(
        b: Bloco,
        destino: { empresaId: string; channelId: string; telefone: string; conversationId?: string },
        parse: (t: string) => string,
    ): Promise<boolean> {
        const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');

        if (b.tipo === 'texto') {
            const texto = parse(b.texto || '');
            if (!texto.trim()) return true;   // um bloco vazio não é um erro, é um bloco por preencher

            const botoes = (b.botoes || []).filter(x => x?.rotulo?.trim() && x?.valor?.trim()).slice(0, 3);
            if (botoes.length === 0) {
                return !!(await WhatsAppChannelManager.sendMessage(supabase, destino.channelId, destino.telefone, texto));
            }

            return BlocosMensagemService.enviarTextoComBotoes(texto, botoes, destino, parse);
        }

        // Média. A legenda passa pelas variáveis como o texto.
        const url = parse(b.url || '');
        if (!url.trim()) return true;
        const legenda = b.texto ? parse(b.texto) : '';

        return !!(await WhatsAppChannelManager.sendMediaMessage(
            supabase, destino.channelId, destino.telefone, url,
            b.nomeDoFicheiro || BlocosMensagemService.nomePorTipo(b.tipo), legenda,
        ));
    }

    private static nomePorTipo(tipo: TipoBloco): string {
        const nomes: Record<string, string> = {
            imagem: 'imagem.jpg', video: 'video.mp4', audio: 'audio.ogg', documento: 'ficheiro.pdf',
        };
        return nomes[tipo] || 'ficheiro';
    }

    /**
     * Texto com botões de acção (link, chamada, copiar).
     *
     * Confirmei na Evolution desta instalação que os três tipos passam e saem
     * no formato moderno — o mesmo que o ManyChat usa.
     */
    private static async enviarTextoComBotoes(
        texto: string,
        botoes: BotaoAccao[],
        destino: { empresaId: string; channelId: string; telefone: string },
        parse: (t: string) => string,
    ): Promise<boolean> {
        const { data: canal } = await supabase.from('wa_channels')
            .select('provider, credentials').eq('id', destino.channelId).eq('empresa_id', destino.empresaId).maybeSingle();
        if (!canal) throw new Error('canal não encontrado');

        if (canal.provider === 'evolution') {
            const base = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
            const instancia = canal.credentials?.instanceName;
            if (!base || !instancia) throw new Error('Evolution sem URL ou sem instância');

            const r = await fetch(`${base}/message/sendButtons/${instancia}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: process.env.AUTHENTICATION_API_KEY || '' },
                body: JSON.stringify({
                    number: String(destino.telefone).replace(/\D/g, ''),
                    title: '',
                    description: texto,
                    footer: '',
                    buttons: botoes.map(x => BlocosMensagemService.botaoEvolution(x, parse)),
                }),
            });
            if (r.status >= 300) {
                const d: any = await r.json().catch(() => ({}));
                const m = d?.response?.message || d?.message || `estado ${r.status}`;
                throw new Error(typeof m === 'string' ? m : JSON.stringify(m).slice(0, 180));
            }
            return true;
        }

        if (canal.provider === 'meta') {
            // A Meta só tem botões de link no formato "cta_url", e um de cada
            // vez. Com mais do que um, ou com tipos que ela não faz, vai o texto
            // com os endereços escritos — melhor do que não ir nada.
            const link = botoes.find(x => x.tipo === 'link');
            if (botoes.length === 1 && link) {
                const { phoneNumberId, accessToken } = canal.credentials || {};
                const r = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        to: String(destino.telefone).replace(/\D/g, ''),
                        type: 'interactive',
                        interactive: {
                            type: 'cta_url',
                            body: { text: texto },
                            action: { name: 'cta_url', parameters: { display_text: parse(link.rotulo).slice(0, 20), url: parse(link.valor) } },
                        },
                    }),
                });
                if (r.status < 300) return true;
            }

            const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');
            return !!(await WhatsAppChannelManager.sendMessage(
                supabase, destino.channelId, destino.telefone,
                BlocosMensagemService.botoesComoTexto(texto, botoes, parse),
            ));
        }

        throw new Error(`provedor desconhecido: ${canal.provider}`);
    }

    private static botaoEvolution(b: BotaoAccao, parse: (t: string) => string): any {
        const rotulo = parse(b.rotulo).slice(0, 20);
        if (b.tipo === 'link') return { type: 'url', displayText: rotulo, url: parse(b.valor) };
        if (b.tipo === 'chamada') return { type: 'call', displayText: rotulo, phoneNumber: parse(b.valor).replace(/\D/g, '') };
        return { type: 'copy', displayText: rotulo, copyCode: parse(b.valor) };
    }

    /** Os botões escritos, para onde eles não existem. */
    public static botoesComoTexto(texto: string, botoes: BotaoAccao[], parse: (t: string) => string): string {
        const linhas = botoes.map(b => {
            const v = parse(b.valor);
            if (b.tipo === 'link') return `${parse(b.rotulo)}: ${v}`;
            if (b.tipo === 'chamada') return `${parse(b.rotulo)}: ${v}`;
            return `${parse(b.rotulo)}: ${v}`;
        });
        return [texto, '', ...linhas].join('\n');
    }
}
