/**
 * Mensagens em que o cliente ESCOLHE em vez de escrever.
 *
 * Até agora um menu era texto: "1 - Preços | 2 - Reservar", e o cliente tinha de
 * escrever "1". Quem escrevia "preços" levava com "Não percebi essa resposta".
 * É atrito a cada passo, e é por isso que os fluxos pareciam burros.
 *
 * O WhatsApp tem três formas de o cliente escolher com um toque, e nem todas
 * estão disponíveis em todo o lado:
 *
 *   BOTÕES     até 3, colados à mensagem. Confirmado a sair no formato moderno
 *              (interactiveMessage/nativeFlowMessage) nesta instalação.
 *   SONDAGEM   até 12 opções. Confirmada a funcionar: o Elves votou numa.
 *   LISTA      o menu que abre numa janela, até 10 opções com descrição. É o
 *              mais bonito e o que o ManyChat usa — mas o `sendList` desta
 *              Evolution (2.3.7) rebenta com "this.isZero is not a function",
 *              um erro de dentro do Baileys, e o `single_select` não passa na
 *              validação dela. Fica escrito e pronto: assim que a instalação
 *              for atualizada, liga-se sozinho.
 *
 * A regra é simples: tenta-se o melhor formato que couber, e se o canal não o
 * aceitar cai-se no seguinte, até ao texto numerado de sempre. Nunca fica pior
 * do que estava — só melhor onde der.
 */
import { supabase } from '../lib/supabaseClient';

export interface OpcaoEscolha {
    /** O que o cliente lê no botão ou na linha do menu. */
    rotulo: string;
    /** Como o fluxo a reconhece depois. Volta no toque. */
    id: string;
    /** Só a lista mostra isto, por baixo do rótulo. */
    descricao?: string;
}

export interface PedidoEscolha {
    empresaId: string;
    channelId: string;
    telefone: string;
    /** A pergunta. */
    texto: string;
    opcoes: OpcaoEscolha[];
    /** Linha pequena por baixo (só botões e lista). */
    rodape?: string;
    /** O texto do botão que abre o menu (só lista). */
    textoDoBotao?: string;
    /** Para o registo e para o ecrã saberem o que foi tentado. */
    titulo?: string;
}

export type Formato = 'botoes' | 'lista' | 'sondagem' | 'texto';

export interface ResultadoEnvio {
    ok: boolean;
    formato: Formato;
    /** Os formatos que falharam antes deste, e porquê. */
    tentativas: { formato: Formato; erro: string }[];
    messageId?: string;
}

/** O que o WhatsApp aceita em cada formato. Passar daqui é recusa certa. */
export const LIMITES = {
    botoes: { opcoes: 3, rotulo: 20 },
    lista: { opcoes: 10, rotulo: 24, descricao: 72 },
    sondagem: { opcoes: 12, rotulo: 100 },
} as const;

export class WhatsAppInterativoService {

    /**
     * O melhor formato para este número de opções.
     *
     * Três ou menos são botões: ficam à vista, sem mais um toque para abrir.
     * Acima disso seria preciso a lista; enquanto ela não funcionar, a sondagem
     * faz o mesmo trabalho — o cliente escolhe sem escrever, que é o que conta.
     */
    public static formatoIdeal(quantas: number, listaDisponivel = false): Formato[] {
        if (quantas <= 0) return ['texto'];
        if (quantas <= LIMITES.botoes.opcoes) return ['botoes', 'sondagem', 'texto'];
        if (quantas <= LIMITES.lista.opcoes && listaDisponivel) return ['lista', 'sondagem', 'texto'];
        if (quantas <= LIMITES.sondagem.opcoes) return ['sondagem', 'lista', 'texto'];
        return ['texto'];
    }

    /** Corta um rótulo ao que o formato aceita, sem o deixar a meio da palavra. */
    public static encurtar(texto: string, max: number): string {
        const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
        if (limpo.length <= max) return limpo;
        const corte = limpo.slice(0, max - 1);
        const espaco = corte.lastIndexOf(' ');
        return (espaco > max * 0.6 ? corte.slice(0, espaco) : corte) + '…';
    }

    /**
     * Envia a pergunta no melhor formato que o canal aceitar.
     *
     * Não atira: devolve o que correu, incluindo o que falhou pelo caminho. Uma
     * pergunta que não sai deixa o cliente à espera, e isso tem de ficar visível
     * a quem for ver, não escondido numa excepção.
     */
    public static async perguntar(p: PedidoEscolha): Promise<ResultadoEnvio> {
        const tentativas: { formato: Formato; erro: string }[] = [];

        const canal = await WhatsAppInterativoService.canal(p.channelId, p.empresaId);
        if (!canal) {
            return { ok: false, formato: 'texto', tentativas: [{ formato: 'texto', erro: 'canal não encontrado' }] };
        }

        for (const formato of WhatsAppInterativoService.formatoIdeal(p.opcoes.length, canal.listaDisponivel)) {
            try {
                const id = await WhatsAppInterativoService.enviarNoFormato(formato, p, canal);
                if (id !== false) {
                    return { ok: true, formato, tentativas, messageId: typeof id === 'string' ? id : undefined };
                }
                tentativas.push({ formato, erro: 'o canal recusou' });
            } catch (e: any) {
                tentativas.push({ formato, erro: String(e?.message || e).slice(0, 180) });
            }
        }

        return { ok: false, formato: 'texto', tentativas };
    }

    /** O canal, e o que ele sabe fazer. */
    private static async canal(channelId: string, empresaId: string): Promise<any> {
        const { data } = await supabase.from('wa_channels')
            .select('id, provider, credentials, status')
            .eq('id', channelId).eq('empresa_id', empresaId).maybeSingle();
        if (!data) return null;

        // A lista só se tenta onde se sabe que funciona. Na Evolution desta
        // instalação não funciona, e tentá-la a cada menu era uma chamada
        // perdida e um erro no log a cada pergunta.
        return { ...data, listaDisponivel: data.provider === 'meta' };
    }

    private static async enviarNoFormato(formato: Formato, p: PedidoEscolha, canal: any): Promise<string | boolean> {
        const { WhatsAppChannelManager } = require('./WhatsAppChannelManager');

        if (formato === 'texto') {
            return WhatsAppChannelManager.sendMessage(
                supabase, p.channelId, p.telefone, WhatsAppInterativoService.comoTexto(p)
            );
        }

        if (canal.provider === 'evolution') {
            return WhatsAppInterativoService.enviarPelaEvolution(formato, p, canal);
        }
        if (canal.provider === 'meta') {
            return WhatsAppInterativoService.enviarPelaMeta(formato, p, canal);
        }
        throw new Error(`provedor desconhecido: ${canal.provider}`);
    }

    /** A pergunta como texto numerado — o que o sistema fazia antes, e a última rede. */
    public static comoTexto(p: PedidoEscolha): string {
        const linhas = p.opcoes.map((o, i) => `${i + 1} - ${o.rotulo}`);
        return [p.texto, '', ...linhas].join('\n');
    }

    // ─────────────────────────────────────────────────────────────
    // Evolution
    // ─────────────────────────────────────────────────────────────

    private static async enviarPelaEvolution(formato: Formato, p: PedidoEscolha, canal: any): Promise<string | boolean> {
        const base = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
        const chave = process.env.AUTHENTICATION_API_KEY || '';
        const instancia = canal.credentials?.instanceName;
        if (!base || !instancia) throw new Error('Evolution sem URL ou sem instância');

        const telefone = String(p.telefone).replace(/\D/g, '');
        const cabecalho = { 'Content-Type': 'application/json', apikey: chave };

        let caminho: string;
        let corpo: any;

        if (formato === 'botoes') {
            caminho = 'sendButtons';
            corpo = {
                number: telefone,
                title: p.titulo || '',
                description: p.texto,
                footer: p.rodape || '',
                buttons: p.opcoes.slice(0, LIMITES.botoes.opcoes).map(o => ({
                    type: 'reply',
                    displayText: WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.botoes.rotulo),
                    id: o.id,
                })),
            };
        } else if (formato === 'sondagem') {
            caminho = 'sendPoll';
            corpo = {
                number: telefone,
                name: p.texto,
                selectableCount: 1,
                // Os rótulos das sondagens não levam id: o voto volta com o
                // TEXTO escolhido, e é por ele que o fluxo o reconhece.
                values: p.opcoes.slice(0, LIMITES.sondagem.opcoes)
                    .map(o => WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.sondagem.rotulo)),
            };
        } else if (formato === 'lista') {
            caminho = 'sendList';
            corpo = {
                number: telefone,
                title: p.titulo || 'Menu',
                description: p.texto,
                buttonText: p.textoDoBotao || 'Ver opções',
                footerText: p.rodape || '',
                sections: [{
                    title: p.titulo || 'Opções',
                    rows: p.opcoes.slice(0, LIMITES.lista.opcoes).map(o => ({
                        title: WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.lista.rotulo),
                        // A Evolution recusa descrições vazias.
                        description: WhatsAppInterativoService.encurtar(o.descricao || o.rotulo, LIMITES.lista.descricao),
                        rowId: o.id,
                    })),
                }],
            };
        } else {
            throw new Error(`formato sem envio: ${formato}`);
        }

        const r = await fetch(`${base}/message/${caminho}/${instancia}`, {
            method: 'POST', headers: cabecalho, body: JSON.stringify(corpo),
        });
        const d: any = await r.json().catch(() => ({}));

        if (r.status >= 300) {
            const detalhe = d?.response?.message || d?.message || `estado ${r.status}`;
            throw new Error(typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe).slice(0, 180));
        }
        return d?.key?.id || true;
    }

    // ─────────────────────────────────────────────────────────────
    // Meta (API oficial)
    // ─────────────────────────────────────────────────────────────

    private static async enviarPelaMeta(formato: Formato, p: PedidoEscolha, canal: any): Promise<string | boolean> {
        const { phoneNumberId, accessToken } = canal.credentials || {};
        if (!phoneNumberId || !accessToken) throw new Error('canal Meta sem credenciais');

        const telefone = String(p.telefone).replace(/\D/g, '');
        let interactive: any;

        if (formato === 'botoes') {
            interactive = {
                type: 'button',
                body: { text: p.texto },
                ...(p.rodape ? { footer: { text: p.rodape } } : {}),
                action: {
                    buttons: p.opcoes.slice(0, LIMITES.botoes.opcoes).map(o => ({
                        type: 'reply',
                        reply: { id: o.id, title: WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.botoes.rotulo) },
                    })),
                },
            };
        } else if (formato === 'lista') {
            interactive = {
                type: 'list',
                body: { text: p.texto },
                ...(p.rodape ? { footer: { text: p.rodape } } : {}),
                action: {
                    button: WhatsAppInterativoService.encurtar(p.textoDoBotao || 'Ver opções', 20),
                    sections: [{
                        title: WhatsAppInterativoService.encurtar(p.titulo || 'Opções', 24),
                        rows: p.opcoes.slice(0, LIMITES.lista.opcoes).map(o => ({
                            id: o.id,
                            title: WhatsAppInterativoService.encurtar(o.rotulo, LIMITES.lista.rotulo),
                            ...(o.descricao ? { description: WhatsAppInterativoService.encurtar(o.descricao, LIMITES.lista.descricao) } : {}),
                        })),
                    }],
                },
            };
        } else {
            // A Meta não tem sondagens. Acima de dez opções é mesmo texto.
            throw new Error('a Meta não envia sondagens');
        }

        const r = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: telefone, type: 'interactive', interactive }),
        });
        const d: any = await r.json().catch(() => ({}));
        if (r.status >= 300) throw new Error(d?.error?.message || `estado ${r.status}`);
        return d?.messages?.[0]?.id || true;
    }
}
